import { cn } from '@/lib/utils'

interface StatusBarProps {
  items: { label: string; value: string; variant?: 'success' | 'error' | 'default' }[]
  action?: React.ReactNode
  className?: string
}

export function StatusBar({ items, action, className }: StatusBarProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between border-t border-[#222] bg-[#0d0d0d] px-6 py-3',
        className,
      )}
    >
      <div className="flex items-center gap-6">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-2 text-sm">
            <span className="text-[#666]">{item.label}</span>
            <span
              className={cn(
                'font-medium',
                item.variant === 'success' && 'text-green-400',
                item.variant === 'error' && 'text-red-400',
                !item.variant && 'text-white',
              )}
            >
              {item.value}
            </span>
          </div>
        ))}
      </div>
      {action}
    </div>
  )
}
