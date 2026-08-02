import { useEffect, useState } from 'react'
import { History, Search } from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { Card, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { useAuthStore } from '@/stores/authStore'
import { usePublisherStore } from '@/tools/publisher/stores/publisherStore'
import { formatDuration, timeAgo } from '@/lib/utils'

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'success', label: 'Success' },
  { value: 'failed', label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' },
]

export function PublisherHistoryPage() {
  const { user } = useAuthStore()
  const { history, refreshHistory } = usePublisherStore()
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  useEffect(() => {
    if (!user) return
    const timer = setTimeout(() => {
      refreshHistory(user.id, query, statusFilter)
    }, 300)
    return () => clearTimeout(timer)
  }, [user, query, statusFilter, refreshHistory])

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header
        title="Build History"
        subtitle="Search and filter all completed builds"
      />

      <div className="flex-1 overflow-y-auto p-6 lg:p-8 animate-fade-in">
        <Card className="max-w-5xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <CardTitle>Build History</CardTitle>
            <div className="flex items-center gap-3">
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#555]" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search builds..."
                  className="w-full rounded-lg border border-[#333] bg-[#0a0a0a] py-2 pl-9 pr-3 text-sm text-white placeholder:text-[#555] focus:outline-none focus:border-[#555]"
                />
              </div>
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

          {history.length === 0 ? (
            <div className="text-center py-16">
              <History className="h-10 w-10 text-[#333] mx-auto mb-3" />
              <p className="text-sm text-[#666]">No build history yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="hidden sm:grid grid-cols-6 gap-4 px-3 py-2 text-xs text-[#666] uppercase tracking-wider border-b border-[#1a1a1a]">
                <span className="col-span-2">Project</span>
                <span>Version</span>
                <span>Task</span>
                <span>Duration</span>
                <span>Status</span>
              </div>
              {history.map((entry) => (
                <div
                  key={entry.id}
                  className="grid grid-cols-1 sm:grid-cols-6 gap-2 sm:gap-4 items-center rounded-lg bg-[#0a0a0a] p-3 border border-[#1a1a1a] hover:border-[#333] transition-colors"
                >
                  <div className="sm:col-span-2 min-w-0">
                    <p className="text-sm font-medium truncate">{entry.projectName}</p>
                    <p className="text-xs text-[#666] truncate">{entry.projectPath}</p>
                    <p className="text-xs text-[#555] sm:hidden">{timeAgo(entry.createdAt)}</p>
                  </div>
                  <span className="text-sm text-[#aaa]">{entry.version || '—'}</span>
                  <span className="text-sm text-[#888]">{entry.task}</span>
                  <span className="text-sm text-[#666]">
                    {entry.durationMs ? formatDuration(entry.durationMs) : '—'}
                  </span>
                  <div className="flex items-center justify-between sm:justify-start gap-2">
                    <Badge
                      variant={
                        entry.status.includes('SUCCESS')
                          ? 'success'
                          : entry.status.includes('CANCELLED')
                            ? 'outline'
                            : 'error'
                      }
                    >
                      {entry.status.replace('BUILD ', '')}
                    </Badge>
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
