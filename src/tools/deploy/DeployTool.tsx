import { useEffect, useState, useRef } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { listen } from '@tauri-apps/api/event'
import {
  Server, Play, Square, RotateCcw, FolderOpen,
  Upload, Plus, Trash2, File, Folder, ArrowUp, RefreshCw,
  HardDrive, Cpu, Globe, HardDriveDownload, Loader2, FileEdit,
} from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { Tabs } from '@/components/ui/Tabs'
import { Button } from '@/components/ui/Button'
import { Card, CardDescription, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { StatusBar } from '@/components/ui/StatusBar'
import { Input } from '@/components/ui/Input'
import { useAuthStore } from '@/stores/authStore'
import { useNotificationStore } from '@/stores/notificationStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { api, type DeploymentProfile, type DeployProfileConfig, type ServerConfig, type ServerStatus, type FileEntry, type DeployHistoryEntry } from '@/lib/api'
import { cn } from '@/lib/utils'

interface PteroConfig {
  serverType: 'pterodactyl'
  pterodactylServerId: string
  node?: string
}

function pteroConfig(server: ServerConfig | null): PteroConfig | null {
  const c = server?.config as Partial<PteroConfig> | undefined
  return c?.serverType === 'pterodactyl' && c.pterodactylServerId
    ? (c as PteroConfig)
    : null
}

/**
 * Safely reads a deployment profile's freeform config into a typed shape
 * instead of blindly casting to Record<string, string> — old profiles may
 * have autoBackup/autoRestart stored as the strings 'true'/'false' (from
 * before this was a real boolean), so both forms are accepted on read.
 */
function normalizeDeployConfig(raw: Record<string, unknown>): DeployProfileConfig {
  const asString = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)
  const asBool = (v: unknown, fallback: boolean): boolean => {
    if (typeof v === 'boolean') return v
    if (typeof v === 'string') return v === 'true'
    return fallback
  }
  return {
    artifactPath: asString(raw.artifactPath),
    targetFolder: asString(raw.targetFolder),
    serverId: asString(raw.serverId),
    autoBackup: asBool(raw.autoBackup, true),
    autoRestart: asBool(raw.autoRestart, false),
  }
}

const tabs = [
  { id: 'profiles', label: 'Profiles' },
  { id: 'servers', label: 'Servers' },
  { id: 'history', label: 'Deploy History' },
  { id: 'watch', label: 'Live Monitoring' },
]

const EDITABLE_EXTENSIONS = ['log', 'txt', 'properties', 'yml', 'yaml', 'json', 'conf', 'cfg', 'toml', 'ini', 'md']

