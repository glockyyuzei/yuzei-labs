import { useEffect, useMemo, useState } from 'react'
import { History as HistoryIcon, Search } from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { Card, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { useAuthStore } from '@/stores/authStore'
import { usePublisherStore } from '@/tools/publisher/stores/publisherStore'
import { api, type DeployHistoryEntry } from '@/lib/api'
import { formatDuration, timeAgo } from '@/lib/utils'

const STATUS_FILTERS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'success', label: 'Success' },
  { value: 'failed', label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' },
]

const TYPE_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'build', label: 'Builds' },
  { value: 'deploy', label: 'Deploys' },
]

interface UnifiedEntry {
  id: string
  type: 'build' | 'deploy'
  title: string
  subtitle: string
  status: string
  statusVariant: 'success' | 'error' | 'outline'
  duration: string
  createdAt: string
}

export function HistoryPage() {
  const { user } = useAuthStore()
  const { history: buildHistory, refreshHistory } = usePublisherStore()
  const [deployHistory, setDeployHistory] = useState<DeployHistoryEntry[]>([])
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')

  useEffect(() => {
    if (!user) return
    const timer = setTimeout(() => {
      refreshHistory(user.id, query, statusFilter)
    }, 300)
    return () => clearTimeout(timer)
  }, [user, query, statusFilter, refreshHistory])

  useEffect(() => {
    if (!user) return
    api.deploy.getDeployHistory(user.id).then(setDeployHistory).catch(() => {})
  }, [user])

  const unified: UnifiedEntry[] = useMemo(() => {
    const builds: UnifiedEntry[] = buildHistory.map((entry) => ({
      id: `build-${entry.id}`,
      type: 'build',
      title: entry.projectName,
      subtitle: `${entry.task}${entry.version ? ` · v${entry.version}` : ''}`,
      status: entry.status.replace('BUILD ', ''),
      statusVariant: entry.status.includes('SUCCESS')
        ? 'success'
        : entry.status.includes('CANCELLED')
          ? 'outline'
          : 'error',
      duration: entry.durationMs ? formatDuration(entry.durationMs) : '—',
      createdAt: entry.createdAt,
    }))

    const deploys: UnifiedEntry[] = deployHistory
      .filter((entry) =>
        !query || entry.artifactName.toLowerCase().includes(query.toLowerCase()) ||
        entry.serverName.toLowerCase().includes(query.toLowerCase()),
      )
      .filter((entry) => {
        if (statusFilter === 'all') return true
        if (statusFilter === 'success') return entry.status === 'SUCCESS'
        if (statusFilter === 'failed') return entry.status === 'FAILED'
        return false
      })
      .map((entry) => ({
        id: `deploy-${entry.id}`,
        type: 'deploy' as const,
        title: entry.artifactName,
        subtitle: `Deployed to ${entry.serverName} · ${entry.targetFolder}`,
        status: entry.status,
        statusVariant: (entry.status === 'SUCCESS' ? 'success' : 'error') as 'success' | 'error',
        duration: '—',
        createdAt: entry.createdAt,
      }))

    const combined = typeFilter === 'build' ? builds : typeFilter === 'deploy' ? deploys : [...builds, ...deploys]
    return combined.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [buildHistory, deployHistory, query, statusFilter, typeFilter])

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header title="History" subtitle="Every build and deploy, in one place" />

      <div className="flex-1 overflow-y-auto p-6 lg:p-8 animate-fade-in">
        <Card className="max-w-5xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <CardTitle>Activity</CardTitle>
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 sm:w-56">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#555]" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search..."
                  className="w-full rounded-lg border border-[#333] bg-[#0a0a0a] py-2 pl-9 pr-3 text-sm text-white placeholder:text-[#555] focus:outline-none focus:border-[#555]"
                />
              </div>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="rounded-lg border border-[#333] bg-[#111] px-3 py-2 text-sm text-white"
              >
                {TYPE_FILTERS.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg border border-[#333] bg-[#111] px-3 py-2 text-sm text-white"
              >
                {STATUS_FILTERS.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
            </div>
          </div>

          {unified.length === 0 ? (
            <div className="text-center py-16">
              <HistoryIcon className="h-10 w-10 text-[#333] mx-auto mb-3" />
              <p className="text-sm text-[#666]">No history yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="hidden sm:grid grid-cols-7 gap-4 px-3 py-2 text-xs text-[#666] uppercase tracking-wider border-b border-[#1a1a1a]">
                <span className="col-span-3">Item</span>
                <span>Type</span>
                <span>Duration</span>
                <span className="col-span-2">Status</span>
              </div>
              {unified.map((entry) => (
                <div
                  key={entry.id}
                  className="grid grid-cols-1 sm:grid-cols-7 gap-2 sm:gap-4 items-center rounded-lg bg-[#0a0a0a] p-3 border border-[#1a1a1a] hover:border-[#333] transition-colors"
                >
                  <div className="sm:col-span-3 min-w-0">
                    <p className="text-sm font-medium truncate">{entry.title}</p>
                    <p className="text-xs text-[#666] truncate">{entry.subtitle}</p>
                    <p className="text-xs text-[#555] sm:hidden">{timeAgo(entry.createdAt)}</p>
                  </div>
                  <span className="text-sm text-[#888] capitalize">{entry.type}</span>
                  <span className="text-sm text-[#666]">{entry.duration}</span>
                  <div className="col-span-2 flex items-center justify-between sm:justify-start gap-2">
                    <Badge variant={entry.statusVariant}>{entry.status}</Badge>
                    <span className="text-xs text-[#555] hidden sm:inline">{timeAgo(entry.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
