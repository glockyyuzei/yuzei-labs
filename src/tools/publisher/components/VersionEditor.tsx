import { Save } from 'lucide-react'
import { Card, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'

interface VersionEditorProps {
  version: string
  developer: string
  buildNumber: string
  onVersionChange: (v: string) => void
  onDeveloperChange: (v: string) => void
  onBuildNumberChange: (v: string) => void
  onSave: () => void
}

export function VersionEditor({
  version,
  developer,
  buildNumber,
  onVersionChange,
  onDeveloperChange,
  onBuildNumberChange,
  onSave,
}: VersionEditorProps) {
  return (
    <Card>
      <div className="flex items-center justify-between gap-4">
        <CardTitle>Version Management</CardTitle>
        <Button size="sm" onClick={onSave}>
          <Save className="h-3.5 w-3.5" />
          Apply to Project
        </Button>
      </div>
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Input
          label="Project Version"
          value={version}
          onChange={(e) => onVersionChange(e.target.value)}
          placeholder="1.0.0"
        />
        <Input
          label="Developer Name"
          value={developer}
          onChange={(e) => onDeveloperChange(e.target.value)}
          placeholder="Glockyyuzei"
        />
        <Input
          label="Build Number (optional)"
          value={buildNumber}
          onChange={(e) => onBuildNumberChange(e.target.value)}
          placeholder="42"
        />
      </div>
    </Card>
  )
}
