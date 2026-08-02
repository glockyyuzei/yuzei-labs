import { Boxes, Check } from 'lucide-react'
import { Card, CardTitle, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import type { ModuleInfo } from '@/lib/api'

interface ModuleSelectorProps {
  modules: ModuleInfo[]
  selected: string[]
  onToggle: (gradlePath: string) => void
  onSelectAll: () => void
  onDeselectAll: () => void
  disabled?: boolean
}

export function ModuleSelector({
  modules,
  selected,
  onToggle,
  onSelectAll,
  onDeselectAll,
  disabled,
}: ModuleSelectorProps) {
  if (modules.length === 0) {
    return null
  }

  const selectedSet = new Set(selected)

  return (
    <Card>
      <div className="flex items-center justify-between gap-4 mb-1">
        <div className="flex items-center gap-2">
          <Boxes className="h-4 w-4 text-[#888]" strokeWidth={1.5} />
          <CardTitle>Modules</CardTitle>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onSelectAll} disabled={disabled}>
            Select All
          </Button>
          <Button variant="ghost" size="sm" onClick={onDeselectAll} disabled={disabled}>
            Clear
          </Button>
        </div>
      </div>
      <CardDescription>
        {selected.length} of {modules.length} module{modules.length === 1 ? '' : 's'} selected —
        clean, build, and publish only apply to checked modules.
      </CardDescription>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
        {modules.map((module) => {
          const isSelected = selectedSet.has(module.gradlePath)
          return (
            <button
              key={module.gradlePath}
              type="button"
              disabled={disabled}
              onClick={() => onToggle(module.gradlePath)}
              className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed ${
                isSelected
                  ? 'border-white/30 bg-white/[0.06] text-white'
                  : 'border-[#262626] bg-[#0d0d0d] text-[#999] hover:border-[#333] hover:text-white'
              }`}
            >
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                  isSelected ? 'border-white bg-white' : 'border-[#444]'
                }`}
              >
                {isSelected && <Check className="h-3 w-3 text-black" strokeWidth={3} />}
              </span>
              <span className="truncate font-medium">{module.name}</span>
              <span className="ml-auto text-xs text-[#555] font-mono truncate">
                {module.gradlePath}
              </span>
            </button>
          )
        })}
      </div>
    </Card>
  )
}
