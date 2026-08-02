import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight, CheckCircle, Clock, FolderOpen, GitBranch, Package, Plus, XCircle,
} from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { Card, CardDescription, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { toolRegistry } from '@/core/registry/ToolRegistry'
import { useAuthStore } from '@/stores/authStore'
import { usePublisherStore } from '@/tools/publisher/stores/publisherStore'
import { api, type ActivityEntry, type RecentWorkspace } from '@/lib/api'
import { timeAgo, APP_VERSION } from '@/lib/utils'

const UPCOMING_TOOLS = [
  { id: 'utilities', name: 'Utilities', description: 'Handy helpers for everyday project tasks.', icon: Package },
  { id: 'database', name: 'Database', description: 'Inspect and manage server databases directly.', icon: Package },
]

export function DashboardPage() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const tools = toolRegistry.getAll()
  const [activity, setActivity] = useState<ActivityEntry[]>([])
  const [workspaces, setWorkspaces] = useState<RecentWorkspace[]>([])
  const project = usePublisherStore((s) => s.project)
  const lastBuildInfo = usePublisherStore((s) => s.lastBuildInfo)
  const lastBuild = usePublisherStore((s) => s.lastBuild)
  const building = usePublisherStore((s) => s.building)
  const openWorkspace = usePublisherStore((s) => s.openWorkspace)

  useEffect(() => {
    if (!user) return
    api.activity.get(user.id).then(setActivity).catch(() => {})
    api.publisher.getRecentWorkspaces(user.id).then(setWorkspaces).catch(() => {})
  }, [user])

  const launchTool = async (toolId: string) => {
    if (user) {
      await api.activity.recordTool(user.id, toolId)
      await api.activity.log(user.id, `Launched ${toolId}`, toolId)
    }
    navigate(`/tools/${toolId}`)
  }

  const handleOpenWorkspace = async () => {
    if (!user) return
    try {
      await openWorkspace(user.id)
    } catch {
      // Errors are already surfaced via toast in the publisher store
    }
  }

  const publisherTool = tools.find((t) => t.id === 'publisher')
  const otherTools = tools.filter((t) => t.id !== 'publisher')

  const buildStatus = building ? 'RUNNING' : lastBuild?.status || lastBuildInfo?.lastBuildStatus
  const statusVariant = building
    ? 'outline'
    : buildStatus?.includes('SUCCESS')
      ? 'success'
      : buildStatus?.includes('FAILED')
        ? 'error'
        : 'outline'

  const overviewRows = project
    ? [
        { label: 'Project', value: project.name },
        { label: 'Workspace', value: project.workspacePath, mono: true },
        { label: 'Git Branch', value: project.gitBranch || '—', icon: GitBranch },
        { label: 'Version', value: project.version },
        { label: 'Java', value: project.javaVersion },
        { label: 'Gradle', value: project.gradleVersion },
        {
          label: 'Last Build',
          value: lastBuildInfo?.lastBuild ? timeAgo(lastBuildInfo.lastBuild) : 'Never',
        },
        {
          label: 'Last Publish',
          value: lastBuildInfo?.lastPublish ? timeAgo(lastBuildInfo.lastPublish) : 'Never',
        },
      ]
    : []

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header
        title="Dashboard"
        subtitle={`Welcome back, ${user?.username}. Build. Publish. Ship. All in one place.`}
      />

      <div className="flex-1 overflow-y-auto p-8 space-y-8 animate-fade-in">
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-[#888] uppercase tracking-wider">Project Overview</h2>
            {buildStatus && (
              <Badge variant={statusVariant as 'success' | 'error' | 'outline'}>
                {buildStatus}
              </Badge>
            )}
          </div>
          <Card>
            {project ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4">
                {overviewRows.map(({ label, value, mono, icon: Icon }) => (
                  <div key={label} className="min-w-0">
                    <p className="text-xs text-[#666] mb-1">{label}</p>
                    <p
                      className={`text-sm font-medium text-white truncate flex items-center gap-1.5 ${mono ? 'font-mono text-xs' : ''}`}
                      title={value}
                    >
                      {Icon && <Icon className="h-3.5 w-3.5 text-[#666] shrink-0" />}
                      {value}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <FolderOpen className="h-8 w-8 text-[#444] mb-3" />
                <p className="text-sm text-[#888] mb-1">No workspace loaded</p>
                <p className="text-xs text-[#555] mb-4">
                  Open a project or set a default workspace in Settings.
                </p>
                <Button variant="outline" size="sm" onClick={handleOpenWorkspace}>
                  <FolderOpen className="h-3.5 w-3.5" />
                  Open Workspace
                </Button>
              </div>
            )}
          </Card>
        </section>

        {publisherTool && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-medium text-[#888] uppercase tracking-wider">Publisher</h2>
              <div className="flex items-center gap-2 text-xs text-[#666]">
                <CheckCircle className="h-3.5 w-3.5 text-green-400" />
                v{publisherTool.version} — You're up to date
              </div>
            </div>
            <Card hover className="group max-w-3xl">
              <div className="flex items-start gap-6">
                <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-[#1a1a1a] border border-[#333]">
                  <Package className="h-8 w-8 text-white" strokeWidth={1.5} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <CardTitle>Publisher</CardTitle>
                    <Badge variant="success">Installed</Badge>
                  </div>
                  <CardDescription>
                    Build and publish your Java projects with ease — mods, plugins, and more.
                  </CardDescription>
                  <div className="mt-4">
                    <Button
                      onClick={() => launchTool('publisher')}
                      className="group-hover:bg-neutral-200"
                    >
                      Launch Publisher
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          </section>
        )}

        {otherTools.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-medium text-[#888] uppercase tracking-wider">Tools</h2>
              <Badge variant="outline">v{APP_VERSION}</Badge>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {otherTools.map((tool) => (
                <Card key={tool.id} hover className="group">
                  <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#1a1a1a] border border-[#333]">
                      <tool.icon className="h-5 w-5 text-white" strokeWidth={1.5} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <CardTitle>{tool.name}</CardTitle>
                        <Badge variant="success">Installed</Badge>
                      </div>
                      <CardDescription>{tool.description}</CardDescription>
                      <div className="mt-4">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => launchTool(tool.id)}
                        >
                          Launch
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </section>
        )}

        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-[#888] uppercase tracking-wider">Coming Soon</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {UPCOMING_TOOLS.map((tool) => (
              <Card key={tool.id} className="opacity-50 cursor-not-allowed">
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#1a1a1a] border border-[#333]">
                    <tool.icon className="h-5 w-5 text-[#666]" strokeWidth={1.5} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <CardTitle>{tool.name}</CardTitle>
                      <Badge variant="outline">Coming Soon</Badge>
                    </div>
                    <CardDescription>{tool.description}</CardDescription>
                  </div>
                </div>
              </Card>
            ))}
            <Card className="border-dashed flex items-center justify-center min-h-[100px] opacity-40">
              <div className="text-center">
                <Plus className="h-5 w-5 text-[#444] mx-auto mb-1.5" />
                <p className="text-xs text-[#666]">More Tools Coming Soon</p>
              </div>
            </Card>
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section>
            <h2 className="text-sm font-medium text-[#888] uppercase tracking-wider mb-4">
              Recent Projects
            </h2>
            <Card>
              {workspaces.length === 0 ? (
                <p className="text-sm text-[#666] py-4 text-center">
                  No recent workspaces. Open a project in Publisher.
                </p>
              ) : (
                <div className="space-y-3">
                  {workspaces.map((ws) => (
                    <div
                      key={ws.path}
                      className="flex items-center justify-between rounded-lg bg-[#0a0a0a] p-3 border border-[#1a1a1a] cursor-pointer hover:border-[#333] transition-colors"
                      onClick={() => launchTool('publisher')}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{ws.name}</p>
                        <p className="text-xs text-[#666] truncate">{ws.path}</p>
                      </div>
                      <Badge variant="outline">{ws.projectType}</Badge>
                      <span className="text-xs text-[#555] ml-2 shrink-0">{timeAgo(ws.openedAt)}</span>
                    </div>
                  ))}
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                className="w-full mt-4"
                onClick={() => launchTool('publisher')}
              >
                <FolderOpen className="h-3.5 w-3.5" />
                Open Workspace
              </Button>
            </Card>
          </section>

          <section>
            <h2 className="text-sm font-medium text-[#888] uppercase tracking-wider mb-4">
              Recent Activity
            </h2>
            <Card>
              {activity.length === 0 ? (
                <p className="text-sm text-[#666] py-4 text-center">No recent activity</p>
              ) : (
                <div className="space-y-3">
                  {activity.slice(0, 8).map((entry) => (
                    <div key={entry.id} className="flex items-start gap-3">
                      {entry.message.toLowerCase().includes('fail') ? (
                        <XCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                      ) : entry.message.toLowerCase().includes('complet') ? (
                        <CheckCircle className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                      ) : (
                        <Clock className="h-4 w-4 text-[#666] mt-0.5 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white">{entry.message}</p>
                        <p className="text-xs text-[#666]">{timeAgo(entry.createdAt)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </section>
        </div>
      </div>
    </div>
  )
}
