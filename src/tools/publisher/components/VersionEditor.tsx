import { useEffect, useState } from 'react'
import { ChevronDown, History, Save } from 'lucide-react'
import { Card, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { api, type VersionHistoryEntry } from '@/lib/api'

interface VersionEditorProps {
  version: string
  developer: string
  buildNumber: string
  projectPath?: string
  onVersionChange: (v: string) => void
  onDeveloperChange: (v: string) => void
  onBuildNumberChange: (v: string) => void
  onSave: () => void
}

export function VersionEditor({
  version,
  developer,
  buildNumber,
  projectPath,
  onVersionChange,
  onDeveloperChange,
  onBuildNumberChange,
  onSave,
}: VersionEditorProps) {
  const [showHistory, setShowHistory] = useState(false)
  const [history, setHistory] = useState<VersionHistoryEntry[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    // Reset so switching projects doesn't show stale history until reopened.
    setLoaded(false)
    setHistory([])
  }, [projectPath])

  const toggleHistory = async () => {
    const next = !showHistory
    setShowHistory(next)
    if (next && !loaded && projectPath) {
      try {
        const entries = await api.publisher.getVersionHistory(projectPath)
        setHistory(entries)
      } catch {
        setHistory([])
      } finally {
        setLoaded(true)
      }
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between gap-4">
        <CardTitle>Version Management</CardTitle>
        <div className="flex items-center gap-2">
          {projectPath && (
            <Button variant="ghost" size="sm" onClick={toggleHistory}>
              <History className="h-3.5 w-3.5" />
              History
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showHistory ? 'rotate-180' : ''}`} />
            </Button>
          )}
          <Button size="sm" onClick={onSave}>
            <Save className="h-3.5 w-3.5" />
            Apply to Project
          </Button>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Input
          label="Project Version"
          value={version}
          onChange={(e) => onVersionChange(e.target.value)}
          placeholder="1.0.0"
        />
        <Input
          label="Developer Name"
          value={developer}
          onChange={(e) => onDeveloperChange(e.target.value)}
          placeholder="Glockyyuzei"
        />
        <Input
          label="Build Number (optional)"
          value={buildNumber}
          onChange={(e) => onBuildNumberChange(e.target.value)}
          placeholder="42"
        />
      </div>

      {showHistory && (
        <div className="mt-4 rounded-lg border border-[#1a1a1a] bg-[#0a0a0a] overflow-hidden">
          {!loaded ? (
            <p className="text-sm text-[#666] p-4 text-center">Loading…</p>
          ) : history.length === 0 ? (
            <p className="text-sm text-[#666] p-4 text-center">No version history yet for this project.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-[#666] uppercase tracking-wider border-b border-[#1a1a1a]">
                  <th className="text-left font-medium px-4 py-2">Version</th>
                  <th className="text-left font-medium px-4 py-2">Developer</th>
                  <th className="text-left font-medium px-4 py-2">Build #</th>
                  <th className="text-left font-medium px-4 py-2">When</th>
                </tr>
              </thead>
              <tbody>
                {history.map((entry, i) => (
                  <tr key={`${entry.version}-${entry.createdAt}-${i}`} className="border-b border-[#141414] last:border-0">
                    <td className="px-4 py-2 font-mono text-white">{entry.version}</td>
                    <td className="px-4 py-2 text-[#aaa]">{entry.developer || '—'}</td>
                    <td className="px-4 py-2 text-[#aaa]">{entry.buildNumber || '—'}</td>
                    <td className="px-4 py-2 text-[#666]">{new Date(entry.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </Card>
  )
}