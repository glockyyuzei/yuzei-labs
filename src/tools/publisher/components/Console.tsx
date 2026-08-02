import { useEffect, useRef, useState } from 'react'
import {
  Copy, Download, Search, Trash2, ChevronDown, ChevronUp,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import type { ConsoleLine } from '@/lib/api'

const levelColors: Record<string, string> = {
  INFO: 'text-[#aaa]',
  WARN: 'text-yellow-400',
  ERROR: 'text-red-400',
  SUCCESS: 'text-green-400',
}

interface ConsoleProps {
  lines: ConsoleLine[]
  autoScroll: boolean
  onAutoScrollChange: (v: boolean) => void
  onClear: () => void
  className?: string
}

export function Console({ lines, autoScroll, onAutoScrollChange, onClear, className }: ConsoleProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [lines, autoScroll])

  const filtered = search
    ? lines.filter((l) => l.message.toLowerCase().includes(search.toLowerCase()))
    : lines

  const exportLogs = () => {
    const text = lines.map((l) => `[${l.timestamp}] ${l.level} ${l.message}`).join('\n')
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `publisher-console-${Date.now()}.log`
    a.click()
    URL.revokeObjectURL(url)
  }

  const copyLogs = () => {
    const text = lines.map((l) => `[${l.timestamp}] ${l.level} ${l.message}`).join('\n')
    navigator.clipboard.writeText(text)
  }

  return (
    <div className={cn('flex flex-col border-t border-[#222] bg-[#080808]', className)}>
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#1a1a1a]">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="text-[#666] hover:text-white transition-colors"
          >
            {collapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          <span className="text-sm font-medium">Console</span>
          <span className="text-xs text-[#555]">{lines.length} lines</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#555]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search logs..."
              className="w-40 rounded-md border border-[#222] bg-[#0a0a0a] py-1 pl-8 pr-2 text-xs text-white placeholder:text-[#555] focus:outline-none focus:border-[#444]"
            />
          </div>
          <label className="flex items-center gap-1.5 text-xs text-[#666] cursor-pointer">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => onAutoScrollChange(e.target.checked)}
              className="rounded border-[#333]"
            />
            Auto Scroll
          </label>
          <Button variant="ghost" size="sm" onClick={copyLogs} title="Copy">
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" onClick={exportLogs} title="Export">
            <Download className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" onClick={onClear} title="Clear">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      {!collapsed && (
        <div
          ref={containerRef}
          className="h-44 overflow-y-auto px-4 py-2 font-mono text-xs leading-relaxed"
        >
          {filtered.length === 0 ? (
            <p className="text-[#555] py-4 text-center">No output yet</p>
          ) : (
            filtered.map((line, i) => (
              <div key={i} className="flex gap-2 py-0.5">
                <span className="text-[#444] shrink-0">[{line.timestamp}]</span>
                <span className={cn('shrink-0 w-16', levelColors[line.level] || 'text-[#aaa]')}>
                  {line.level}
                </span>
                <span className="text-[#ccc] break-all">{line.message}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
