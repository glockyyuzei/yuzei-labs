import { Hammer, Trash2, Upload, Square } from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface BuildActionsProps {
  building: boolean
  disabled?: boolean
  disabledReason?: string
  onClean: () => void
  onBuild: () => void
  onBuildPublish: () => void
  onCancel: () => void
}

export function BuildActions({
  building,
  disabled,
  disabledReason,
  onClean,
  onBuild,
  onBuildPublish,
  onCancel,
}: BuildActionsProps) {
  const actionsDisabled = building || disabled
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={onClean} disabled={actionsDisabled}>
          <Trash2 className="h-4 w-4" />
          Clean
        </Button>
        <Button onClick={onBuild} disabled={actionsDisabled} loading={building}>
          <Hammer className="h-4 w-4" />
          Build
        </Button>
        <Button variant="secondary" onClick={onBuildPublish} disabled={actionsDisabled}>
          <Upload className="h-4 w-4" />
          Build & Publish
        </Button>
        {building && (
          <Button variant="danger" onClick={onCancel}>
            <Square className="h-4 w-4" />
            Cancel
          </Button>
        )}
      </div>
      {disabled && disabledReason && !building && (
        <p className="mt-2 text-xs text-amber-400/80">{disabledReason}</p>
      )}
    </div>
  )
}
