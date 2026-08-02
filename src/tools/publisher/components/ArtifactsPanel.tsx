import { useEffect, useRef, useState } from 'react'
import {
  Copy, ExternalLink, FileText, FolderOpen, MoreVertical, Trash2,
} from 'lucide-react'
import { Card, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { api, type ArtifactInfo } from '@/lib/api'
import { formatBytes } from '@/lib/utils'
import { useNotificationStore } from '@/stores/notificationStore'

interface ArtifactsPanelProps {
  artifacts: ArtifactInfo[]
  onRefresh: () => void
}

export function ArtifactsPanel({ artifacts, onRefresh }: ArtifactsPanelProps) {
  const toast = useNotificationStore()
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  const handleDelete = async (art: ArtifactInfo) => {
    if (!confirm(`Delete ${art.filename}? This can't be undone.`)) return
    try {
      await api.publisher.deleteArtifact(art.id)
      toast.success('Artifact Deleted', art.filename)
      onRefresh()
    } catch (err) {
      toast.error('Delete Failed', String(err))
    }
  }

  const handleRename = async (art: ArtifactInfo) => {
    const newName = prompt('Rename artifact:', art.filename)
    if (!newName || newName === art.filename) return
    try {
      await api.publisher.renameArtifact(art.id, newName)
      toast.success('Artifact Renamed')
      onRefresh()
    } catch (err) {
      toast.error('Rename Failed', String(err))
    }
  }

  const handleOpenFolder = async (art: ArtifactInfo) => {
    try {
      await api.publisher.openFolder(art.filePath)
    } catch (err) {
      toast.error('Could Not Open Folder', String(err))
    }
  }

  return (
    <Card>
      <CardTitle>Generated Files</CardTitle>
      <div className="mt-4 space-y-2">
        {artifacts.length === 0 ? (
          <p className="text-sm text-[#666] py-6 text-center">No artifacts yet. Run a build to generate files.</p>
        ) : (
          artifacts.map((art) => (
            <div
              key={art.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', art.filePath)
                e.dataTransfer.effectAllowed = 'copy'
              }}
              className="flex items-center justify-between rounded-lg bg-[#0a0a0a] p-3 border border-[#1a1a1a] hover:border-[#333] transition-colors group"
            >
              <div className="flex items-center gap-3 min-w-0">
                <FileText className="h-4 w-4 text-[#666] shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{art.filename}</p>
                  <p className="text-xs text-[#666]">
                    {art.version && `v${art.version} · `}
                    {formatBytes(art.sizeBytes)} · {new Date(art.buildTime).toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Badge variant="success">{art.status}</Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  title="Open Folder"
                  onClick={() => handleOpenFolder(art)}
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  title="Reveal in Explorer"
                  onClick={() => api.publisher.revealInExplorer(art.filePath).catch((err) => toast.error('Could Not Reveal File', String(err)))}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>
                <div className="relative" ref={menuOpen === art.id ? menuRef : undefined}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setMenuOpen(menuOpen === art.id ? null : art.id)}
                  >
                    <MoreVertical className="h-3.5 w-3.5" />
                  </Button>
                  {menuOpen === art.id && (
                    <div className="absolute right-0 top-full mt-1 z-10 min-w-[160px] rounded-lg border border-[#333] bg-[#111] py-1 shadow-xl">
                      {[
                        { label: 'Copy Path', icon: Copy, action: () => {
                          navigator.clipboard.writeText(art.filePath)
                          toast.success('Path Copied')
                        } },
                        { label: 'Rename', action: () => handleRename(art) },
                        { label: 'Delete', danger: true, icon: Trash2, action: () => handleDelete(art) },
                      ].map(({ label, action, danger }) => (
                        <button
                          key={label}
                          onClick={() => { action(); setMenuOpen(null) }}
                          className={`w-full px-3 py-1.5 text-left text-xs hover:bg-[#1a1a1a] ${danger ? 'text-red-400 hover:text-red-300' : 'text-[#ccc] hover:text-white'}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  )
}
