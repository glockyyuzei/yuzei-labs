import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react'
import { useNotificationStore, type ToastType } from '@/stores/notificationStore'
import { cn } from '@/lib/utils'

const icons: Record<ToastType, typeof CheckCircle> = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
  warning: AlertTriangle,
}

const styles: Record<ToastType, string> = {
  success: 'border-green-500/30 bg-[#111]',
  error: 'border-red-500/30 bg-[#111]',
  info: 'border-blue-500/30 bg-[#111]',
  warning: 'border-yellow-500/30 bg-[#111]',
}

const iconColors: Record<ToastType, string> = {
  success: 'text-green-400',
  error: 'text-red-400',
  info: 'text-blue-400',
  warning: 'text-yellow-400',
}

export function ToastContainer() {
  const { toasts, remove } = useNotificationStore()

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => {
        const Icon = icons[toast.type]
        return (
          <div
            key={toast.id}
            className={cn(
              'flex items-start gap-3 rounded-xl border p-4 shadow-2xl animate-fade-in',
              styles[toast.type],
            )}
          >
            <Icon className={cn('h-5 w-5 shrink-0 mt-0.5', iconColors[toast.type])} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white">{toast.title}</p>
              {toast.message && (
                <p className="text-xs text-[#888] mt-0.5">{toast.message}</p>
              )}
            </div>
            <button
              onClick={() => remove(toast.id)}
              className="text-[#666] hover:text-white transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
