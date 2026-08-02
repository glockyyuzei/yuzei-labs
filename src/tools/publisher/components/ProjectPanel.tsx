import { useState } from 'react'
import { Check, ChevronDown, ExternalLink, FolderOpen, GitBranch } from 'lucide-react'
import { Card, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import type { DetectedIde, LastBuildInfo, ProjectInfo } from '@/lib/api'
import { timeAgo } from '@/lib/utils'

interface ProjectPanelProps {
  project: ProjectInfo
  lastBuildInfo: LastBuildInfo | null
  buildStatus?: string
  preferredIde: string
  detectedIdes: DetectedIde[]
  onOpenInIde: () => void
  onSelectIde: (ideId: string) => void
  onOpenWorkspace: () => void
}

export function ProjectPanel({
  project,
  lastBuildInfo,
  buildStatus,
  preferredIde,
  detectedIdes,
  onOpenInIde,
  onSelectIde,
  onOpenWorkspace,
}: ProjectPanelProps) {
  const [ideMenuOpen, setIdeMenuOpen] = useState(false)
  const ideLabels: Record<string, string> = {
    intellij: 'IntelliJ IDEA',
    eclipse: 'Eclipse IDE',
    vscode: 'Visual Studio Code',
  }

  const statusVariant = buildStatus?.includes('SUCCESS')
    ? 'success'
    : buildStatus?.includes('FAILED')
      ? 'error'
      : 'outline'

  const rows = [
    { label: 'Project', value: project.name },
    { label: 'Type', value: project.projectType },
    { label: 'Workspace', value: project.workspacePath, mono: true },
    { label: 'Git Branch', value: project.gitBranch || '—', icon: GitBranch },
    { label: 'Java Version', value: project.javaVersion },
    { label: 'Gradle Version', value: project.gradleVersion },
    { label: 'Current Version', value: project.version },
    {
      label: 'Last Build',
      value: lastBuildInfo?.lastBuild ? timeAgo(lastBuildInfo.lastBuild) : 'Never',
    },
    {
      label: 'Last Publish',
      value: lastBuildInfo?.lastPublish ? timeAgo(lastBuildInfo.lastPublish) : 'Never',
    },
  ]

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <CardTitle>Current Project</CardTitle>
        <div className="flex items-center gap-2">
          {buildStatus && (
            <Badge variant={statusVariant as 'success' | 'error' | 'outline'}>
              {buildStatus}
            </Badge>
          )}
          <div className="relative flex items-center">
            <Button variant="outline" size="sm" onClick={onOpenInIde} className="rounded-r-none border-r-0">
              <ExternalLink className="h-3.5 w-3.5" />
              Open in {ideLabels[preferredIde] || 'IDE'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="rounded-l-none px-2"
              onClick={() => setIdeMenuOpen((v) => !v)}
              title="Choose IDE"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
            {ideMenuOpen && (
              <div className="absolute right-0 top-full mt-1 z-10 min-w-[220px] rounded-lg border border-[#333] bg-[#111] py-1 shadow-xl">
                {(detectedIdes.length > 0
                  ? detectedIdes
                  : Object.entries(ideLabels).map(([id, name]) => ({ id, name, found: false }))
                ).map((ide) => (
                  <button
                    key={ide.id}
                    onClick={() => {
                      onSelectIde(ide.id)
                      setIdeMenuOpen(false)
                    }}
                    className="w-full flex items-center justify-between gap-3 px-3 py-1.5 text-left text-xs text-[#ccc] hover:bg-[#1a1a1a] hover:text-white"
                  >
                    <span className="flex items-center gap-2">
                      {ide.id === preferredIde && <Check className="h-3 w-3 text-white shrink-0" />}
                      {ide.name}
                    </span>
                    <span className={ide.found ? 'text-green-400' : 'text-[#555]'}>
                      {ide.found ? 'Detected' : 'Not found'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={onOpenWorkspace}>
            <FolderOpen className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div className="mt-4 space-y-2.5">
        {rows.map(({ label, value, mono, icon: Icon }) => (
          <div key={label} className="flex justify-between gap-4 text-sm">
            <span className="text-[#666] shrink-0">{label}</span>
            <span
              className={`text-white font-medium text-right truncate flex items-center gap-1.5 justify-end ${mono ? 'font-mono text-xs' : ''}`}
              title={value}
            >
              {Icon && <Icon className="h-3.5 w-3.5 text-[#666] shrink-0" />}
              {value}
            </span>
          </div>
        ))}
      </div>
    </Card>
  )
}
