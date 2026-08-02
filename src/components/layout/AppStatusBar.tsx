import { useLocation } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { StatusBar } from '@/components/ui/StatusBar'
import { usePublisherStore } from '@/tools/publisher/stores/publisherStore'
import { toolRegistry } from '@/core/registry/ToolRegistry'
import { APP_VERSION } from '@/lib/utils'

export function AppStatusBar() {
  const location = useLocation()
  const project = usePublisherStore((s) => s.project)
  const building = usePublisherStore((s) => s.building)

  const toolMatch = location.pathname.match(/^\/tools\/([^/]+)/)
  const currentTool = toolMatch
    ? toolRegistry.get(toolMatch[1])?.name
    : location.pathname === '/profile'
      ? 'Profile'
      : location.pathname === '/history'
        ? 'History'
        : location.pathname === '/settings'
          ? 'Settings'
          : undefined

  const items = [
    { label: 'Yuzei Labs', value: `v${APP_VERSION}` },
    { label: 'Java', value: project?.javaVersion || '—' },
    { label: 'Workspace', value: project?.name || 'None' },
    { label: 'Tool', value: currentTool || 'Dashboard' },
  ]

  return (
    <StatusBar
      items={items}
      className="py-2"
      action={
        building ? (
          <div className="flex items-center gap-2 text-xs text-[#aaa]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Build running…
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-[#555]">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
            Idle
          </div>
        )
      }
    />
  )
}
