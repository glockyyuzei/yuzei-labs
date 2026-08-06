import { useEffect, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import {
  Play, Square, RotateCcw, Plus, Trash2, Cpu, HardDrive, Users,
  File, Folder, ArrowUp, RefreshCw, Loader2, Puzzle, Clock, ServerCog,
} from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { Tabs } from '@/components/ui/Tabs'
import { Card, CardTitle, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { useAuthStore } from '@/stores/authStore'
import { useNotificationStore } from '@/stores/notificationStore'
import {
  api,
  type HostedServerConfig,
  type ServerStatus,
  type FileEntry,
  type PluginEntry,
  type ScheduledTask,
} from '@/lib/api'
import { cn } from '@/lib/utils'
import { CreateServerWizard } from './components/CreateServerWizard'

const tabs = [
  { id: 'servers', label: 'Servers' },
  { id: 'console', label: 'Console' },
  { id: 'files', label: 'Files' },
  { id: 'players', label: 'Players' },
  { id: 'plugins', label: 'Plugins' },
  { id: 'schedule', label: 'Schedule' },
]

const EDITABLE_EXTENSIONS = ['log', 'txt', 'properties', 'yml', 'yaml', 'json', 'conf', 'cfg', 'toml', 'ini', 'md']

export function SelfHostTool() {
  const [activeTab, setActiveTab] = useState('servers')
  const [servers, setServers] = useState<HostedServerConfig[]>([])
  const [selectedServer, setSelectedServer] = useState<HostedServerConfig | null>(null)
  const [statuses, setStatuses] = useState<Record<string, ServerStatus>>({})
  const [showWizard, setShowWizard] = useState(false)

  const [consoleLog, setConsoleLog] = useState('')
  const [commandInput, setCommandInput] = useState('')

  const [files, setFiles] = useState<FileEntry[]>([])
  const [currentPath, setCurrentPath] = useState('')
  const [editingFile, setEditingFile] = useState<FileEntry | null>(null)
  const [editorContent, setEditorContent] = useState('')
  const [editorLoading, setEditorLoading] = useState(false)
  const [editorSaving, setEditorSaving] = useState(false)

  const [plugins, setPlugins] = useState<PluginEntry[]>([])
  const [rconInput, setRconInput] = useState('')
  const [rconOutput, setRconOutput] = useState('')

  const [tasks, setTasks] = useState<ScheduledTask[]>([])

  const { user } = useAuthStore()
  const toast = useNotificationStore()

  useEffect(() => {
    if (user) {
      api.selfhost.getServers(user.id).then((list) => {
        setServers(list)
        if (list.length > 0) setSelectedServer(list[0])
      }).catch(() => {})
    }
  }, [user])

  // Poll status for every server on the dashboard, not just the selected
  // one, so the Servers tab shows live CPU/RAM/player counts on every card.
  useEffect(() => {
    if (servers.length === 0) return
    const poll = () => {
      servers.forEach((s) => {
        api.selfhost.getStatus(s.id).then((status) => {
          setStatuses((prev) => ({ ...prev, [s.id]: status }))
        }).catch(() => {})
      })
    }
    poll()
    const interval = setInterval(poll, 3000)
    return () => clearInterval(interval)
  }, [servers])

  useEffect(() => {
    if (!selectedServer) return
    setCurrentPath(selectedServer.serverFolder)
    setPlugins([])
  }, [selectedServer])

  useEffect(() => {
    if (!currentPath) return
    api.deploy.listDirectory(currentPath).then(setFiles).catch(() => setFiles([]))
  }, [currentPath])

  useEffect(() => {
    setEditingFile(null)
  }, [selectedServer, currentPath])

  // Live console — identical pattern to Deploy's local servers, since
  // Self-Hosting Panel servers run through exactly the same process
  // infrastructure (see selfhost.rs's spawn_server reuse).
  useEffect(() => {
    if (!selectedServer || activeTab !== 'console') return
    setConsoleLog('')
    let cancelled = false
    let unlisten: (() => void) | undefined
    listen<{ serverId: string; line: string }>('server-console-line', (event) => {
      if (event.payload.serverId !== selectedServer.id) return
      setConsoleLog((log) => (log ? `${log}\n${event.payload.line}` : event.payload.line))
    }).then((fn) => {
      if (cancelled) fn()
      else unlisten = fn
    })
    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [selectedServer, activeTab])

  const serverAction = async (server: HostedServerConfig, action: 'start' | 'stop' | 'restart') => {
    try {
      if (action === 'start') {
        await api.selfhost.startServer(server.id)
        toast.success('Server Started', server.name)
      } else if (action === 'stop') {
        await api.selfhost.stopServer(server.id)
        toast.success('Server Stopped', server.name)
      } else {
        await api.selfhost.stopServer(server.id)
        setTimeout(() => api.selfhost.startServer(server.id), 2000)
        toast.success('Server Restarting', server.name)
      }
      setTimeout(() => {
        api.selfhost.getStatus(server.id).then((s) => setStatuses((prev) => ({ ...prev, [server.id]: s })))
      }, 500)
    } catch (err) {
      toast.error('Action Failed', String(err))
    }
  }

  const deleteServer = async (server: HostedServerConfig) => {
    if (!confirm(`Remove ${server.name} from Yuzei Labs? This won't delete any server files.`)) return
    try {
      await api.selfhost.deleteServer(server.id)
      setServers((s) => s.filter((x) => x.id !== server.id))
      if (selectedServer?.id === server.id) setSelectedServer(null)
      toast.success('Server Removed')
    } catch (err) {
      toast.error('Remove Failed', String(err))
    }
  }

  const sendCommand = async () => {
    if (!selectedServer || !commandInput.trim()) return
    const cmd = commandInput.trim()
    try {
      await api.deploy.sendServerCommand(selectedServer.id, cmd)
      setConsoleLog((log) => `${log}\n> ${cmd}`)
      setCommandInput('')
    } catch (err) {
      toast.error('Command Failed', String(err))
    }
  }

  const isEditableFile = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase()
    return !!ext && EDITABLE_EXTENSIONS.includes(ext)
  }

  const openFile = async (file: FileEntry) => {
    if (!isEditableFile(file.name)) {
      toast.error("Can't Preview This File", 'Only logs, text, and config files can be opened here.')
      return
    }
    setEditingFile(file)
    setEditorLoading(true)
    try {
      const content = await api.deploy.readTextFile(file.path)
      setEditorContent(content)
    } catch (err) {
      toast.error('Could Not Open File', String(err))
      setEditingFile(null)
    } finally {
      setEditorLoading(false)
    }
  }

  const saveFile = async () => {
    if (!editingFile) return
    setEditorSaving(true)
    try {
      await api.deploy.writeTextFile(editingFile.path, editorContent)
      toast.success('File Saved', editingFile.name)
    } catch (err) {
      toast.error('Save Failed', String(err))
    } finally {
      setEditorSaving(false)
    }
  }

  const loadPlugins = async () => {
    if (!selectedServer) return
    const folder = `${selectedServer.serverFolder}/plugins`
    try {
      const list = await api.selfhost.listPlugins(folder)
      if (list.length === 0) {
        const modsFolder = `${selectedServer.serverFolder}/mods`
        setPlugins(await api.selfhost.listPlugins(modsFolder))
      } else {
        setPlugins(list)
      }
    } catch {
      setPlugins([])
    }
  }

  useEffect(() => {
    if (activeTab === 'plugins') loadPlugins()
  }, [activeTab, selectedServer])

  const runRcon = async () => {
    if (!selectedServer?.rconPort || !selectedServer?.rconPassword || !rconInput.trim()) {
      toast.error('RCON Not Configured', 'Set an RCON port and password for this server in Settings first.')
      return
    }
    try {
      const result = await api.selfhost.rconCommand(selectedServer.rconPort, selectedServer.rconPassword, rconInput.trim())
      setRconOutput((log) => `${log}\n> ${rconInput}\n${result}`)
      setRconInput('')
    } catch (err) {
      toast.error('RCON Command Failed', String(err))
    }
  }

  const loadTasks = async () => {
    if (!selectedServer) return
    try {
      setTasks(await api.selfhost.getScheduledTasks(selectedServer.id))
    } catch {
      setTasks([])
    }
  }

  useEffect(() => {
    if (activeTab === 'schedule') loadTasks()
  }, [activeTab, selectedServer])

  const addTask = async (taskType: 'restart' | 'backup') => {
    if (!selectedServer) return
    const interval = prompt(`Run every how many minutes?`, '60')
    if (!interval || isNaN(Number(interval))) return
    try {
      const task = await api.selfhost.saveScheduledTask({
        id: crypto.randomUUID(),
        serverId: selectedServer.id,
        taskType,
        intervalMinutes: Number(interval),
        enabled: true,
        createdAt: new Date().toISOString(),
      })
      setTasks((t) => [...t, task])
    } catch (err) {
      toast.error('Could Not Save Task', String(err))
    }
  }

  const status = selectedServer ? statuses[selectedServer.id] : undefined

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header title="Self-Hosting" subtitle="A first-party control panel for servers you host here" />

      <div className="px-8 pt-2">
        <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
      </div>

      <div className="flex-1 overflow-y-auto p-8 animate-fade-in">
        {activeTab === 'servers' && (
          <div>
            {showWizard ? (
              <CreateServerWizard
                userId={user?.id || ''}
                onCreated={(s) => {
                  setServers((prev) => [s, ...prev])
                  setSelectedServer(s)
                  setShowWizard(false)
                }}
                onCancel={() => setShowWizard(false)}
              />
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm text-[#666]">{servers.length} server{servers.length === 1 ? '' : 's'}</p>
                  <Button onClick={() => setShowWizard(true)}>
                    <Plus className="h-4 w-4" />
                    New Server
                  </Button>
                </div>

                {servers.length === 0 ? (
                  <Card className="text-center py-12">
                    <ServerCog className="h-8 w-8 text-[#333] mx-auto mb-3" />
                    <p className="text-sm text-[#666] mb-4">No self-hosted servers yet.</p>
                    <Button onClick={() => setShowWizard(true)}>
                      <Plus className="h-4 w-4" />
                      Create Your First Server
                    </Button>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {servers.map((s) => {
                      const st = statuses[s.id]
                      const online = st?.status === 'Online'
                      return (
                        <Card
                          key={s.id}
                          hover
                          onClick={() => setSelectedServer(s)}
                          className={cn(selectedServer?.id === s.id && 'border-white/30')}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <CardTitle>{s.name}</CardTitle>
                            <Badge variant={online ? 'success' : 'outline'}>{st?.status || 'Unknown'}</Badge>
                          </div>
                          <p className="text-xs text-[#666] mb-4 capitalize">{s.serverType} · {s.minMemoryMb}–{s.maxMemoryMb}MB</p>

                          {st && (
                            <div className="grid grid-cols-3 gap-2 mb-4">
                              <div className="rounded-lg bg-[#0a0a0a] p-2 border border-[#1a1a1a] text-center">
                                <Cpu className="h-3.5 w-3.5 text-[#666] mx-auto mb-0.5" />
                                <p className="text-xs">{st.cpuUsage.toFixed(0)}%</p>
                              </div>
                              <div className="rounded-lg bg-[#0a0a0a] p-2 border border-[#1a1a1a] text-center">
                                <HardDrive className="h-3.5 w-3.5 text-[#666] mx-auto mb-0.5" />
                                <p className="text-xs">{st.ramUsageMb.toFixed(0)}MB</p>
                              </div>
                              <div className="rounded-lg bg-[#0a0a0a] p-2 border border-[#1a1a1a] text-center">
                                <Users className="h-3.5 w-3.5 text-[#666] mx-auto mb-0.5" />
                                <p className="text-xs">{s.rconPort ? `${st.onlinePlayers}/${st.maxPlayers}` : '—'}</p>
                              </div>
                            </div>
                          )}

                          <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                            <Button size="sm" onClick={() => serverAction(s, 'start')}><Play className="h-3.5 w-3.5" /></Button>
                            <Button size="sm" variant="secondary" onClick={() => serverAction(s, 'restart')}><RotateCcw className="h-3.5 w-3.5" /></Button>
                            <Button size="sm" variant="secondary" onClick={() => serverAction(s, 'stop')}><Square className="h-3.5 w-3.5" /></Button>
                            <Button size="sm" variant="ghost" onClick={() => deleteServer(s)}><Trash2 className="h-3.5 w-3.5" /></Button>
                          </div>
                        </Card>
                      )
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {activeTab !== 'servers' && !selectedServer && (
          <Card className="text-center py-12">
            <p className="text-sm text-[#666]">Select a server on the Servers tab first.</p>
          </Card>
        )}

        {activeTab === 'console' && selectedServer && (
          <Card>
            <div className="flex items-center justify-between mb-4">
              <CardTitle>{selectedServer.name} — Live Console</CardTitle>
              {status && <Badge variant={status.status === 'Online' ? 'success' : 'outline'}>{status.status}</Badge>}
            </div>
            <pre className="h-96 overflow-auto rounded-lg bg-[#0a0a0a] p-4 text-xs font-mono text-[#aaa] border border-[#1a1a1a]">
              {consoleLog || 'Waiting for output…'}
            </pre>
            <div className="mt-3 flex gap-2">
              <Input
                placeholder="Enter command..."
                className="flex-1"
                value={commandInput}
                onChange={(e) => setCommandInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') sendCommand() }}
              />
              <Button onClick={sendCommand} disabled={!commandInput.trim()}>Send</Button>
            </div>
          </Card>
        )}

        {activeTab === 'files' && selectedServer && (
          <Card>
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
                <Button variant="ghost" size="sm" onClick={() => api.deploy.listDirectory(currentPath).then(setFiles)}>
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <p className="text-xs text-[#666] mb-3 truncate">{currentPath}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2 max-h-64 overflow-y-auto">
              {files.map((f) => (
                <button
                  key={f.path}
                  onClick={() => (f.isDir ? setCurrentPath(f.path) : openFile(f))}
                  className="flex items-center gap-2 rounded-lg bg-[#0a0a0a] p-2 border border-[#1a1a1a] hover:border-[#333] text-left text-sm"
                >
                  {f.isDir ? <Folder className="h-4 w-4 text-[#888]" /> : <File className="h-4 w-4 text-[#666]" />}
                  <span className="truncate">{f.name}</span>
                </button>
              ))}
              {files.length === 0 && <p className="text-xs text-[#555] col-span-full py-4 text-center">Empty folder.</p>}
            </div>

            {editingFile && (
              <div className="mt-4 rounded-lg border border-[#262626] bg-[#0a0a0a] p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-[#888] truncate font-mono">{editingFile.path}</p>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={saveFile} disabled={editorLoading || editorSaving} loading={editorSaving}>Save</Button>
                    <Button variant="ghost" size="sm" onClick={() => setEditingFile(null)}>Close</Button>
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
        )}

        {activeTab === 'players' && selectedServer && (
          <Card>
            <CardTitle>Players (via RCON)</CardTitle>
            <CardDescription>
              {selectedServer.rconPort
                ? 'Send raw commands — try "list" for online players, "kick <name>", "ban <name>", or "op <name>".'
                : 'This server has no RCON port/password configured yet. Add one in the server settings to enable player management.'}
            </CardDescription>
            <pre className="mt-4 h-64 overflow-auto rounded-lg bg-[#0a0a0a] p-4 text-xs font-mono text-[#aaa] border border-[#1a1a1a]">
              {rconOutput || 'No commands sent yet.'}
            </pre>
            <div className="mt-3 flex gap-2">
              <Input
                placeholder='e.g. "list" or "kick Steve"'
                className="flex-1"
                value={rconInput}
                onChange={(e) => setRconInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') runRcon() }}
                disabled={!selectedServer.rconPort}
              />
              <Button onClick={runRcon} disabled={!selectedServer.rconPort || !rconInput.trim()}>Send</Button>
            </div>
          </Card>
        )}

        {activeTab === 'plugins' && selectedServer && (
          <Card>
            <div className="flex items-center justify-between mb-4">
              <CardTitle>Plugins / Mods</CardTitle>
              <Button variant="ghost" size="sm" onClick={loadPlugins}><RefreshCw className="h-3.5 w-3.5" /></Button>
            </div>
            {plugins.length === 0 ? (
              <p className="text-sm text-[#666] py-6 text-center">No plugins/mods found in this server's plugins or mods folder.</p>
            ) : (
              <div className="space-y-2">
                {plugins.map((p) => (
                  <div key={p.path} className="flex items-center justify-between rounded-lg bg-[#0a0a0a] p-3 border border-[#1a1a1a]">
                    <div className="flex items-center gap-3 min-w-0">
                      <Puzzle className="h-4 w-4 text-[#666] shrink-0" />
                      <p className="text-sm truncate">{p.name}</p>
                    </div>
                    <Button
                      size="sm"
                      variant={p.enabled ? 'secondary' : 'outline'}
                      onClick={async () => {
                        try {
                          await api.selfhost.togglePlugin(p.path, !p.enabled)
                          loadPlugins()
                        } catch (err) {
                          toast.error('Toggle Failed', String(err))
                        }
                      }}
                    >
                      {p.enabled ? 'Enabled' : 'Disabled'}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {activeTab === 'schedule' && selectedServer && (
          <Card>
            <div className="flex items-center justify-between mb-4">
              <CardTitle>Scheduled Tasks</CardTitle>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => addTask('restart')}>
                  <Clock className="h-3.5 w-3.5" /> Add Restart
                </Button>
                <Button size="sm" variant="outline" onClick={() => addTask('backup')}>
                  <Clock className="h-3.5 w-3.5" /> Add Backup
                </Button>
              </div>
            </div>
            <CardDescription>
              Tasks only run while Yuzei Labs is open — there's no OS-level scheduler behind this.
            </CardDescription>
            {tasks.length === 0 ? (
              <p className="text-sm text-[#666] py-6 text-center">No scheduled tasks yet.</p>
            ) : (
              <div className="mt-4 space-y-2">
                {tasks.map((t) => (
                  <div key={t.id} className="flex items-center justify-between rounded-lg bg-[#0a0a0a] p-3 border border-[#1a1a1a]">
                    <div>
                      <p className="text-sm capitalize">{t.taskType}</p>
                      <p className="text-xs text-[#666]">Every {t.intervalMinutes} minutes</p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        await api.selfhost.deleteScheduledTask(t.id)
                        setTasks((prev) => prev.filter((x) => x.id !== t.id))
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  )
}