export function DeployTool() {
  const [activeTab, setActiveTab] = useState('profiles')
  const [profiles, setProfiles] = useState<DeploymentProfile[]>([])
  const [servers, setServers] = useState<ServerConfig[]>([])
  const [selectedProfile, setSelectedProfile] = useState<DeploymentProfile | null>(null)
  const [selectedServer, setSelectedServer] = useState<ServerConfig | null>(null)
  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null)
  const [files, setFiles] = useState<FileEntry[]>([])
  const [currentPath, setCurrentPath] = useState('')
  const [consoleLog, setConsoleLog] = useState('')
  const [deploying, setDeploying] = useState(false)
  const [lastDeploy, setLastDeploy] = useState<string | null>(null)
  const [watchMode, setWatchMode] = useState(false)
  const [commandInput, setCommandInput] = useState('')
  const [sendingCommand, setSendingCommand] = useState(false)
  const [deployHistory, setDeployHistory] = useState<DeployHistoryEntry[]>([])
  const [editingFile, setEditingFile] = useState<FileEntry | null>(null)
  const [editorContent, setEditorContent] = useState('')
  const [editorLoading, setEditorLoading] = useState(false)
  const [editorSaving, setEditorSaving] = useState(false)
  const [liveConnected, setLiveConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const [pteroCandidates, setPteroCandidates] = useState<
    { identifier: string; name: string; node: string; description: string }[] | null
  >(null)
  const [connectingPtero, setConnectingPtero] = useState(false)
  const { user } = useAuthStore()
  const toast = useNotificationStore()
  const pteroUrl = useSettingsStore((s) => s.get('deploy.pterodactylUrl'))
  const pteroKey = useSettingsStore((s) => s.get('deploy.pterodactylKey'))

  useEffect(() => {
    if (user) {
      api.deploy.getProfiles(user.id).then(setProfiles).catch(() => {})
      api.deploy.getServers(user.id).then((s) => {
        setServers(s)
        if (s.length > 0) setSelectedServer(s[0])
      }).catch(() => {})
      api.deploy.getDeployHistory(user.id).then(setDeployHistory).catch(() => {})
    }
  }, [user])

  useEffect(() => {
    if (!selectedServer) return
    const ptero = pteroConfig(selectedServer)
    if (ptero) {
      api.pterodactyl
        .getStatus(pteroUrl, pteroKey, ptero.pterodactylServerId, selectedServer.name)
        .then(setServerStatus)
        .catch(() => setServerStatus(null))
      setCurrentPath('/')
    } else {
      api.deploy.getServerStatus(selectedServer).then(setServerStatus).catch(() => {})
      setCurrentPath(selectedServer.serverFolder)
    }
  }, [selectedServer, pteroUrl, pteroKey])

  useEffect(() => {
    if (!currentPath || !selectedServer) return
    const ptero = pteroConfig(selectedServer)
    if (ptero) {
      api.pterodactyl
        .listFiles(pteroUrl, pteroKey, ptero.pterodactylServerId, currentPath)
        .then(setFiles)
        .catch(() => setFiles([]))
    } else {
      api.deploy.listDirectory(currentPath).then(setFiles).catch(() => setFiles([]))
    }
  }, [currentPath, selectedServer, pteroUrl, pteroKey])

  useEffect(() => {
    setEditingFile(null)
  }, [selectedServer, currentPath])

  // Stats still have to be polled — there's no push mechanism for CPU/RAM.
  useEffect(() => {
    if (!selectedServer || !watchMode) return
    const ptero = pteroConfig(selectedServer)
    const interval = setInterval(() => {
      if (ptero) {
        api.pterodactyl
          .getStatus(pteroUrl, pteroKey, ptero.pterodactylServerId, selectedServer.name)
          .then(setServerStatus)
          .catch(() => {})
      } else {
        api.deploy.getServerStatus(selectedServer).then(setServerStatus)
      }
    }, 2000)
    return () => clearInterval(interval)
  }, [selectedServer, watchMode, pteroUrl, pteroKey])

  // Real live console: local servers push lines via Tauri events as they're
  // produced (see start_server's reader threads); remote servers stream
  // over the panel's own console websocket. Neither of these poll.
  useEffect(() => {
    if (!selectedServer || !watchMode) {
      setLiveConnected(false)
      return
    }
    setConsoleLog('')
    const ptero = pteroConfig(selectedServer)
    let cancelled = false

    if (!ptero) {
      let unlisten: (() => void) | undefined
      listen<{ serverId: string; line: string }>('server-console-line', (event) => {
        if (event.payload.serverId !== selectedServer.id) return
        setConsoleLog((log) => (log ? `${log}\n${event.payload.line}` : event.payload.line))
      }).then((fn) => {
        if (cancelled) {
          fn()
        } else {
          unlisten = fn
          setLiveConnected(true)
        }
      })
      return () => {
        cancelled = true
        unlisten?.()
      }
    }

    let closedByUs = false
    const connect = async () => {
      try {
        const creds = await api.pterodactyl.getConsoleCredentials(pteroUrl, pteroKey, ptero.pterodactylServerId)
        if (cancelled) return
        const socket = new WebSocket(creds.socket)
        wsRef.current = socket

        socket.onopen = () => {
          socket.send(JSON.stringify({ event: 'auth', args: [creds.token] }))
        }
        socket.onmessage = (msg) => {
          try {
            const parsed = JSON.parse(msg.data)
            if (parsed.event === 'auth success') {
              setLiveConnected(true)
            } else if (parsed.event === 'console output') {
              const line = parsed.args?.[0] ?? ''
              setConsoleLog((log) => (log ? `${log}\n${line}` : line))
            } else if (parsed.event === 'token expiring' || parsed.event === 'token expired') {
              closedByUs = true
              socket.close()
              if (!cancelled) connect()
            }
          } catch {
            // Non-JSON frame — ignore rather than crash the console.
          }
        }
        socket.onerror = () => setLiveConnected(false)
        socket.onclose = () => {
          setLiveConnected(false)
          if (!closedByUs && !cancelled) {
            setTimeout(() => { if (!cancelled) connect() }, 3000)
          }
        }
      } catch (err) {
        if (!cancelled) toast.error('Console Connection Failed', String(err))
      }
    }
    connect()

    return () => {
      cancelled = true
      closedByUs = true
      wsRef.current?.close()
      wsRef.current = null
      setLiveConnected(false)
    }
  }, [selectedServer, watchMode, pteroUrl, pteroKey])

  const addProfile = async () => {
    if (!user) return
    const id = await api.deploy.createProfileId()
    const profile: DeploymentProfile = {
      id,
      name: 'New Profile',
      targetType: 'local-folder',
      config: { targetFolder: '', autoBackup: true, autoRestart: false },
      createdAt: new Date().toISOString(),
    }
    await api.deploy.saveProfile(user.id, profile)
    setProfiles((p) => [...p, profile])
    setSelectedProfile(profile)
  }

  const addServer = async () => {
    const folder = await open({ directory: true })
    if (!folder || !user) return
    const id = await api.deploy.createServerId()
    const server: ServerConfig = {
      id,
      name: folder.toString().split(/[/\\]/).pop() || 'Server',
      serverFolder: folder as string,
      modsFolder: `${folder}/mods`,
      pluginsFolder: `${folder}/plugins`,
      javaVersion: '17',
      startupScript: 'start.bat',
      workingDirectory: folder as string,
      config: {},
      createdAt: new Date().toISOString(),
    }
    await api.deploy.saveServer(user.id, server)
    setServers((s) => [...s, server])
    setSelectedServer(server)
    toast.success('Server Registered')
  }

  const browsePterodactylServers = async () => {
    if (!pteroUrl || !pteroKey) {
      toast.error(
        'Pterodactyl Not Configured',
        'Set Panel URL and API Key in Settings → Deploy first.',
      )
      return
    }
    setConnectingPtero(true)
    try {
      const list = await api.pterodactyl.listServers(pteroUrl, pteroKey)
      if (list.length === 0) {
        toast.error('No Servers Found', 'That API key has no accessible servers.')
        return
      }
      setPteroCandidates(list)
    } catch (err) {
      toast.error('Could Not Connect', String(err))
    } finally {
      setConnectingPtero(false)
    }
  }

  const addPterodactylServer = async (candidate: { identifier: string; name: string; node: string }) => {
    if (!user) return
    const id = await api.deploy.createServerId()
    const server: ServerConfig = {
      id,
      name: candidate.name,
      serverFolder: '/',
      config: { serverType: 'pterodactyl', pterodactylServerId: candidate.identifier, node: candidate.node },
      createdAt: new Date().toISOString(),
    }
    await api.deploy.saveServer(user.id, server)
    setServers((s) => [...s, server])
    setSelectedServer(server)
    setPteroCandidates(null)
    toast.success('Pterodactyl Server Connected', candidate.name)
  }

  const isEditableFile = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase()
    return !!ext && EDITABLE_EXTENSIONS.includes(ext)
  }

  const openFileInEditor = async (file: FileEntry) => {
    if (!selectedServer) return
    if (!isEditableFile(file.name)) {
      toast.error('Can\'t Preview This File', 'Only logs, text, and config files can be opened here.')
      return
    }
    setEditingFile(file)
    setEditorLoading(true)
    setEditorContent('')
    try {
      const ptero = pteroConfig(selectedServer)
      const content = ptero
        ? await api.pterodactyl.readFile(pteroUrl, pteroKey, ptero.pterodactylServerId, file.path)
        : await api.deploy.readTextFile(file.path)
      setEditorContent(content)
    } catch (err) {
      toast.error('Could Not Open File', String(err))
      setEditingFile(null)
    } finally {
      setEditorLoading(false)
    }
  }

  const saveEditingFile = async () => {
    if (!editingFile || !selectedServer) return
    setEditorSaving(true)
    try {
      const ptero = pteroConfig(selectedServer)
      if (ptero) {
        await api.pterodactyl.writeFile(pteroUrl, pteroKey, ptero.pterodactylServerId, editingFile.path, editorContent)
      } else {
        await api.deploy.writeTextFile(editingFile.path, editorContent)
      }
      toast.success('File Saved', editingFile.name)
    } catch (err) {
      toast.error('Save Failed', String(err))
    } finally {
      setEditorSaving(false)
    }
  }

  const sendCommandToServer = async () => {
    if (!selectedServer || !commandInput.trim()) return
    const command = commandInput.trim()
    const ptero = pteroConfig(selectedServer)
    setSendingCommand(true)
    try {
      if (ptero) {
        await api.pterodactyl.sendCommand(pteroUrl, pteroKey, ptero.pterodactylServerId, command)
      } else {
        await api.deploy.sendServerCommand(selectedServer.id, command)
      }
      setConsoleLog((log) => `${log}\n> ${command}`)
      setCommandInput('')
    } catch (err) {
      toast.error('Command Failed', String(err))
    } finally {
      setSendingCommand(false)
    }
  }

  const deploy = async () => {
    if (!selectedProfile || !user) return
    setDeploying(true)
    toast.info('Deploy Started')
    try {
      const config = normalizeDeployConfig(selectedProfile.config)
      const artifactPath = config.artifactPath
      const targetFolder = config.targetFolder
      if (!artifactPath || !targetFolder) {
        toast.error('Configure artifact and target folder in profile')
        return
      }
      const targetServer = servers.find((s) => s.id === config.serverId)
      const ptero = pteroConfig(targetServer ?? null)

      if (ptero) {
        await api.pterodactyl.deployArtifact(
          user.id,
          targetServer?.name || 'Pterodactyl Server',
          pteroUrl,
          pteroKey,
          ptero.pterodactylServerId,
          artifactPath,
          targetFolder,
        )
        setLastDeploy(`Uploaded to ${targetServer?.name} (${targetFolder})`)
        toast.success('Deploy Finished', `Uploaded to ${targetServer?.name}`)
      } else {
        const result = await api.deploy.deploy(
          user.id,
          artifactPath,
          targetFolder,
          config.autoBackup,
          config.autoRestart,
          config.serverId,
          targetServer?.name || 'Local Folder',
        )
        setLastDeploy(result.message)
        toast.success('Deploy Finished', result.message)
      }
      await api.activity.log(user.id, `Deployed to ${targetFolder}`, 'deploy')
      api.deploy.getDeployHistory(user.id).then(setDeployHistory).catch(() => {})
    } catch (err) {
      toast.error('Deploy Failed', String(err))
    } finally {
      setDeploying(false)
    }
  }

  const serverAction = async (action: 'start' | 'stop' | 'restart') => {
    if (!selectedServer) return
    const ptero = pteroConfig(selectedServer)
    try {
      if (ptero) {
        const signal = action === 'start' ? 'start' : action === 'stop' ? 'stop' : 'restart'
        await api.pterodactyl.powerAction(pteroUrl, pteroKey, ptero.pterodactylServerId, signal)
        toast.success(`Server ${action === 'start' ? 'Started' : action === 'stop' ? 'Stopped' : 'Restarted'}`)
        const status = await api.pterodactyl.getStatus(
          pteroUrl,
          pteroKey,
          ptero.pterodactylServerId,
          selectedServer.name,
        )
        setServerStatus(status)
        return
      }
      if (action === 'start') {
        await api.deploy.startServer(selectedServer)
        toast.success('Server Started')
      } else if (action === 'stop') {
        await api.deploy.stopServer(selectedServer.id)
        toast.success('Server Stopped')
      } else {
        await api.deploy.stopServer(selectedServer.id)
        setTimeout(() => api.deploy.startServer(selectedServer), 2000)
        toast.success('Server Restarted')
      }
      const status = await api.deploy.getServerStatus(selectedServer)
      setServerStatus(status)
    } catch (err) {
      toast.error('Server Action Failed', String(err))
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header title="Deploy" subtitle="Automate deployment and testing" />

      <div className="px-8 pt-2">
        <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
      </div>

      <div className="flex-1 overflow-y-auto p-8 animate-fade-in">
        {activeTab === 'profiles' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-1">
              <div className="flex items-center justify-between mb-4">
                <CardTitle>Deployment Profiles</CardTitle>
                <Button variant="ghost" size="sm" onClick={addProfile}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="space-y-2">
                {profiles.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedProfile(p)}
                    className={cn(
                      'w-full text-left rounded-lg p-3 border transition-colors',
                      selectedProfile?.id === p.id
                        ? 'border-white/20 bg-[#1a1a1a]'
                        : 'border-[#1a1a1a] bg-[#0a0a0a] hover:border-[#333]',
                    )}
                  >
                    <p className="text-sm font-medium">{p.name}</p>
                    <p className="text-xs text-[#666]">{p.targetType}</p>
                  </button>
                ))}
                {profiles.length === 0 && (
                  <p className="text-sm text-[#666] text-center py-4">No profiles yet</p>
                )}
              </div>
            </Card>

            <Card className="lg:col-span-2">
              {selectedProfile ? (() => {
                const cfg = normalizeDeployConfig(selectedProfile.config)
                return (
                <>
                  <CardTitle>{selectedProfile.name}</CardTitle>
                  <div className="mt-4 space-y-4">
                    <Input
                      label="Profile Name"
                      value={selectedProfile.name}
                      onChange={(e) => setSelectedProfile({ ...selectedProfile, name: e.target.value })}
                    />
                    <div>
                      <label className="block text-sm text-[#888] mb-2">Target Type</label>
                      <select
                        value={selectedProfile.targetType}
                        onChange={(e) => setSelectedProfile({ ...selectedProfile, targetType: e.target.value })}
                        className="w-full rounded-lg border border-[#333] bg-[#111] px-4 py-2.5 text-sm text-white"
                      >
                        <option value="local-folder">Local Folder</option>
                        <option value="minecraft-mods">Minecraft Client Mods</option>
                        <option value="minecraft-plugins">Minecraft Client Plugins</option>
                        <option value="self-hosted">Self Hosted Server</option>
                        <option value="remote-sftp">Remote SFTP</option>
                        <option value="remote-ftp">Remote FTP</option>
                        <option value="pterodactyl">Pterodactyl Panel</option>
                        <option value="external-hosting">External Hosting</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm text-[#888] mb-2">Target Server</label>
                      <select
                        value={cfg.serverId || ''}
                        onChange={(e) =>
                          setSelectedProfile({
                            ...selectedProfile,
                            config: { ...selectedProfile.config, serverId: e.target.value },
                          })
                        }
                        className="w-full rounded-lg border border-[#333] bg-[#111] px-4 py-2.5 text-sm text-white"
                      >
                        <option value="">None (copy to folder only)</option>
                        {servers.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}{pteroConfig(s) ? ' (Pterodactyl)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <Input
                      label="Target Folder"
                      placeholder={
                        pteroConfig(servers.find((s) => s.id === cfg.serverId) ?? null)
                          ? '/  (absolute path on the remote server)'
                          : 'C:\\path\\to\\folder'
                      }
                      value={cfg.targetFolder || ''}
                      onChange={(e) =>
                        setSelectedProfile({
                          ...selectedProfile,
                          config: { ...selectedProfile.config, targetFolder: e.target.value },
                        })
                      }
                    />
                    <Input
                      label="Artifact Path"
                      value={cfg.artifactPath || ''}
                      onChange={(e) =>
                        setSelectedProfile({
                          ...selectedProfile,
                          config: { ...selectedProfile.config, artifactPath: e.target.value },
                        })
                      }
                    />
                    <div className="flex flex-wrap gap-6">
                      <label className="flex items-center gap-2 text-sm text-[#888] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={cfg.autoBackup}
                          onChange={(e) =>
                            setSelectedProfile({
                              ...selectedProfile,
                              config: { ...selectedProfile.config, autoBackup: e.target.checked },
                            })
                          }
                          className="rounded border-[#333]"
                        />
                        Back up existing file before deploying
                      </label>
                      <label className="flex items-center gap-2 text-sm text-[#888] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={cfg.autoRestart}
                          onChange={(e) =>
                            setSelectedProfile({
                              ...selectedProfile,
                              config: { ...selectedProfile.config, autoRestart: e.target.checked },
                            })
                          }
                          className="rounded border-[#333]"
                        />
                        Restart server after deploying
                      </label>
                    </div>
                    <div className="flex gap-3">
                      <Button onClick={() => user && api.deploy.saveProfile(user.id, selectedProfile)}>Save Profile</Button>
                      <Button onClick={deploy} loading={deploying}>
                        <Upload className="h-4 w-4" />
                        Deploy
                      </Button>
                      <Button
                        variant="danger"
                        onClick={() => api.deploy.deleteProfile(selectedProfile.id).then(() => {
                          setProfiles((p) => p.filter((x) => x.id !== selectedProfile.id))
                          setSelectedProfile(null)
                        })}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </>
                )
              })() : (
                <div className="text-center py-8">
                  <CardDescription>Select or create a deployment profile</CardDescription>
                </div>
              )}
            </Card>
          </div>
        )}

        {activeTab === 'servers' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card>
              <div className="flex items-center justify-between mb-4">
                <CardTitle>Servers</CardTitle>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={addServer} title="Add local folder server">
                    <FolderOpen className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={browsePterodactylServers}
                    disabled={connectingPtero}
                    title="Connect a Pterodactyl-hosted server"
                  >
                    {connectingPtero ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              {pteroCandidates && (
                <div className="mb-4 space-y-1.5 rounded-lg border border-[#1a1a1a] bg-[#0a0a0a] p-2">
                  <div className="flex items-center justify-between px-1 pb-1">
                    <p className="text-xs text-[#666]">Pick a server from your panel</p>
                    <button onClick={() => setPteroCandidates(null)} className="text-xs text-[#666] hover:text-white">
                      Cancel
                    </button>
                  </div>
                  {pteroCandidates.map((c) => (
                    <button
                      key={c.identifier}
                      onClick={() => addPterodactylServer(c)}
                      className="w-full text-left rounded-md px-2 py-1.5 text-sm hover:bg-[#1a1a1a] flex items-center gap-2"
                    >
                      <Globe className="h-3.5 w-3.5 text-[#666] shrink-0" />
                      <span className="truncate">{c.name}</span>
                      {c.node && <span className="ml-auto text-xs text-[#555] shrink-0">{c.node}</span>}
                    </button>
                  ))}
                </div>
              )}

              <div className="space-y-2">
                {servers.map((s) => {
                  const ptero = pteroConfig(s)
                  return (
                    <button
                      key={s.id}
                      onClick={() => setSelectedServer(s)}
                      className={cn(
                        'w-full text-left rounded-lg p-3 border transition-colors',
                        selectedServer?.id === s.id
                          ? 'border-white/20 bg-[#1a1a1a]'
                          : 'border-[#1a1a1a] bg-[#0a0a0a] hover:border-[#333]',
                      )}
                    >
                      <div className="flex items-center gap-2">
                        {ptero ? (
                          <Globe className="h-4 w-4 text-[#666]" />
                        ) : (
                          <Server className="h-4 w-4 text-[#666]" />
                        )}
                        <p className="text-sm font-medium truncate">{s.name}</p>
                        {ptero && (
                          <Badge variant="outline" className="ml-auto shrink-0 text-[10px]">
                            Remote
                          </Badge>
                        )}
                      </div>
                    </button>
                  )
                })}
                {servers.length === 0 && (
                  <p className="text-xs text-[#555] px-1">
                    No servers yet. Add a local folder or connect a Pterodactyl server above.
                  </p>
                )}
              </div>
            </Card>

            {selectedServer && (
              <>
                <Card className="lg:col-span-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>{selectedServer.name}</CardTitle>
                      <Badge
                        variant={
                          serverStatus?.status === 'RUNNING' || serverStatus?.status === 'Online'
                            ? 'success'
                            : 'outline'
                        }
                        className="mt-2"
                      >
                        {serverStatus?.status || 'Unknown'}
                      </Badge>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    {(pteroConfig(selectedServer)
                      ? [
                          ['Type', 'Pterodactyl (Remote)'],
                          ['Panel', pteroUrl.replace(/^https?:\/\//, '') || 'Not configured'],
                          ['Node', pteroConfig(selectedServer)?.node || '—'],
                          ['Server ID', pteroConfig(selectedServer)?.pterodactylServerId || '—'],
                        ]
                      : [
                          ['Type', 'Self Hosted Server'],
                          ['Address', '127.0.0.1'],
                          ['Folder', selectedServer.serverFolder],
                          ['Java', selectedServer.javaVersion || '17'],
                        ]
                    ).map(([k, v]) => (
                      <div key={k}>
                        <span className="text-[#666]">{k}: </span>
                        <span className="text-white truncate">{v}</span>
                      </div>
                    ))}
                  </div>

                  {serverStatus && (
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      {[
                        { icon: Cpu, label: 'CPU', value: `${serverStatus.cpuUsage.toFixed(0)}%` },
                        { icon: HardDrive, label: 'RAM', value: serverStatus.ramTotalMb > 0
                            ? `${serverStatus.ramUsageMb.toFixed(0)}/${serverStatus.ramTotalMb.toFixed(0)} MB`
                            : `${serverStatus.ramUsageMb.toFixed(0)} MB` },
                      ].map(({ icon: Icon, label, value }) => (
                        <div key={label} className="rounded-lg bg-[#0a0a0a] p-3 border border-[#1a1a1a] text-center">
                          <Icon className="h-4 w-4 text-[#666] mx-auto mb-1" />
                          <p className="text-xs text-[#666]">{label}</p>
                          <p className="text-sm font-medium">{value}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => serverAction('start')}><Play className="h-3.5 w-3.5" /> Start</Button>
                    <Button size="sm" variant="secondary" onClick={() => serverAction('restart')}><RotateCcw className="h-3.5 w-3.5" /> Restart</Button>
                    <Button size="sm" variant="secondary" onClick={() => serverAction('stop')}><Square className="h-3.5 w-3.5" /> Stop</Button>
                    {pteroConfig(selectedServer) ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const ptero = pteroConfig(selectedServer)
                          if (!ptero) return
                          api.pterodactyl
                            .createBackup(pteroUrl, pteroKey, ptero.pterodactylServerId)
                            .then((name) => toast.success('Backup Started', name))
                            .catch((err) => toast.error('Backup Failed', String(err)))
                        }}
                      >
                        <HardDriveDownload className="h-3.5 w-3.5" /> Backup
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => api.deploy.backupServer(selectedServer.serverFolder).then((p) => toast.success('Backup Created', p))}>
                        <HardDriveDownload className="h-3.5 w-3.5" /> Backup
                      </Button>
                    )}
                  </div>
                </Card>

                <Card className="lg:col-span-3">
                  <div className="flex items-center justify-between mb-4">
                    <CardTitle>File Manager</CardTitle>
                    <div className="flex gap-2">
                      {currentPath !== selectedServer.serverFolder && (
                        <Button variant="ghost" size="sm" onClick={() => {
                          const parent = currentPath.replace(/[/\\][^/\\]+$/, '')
                          setCurrentPath(parent || selectedServer.serverFolder)
                        }}>
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const ptero = pteroConfig(selectedServer)
                          if (ptero) {
                            api.pterodactyl
                              .listFiles(pteroUrl, pteroKey, ptero.pterodactylServerId, currentPath)
                              .then(setFiles)
                          } else {
                            api.deploy.listDirectory(currentPath).then(setFiles)
                          }
                        }}
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-[#666] mb-3 truncate">{currentPath}</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2 max-h-48 overflow-y-auto">
                    {files.map((f) => (
                      <button
                        key={f.path}
                        onClick={() => (f.isDir ? setCurrentPath(f.path) : openFileInEditor(f))}
                        className="flex items-center gap-2 rounded-lg bg-[#0a0a0a] p-2 border border-[#1a1a1a] hover:border-[#333] text-left text-sm"
                      >
                        {f.isDir ? (
                          <Folder className="h-4 w-4 text-[#888]" />
                        ) : isEditableFile(f.name) ? (
                          <FileEdit className="h-4 w-4 text-[#666]" />
                        ) : (
                          <File className="h-4 w-4 text-[#666]" />
                        )}
                        <span className="truncate">{f.name}</span>
                      </button>
                    ))}
                    {files.length === 0 && (
                      <p className="text-xs text-[#555] col-span-full py-4 text-center">Empty folder.</p>
                    )}
                  </div>

                  {editingFile && (
                    <div className="mt-4 rounded-lg border border-[#262626] bg-[#0a0a0a] p-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs text-[#888] truncate font-mono">{editingFile.path}</p>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={saveEditingFile}
                            disabled={editorLoading || editorSaving}
                            loading={editorSaving}
                          >
                            Save
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setEditingFile(null)}>
                            Close
                          </Button>
                        </div>
                      </div>
                      {editorLoading ? (
                        <div className="h-64 flex items-center justify-center text-[#555] text-sm">
                          <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
                        </div>
                      ) : (
                        <textarea
                          value={editorContent}
                          onChange={(e) => setEditorContent(e.target.value)}
                          spellCheck={false}
                          className="w-full h-64 rounded-md bg-[#111] border border-[#262626] p-3 text-xs font-mono text-[#ddd] resize-y focus:outline-none focus:border-[#444]"
                        />
                      )}
                    </div>
                  )}
                </Card>

                <Card className="lg:col-span-3">
                  <div className="flex items-center justify-between mb-4">
                    <CardTitle>Live Console</CardTitle>
                    {watchMode && (
                      <span className={cn('flex items-center gap-1.5 text-xs', liveConnected ? 'text-green-400' : 'text-amber-400')}>
                        <span className={cn('h-1.5 w-1.5 rounded-full', liveConnected ? 'bg-green-400' : 'bg-amber-400 animate-pulse')} />
                        {liveConnected ? 'Live' : 'Connecting…'}
                      </span>
                    )}
                  </div>
                  <pre className="h-48 overflow-auto rounded-lg bg-[#0a0a0a] p-4 text-xs font-mono text-[#aaa] border border-[#1a1a1a]">
                    {consoleLog || (watchMode
                      ? 'Waiting for output…'
                      : 'Enable Live Monitoring (in the Live Monitoring tab) to stream this server\'s console.')}
                  </pre>
                  <div className="mt-3 flex gap-2">
                    <Input
                      placeholder="Enter command..."
                      className="flex-1"
                      value={commandInput}
                      onChange={(e) => setCommandInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') sendCommandToServer()
                      }}
                    />
                    <Button size="sm" onClick={sendCommandToServer} disabled={sendingCommand || !commandInput.trim()}>
                      Send
                    </Button>
                  </div>
                </Card>
              </>
            )}
          </div>
        )}

        {activeTab === 'watch' && (
          <Card className="max-w-2xl">
            <CardTitle>Live Monitoring</CardTitle>
            <CardDescription>
              Stream the selected server's console in real time and poll its CPU/RAM every 2s.
              Select a server on the Servers tab first, then enable this here.
            </CardDescription>
            <label className="flex items-center gap-2 text-sm text-[#888] mt-6">
              <input
                type="checkbox"
                checked={watchMode}
                onChange={(e) => setWatchMode(e.target.checked)}
                className="rounded border-[#333]"
                disabled={!selectedServer}
              />
              Enable Live Monitoring{selectedServer ? ` for ${selectedServer.name}` : ''}
            </label>
            {!selectedServer && (
              <p className="text-sm text-[#666] mt-4">Select a server on the Servers tab first.</p>
            )}
            {watchMode && (
              <p className={cn('text-sm mt-4 flex items-center gap-2', liveConnected ? 'text-green-400' : 'text-amber-400')}>
                <span className={cn('h-1.5 w-1.5 rounded-full', liveConnected ? 'bg-green-400' : 'bg-amber-400 animate-pulse')} />
                {liveConnected ? 'Live — connected' : 'Connecting…'}
              </p>
            )}
          </Card>
        )}

        {activeTab === 'history' && (
          <Card>
            <CardTitle>Deploy History</CardTitle>
            <div className="mt-4 space-y-2">
              {deployHistory.length === 0 ? (
                <p className="text-sm text-[#666] py-6 text-center">
                  No deployments yet. Deploy a build to see history here.
                </p>
              ) : (
                deployHistory.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between rounded-lg bg-[#0a0a0a] p-3 border border-[#1a1a1a]"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{entry.artifactName}</p>
                      <p className="text-xs text-[#666] truncate">
                        {entry.serverName} · {entry.targetFolder} · {new Date(entry.createdAt).toLocaleString()}
                      </p>
                      {entry.status === 'FAILED' && entry.message && (
                        <p className="text-xs text-red-400 mt-1 truncate">{entry.message}</p>
                      )}
                    </div>
                    <Badge variant={entry.status === 'SUCCESS' ? 'success' : 'error'}>{entry.status}</Badge>
                  </div>
                ))
              )}
            </div>
          </Card>
        )}
      </div>

      {lastDeploy && (
        <StatusBar
          items={[
            { label: 'Last Deploy', value: 'SUCCESS', variant: 'success' },
          ]}
          action={
            <Button variant="outline" size="sm">View Details</Button>
          }
        />
      )}
    </div>
  )
}