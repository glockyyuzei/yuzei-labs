import { Save } from 'lucide-react'
import { Card, CardDescription, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

const SECTIONS = ['Added', 'Changed', 'Fixed', 'Removed', 'Known Issues']

interface ReleaseNotesEditorProps {
  value: string
  onChange: (v: string) => void
  onSave: () => void
}

export function ReleaseNotesEditor({ value, onChange, onSave }: ReleaseNotesEditorProps) {
  const insertSection = (section: string) => {
    const header = `\n## ${section}\n- `
    onChange(value + header)
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div>
          <CardTitle>Release Notes</CardTitle>
          <CardDescription>Document changes for this release</CardDescription>
        </div>
        <Button size="sm" onClick={onSave}>
          <Save className="h-3.5 w-3.5" />
          Save
        </Button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {SECTIONS.map((section) => (
          <button
            key={section}
            onClick={() => insertSection(section)}
            className="rounded-md border border-[#333] bg-[#0a0a0a] px-2.5 py-1 text-xs text-[#888] hover:text-white hover:border-[#555] transition-colors"
          >
            + {section}
          </button>
        ))}
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="## Added&#10;- New feature&#10;&#10;## Fixed&#10;- Bug fix"
        className="mt-4 w-full h-48 rounded-lg border border-[#333] bg-[#0a0a0a] p-4 text-sm text-white font-mono resize-none focus:outline-none focus:border-[#555] transition-colors"
      />
    </Card>
  )
}
