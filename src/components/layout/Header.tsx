import { Bell, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface HeaderProps {
  title: string
  subtitle?: string
  actions?: React.ReactNode
}

export function Header({ title, subtitle, actions }: HeaderProps) {
  return (
    <header className="flex items-center justify-between border-b border-[#222] px-8 py-5">
      <div>
        <h1 className="text-xl font-semibold text-white">{title}</h1>
        {subtitle && <p className="text-sm text-[#888] mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-3">
        {actions}
        <Button variant="outline" size="sm">
          <RefreshCw className="h-3.5 w-3.5" />
          Check for Updates
        </Button>
        <button className="relative rounded-lg p-2 text-[#888] hover:bg-[#111] hover:text-white transition-colors">
          <Bell className="h-4 w-4" />
        </button>
      </div>
    </header>
  )
}
