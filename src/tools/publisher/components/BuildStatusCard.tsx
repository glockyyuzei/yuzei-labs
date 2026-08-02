import { CheckCircle, Clock, FolderOpen, XCircle } from 'lucide-react'
import { Card, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { formatDuration } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface BuildStatusCardProps {
  status?: string
  duration?: number
  version?: string
  outputFolder?: string | null
  onOpenOutput?: () => void
}

export function BuildStatusCard({
  status,
  duration,
  version,
  outputFolder,
  onOpenOutput,
}: BuildStatusCardProps) {
  if (!status) return null

  const success = status.includes('SUCCESS')
  const cancelled = status.includes('CANCELLED')

  return (
    <Card className="h-full">
      <CardTitle>Build Status</CardTitle>
      <div className="mt-4 flex flex-col items-center text-center py-4">
        {success ? (
          <CheckCircle className="h-12 w-12 text-green-400 mb-3" />
        ) : cancelled ? (
          <Clock className="h-12 w-12 text-yellow-400 mb-3" />
        ) : (
          <XCircle className="h-12 w-12 text-red-400 mb-3" />
        )}
        <p
          className={cn(
            'text-2xl font-bold tracking-wide',
            success && 'text-green-400',
            cancelled && 'text-yellow-400',
            !success && !cancelled && 'text-red-400',
          )}
        >
          {success ? 'SUCCESS' : cancelled ? 'CANCELLED' : 'FAILED'}
        </p>
        {duration !== undefined && (
          <p className="text-sm text-[#666] mt-2 flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            {formatDuration(duration)}
          </p>
        )}
        {version && (
          <p className="text-sm text-[#888] mt-1">Version {version}</p>
        )}
        <p className="text-xs text-[#555] mt-2">
          Finished at {new Date().toLocaleString()}
        </p>
        {outputFolder && onOpenOutput && (
          <Button variant="outline" size="sm" className="mt-4" onClick={onOpenOutput}>
            <FolderOpen className="h-3.5 w-3.5" />
            Open Output Folder
          </Button>
        )}
      </div>
    </Card>
  )
}
