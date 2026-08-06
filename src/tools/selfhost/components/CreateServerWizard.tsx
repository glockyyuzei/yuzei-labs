import { useState } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { FolderOpen, Loader2 } from 'lucide-react'
import { Card, CardTitle, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { api, type DetectedJar, type HostedServerConfig } from '@/lib/api'
import { useNotificationStore } from '@/stores/notificationStore'

interface CreateServerWizardProps {
  userId: string
  onCreated: (server: HostedServerConfig) => void
  onCancel: () => void
}

export function CreateServerWizard({ userId, onCreated, onCancel }: CreateServerWizardProps) {
  const toast = useNotificationStore()
  const [folder, setFolder] = useState('')
  const [detecting, setDetecting] = useState(false)
  const [detected, setDetected] = useState<DetectedJar[]>([])
  const [selectedJar, setSelectedJar] = useState('')
  const [name, setName] = useState('')
  const [javaPath, setJavaPath] = useState('')
  const [minMemory, setMinMemory] = useState(1024)
  const [maxMemory, setMaxMemory] = useState(2048)
  const [extraArgs, setExtraArgs] = useState('')
  const [creating, setCreating] = useState(false)

  const pickFolder = async () => {
    const picked = await open({ directory: true })
    if (!picked) return
    const folderPath = picked as string
    setFolder(folderPath)
    setName(folderPath.split(/[/\\]/).pop() || 'My Server')
    setDetecting(true)
    try {
      const jars = await api.selfhost.detectJar(folderPath)
      setDetected(jars)
      if (jars.length > 0) setSelectedJar(jars[0].path)
    } catch (err) {
      toast.error('Scan Failed', String(err))
    } finally {
      setDetecting(false)
    }
  }

  const create = async () => {
    if (!folder || !selectedJar || !name.trim()) {
      toast.error('Fill In Required Fields', 'Folder, jar, and name are all required.')
      return
    }
    setCreating(true)
    try {
      const scriptPath = await api.selfhost.generateStartupScript({
        serverFolder: folder,
        jarPath: selectedJar,
        javaPath: javaPath || undefined,
        minMemoryMb: minMemory,
        maxMemoryMb: maxMemory,
        extraJvmArgs: extraArgs || undefined,
      })

      const id = await api.deploy.createServerId()
      const matchedType = detected.find((j) => j.path === selectedJar)?.serverType || 'unknown'

      const server: HostedServerConfig = {
        id,
        name: name.trim(),
        serverFolder: folder,
        serverType: matchedType,
        jarPath: selectedJar,
        javaPath: javaPath || undefined,
        minMemoryMb: minMemory,
        maxMemoryMb: maxMemory,
        extraJvmArgs: extraArgs || undefined,
        startupScriptPath: scriptPath,
        createdAt: new Date().toISOString(),
      }

      const saved = await api.selfhost.saveServer(userId, server)
      toast.success('Server Created', name)
      onCreated(saved)
    } catch (err) {
      toast.error('Creation Failed', String(err))
    } finally {
      setCreating(false)
    }
  }

  return (
    <Card className="max-w-2xl">
      <CardTitle>New Self-Hosted Server</CardTitle>
      <CardDescription>Point at a server folder — Yuzei Labs will look for a jar and set up a startup script.</CardDescription>

      <div className="mt-5 space-y-4">
        <div>
          <label className="block text-sm text-[#888] mb-2">Server Folder</label>
          <div className="flex gap-2">
            <Input value={folder} readOnly placeholder="Choose a folder…" className="flex-1" />
            <Button variant="outline" onClick={pickFolder}>
              <FolderOpen className="h-4 w-4" />
              Browse
            </Button>
          </div>
        </div>

        {detecting && (
          <div className="flex items-center gap-2 text-sm text-[#888]">
            <Loader2 className="h-4 w-4 animate-spin" /> Scanning for server jars…
          </div>
        )}

        {!detecting && folder && (
          <div>
            <label className="block text-sm text-[#888] mb-2">Server Jar</label>
            {detected.length === 0 ? (
              <p className="text-xs text-[#666]">
                No jar found automatically in that folder — place your server jar there and re-browse,
                or this will need to be set manually once support for that is added.
              </p>
            ) : (
              <select
                value={selectedJar}
                onChange={(e) => setSelectedJar(e.target.value)}
                className="w-full rounded-lg border border-[#333] bg-[#111] px-4 py-2.5 text-sm text-white"
              >
                {detected.map((jar) => (
                  <option key={jar.path} value={jar.path}>
                    {jar.filename} — guessed: {jar.serverType} ({jar.confidence}% confidence)
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        <Input label="Server Name" value={name} onChange={(e) => setName(e.target.value)} />

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Min Memory (MB)"
            type="number"
            value={minMemory}
            onChange={(e) => setMinMemory(Number(e.target.value))}
          />
          <Input
            label="Max Memory (MB)"
            type="number"
            value={maxMemory}
            onChange={(e) => setMaxMemory(Number(e.target.value))}
          />
        </div>

        <Input
          label="Java Path (optional — blank uses system default)"
          value={javaPath}
          onChange={(e) => setJavaPath(e.target.value)}
          placeholder="C:\Program Files\Java\jdk-17\bin\java.exe"
        />

        <Input
          label="Extra JVM Args (optional)"
          value={extraArgs}
          onChange={(e) => setExtraArgs(e.target.value)}
          placeholder="-XX:+UseG1GC"
        />

        <div className="flex gap-3 pt-2">
          <Button onClick={create} loading={creating} disabled={!folder || !selectedJar}>
            Create Server
          </Button>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        </div>
      </div>
    </Card>
  )
}