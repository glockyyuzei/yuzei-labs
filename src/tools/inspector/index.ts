import { toolRegistry } from '@/core/registry/ToolRegistry'
import { Search } from 'lucide-react'
import { InspectorTool } from './InspectorTool'

toolRegistry.register({
  id: 'inspector',
  name: 'Inspector',
  description: 'AI-powered debugging assistant.',
  icon: Search,
  version: '0.1.0',
  permissions: { filesystem: true, network: true, notifications: true },
  component: InspectorTool,
  settingsSchema: {
    id: 'inspector',
    label: 'Inspector',
    description: 'AI analysis and debugging preferences',
    fields: [
      { key: 'inspector.preferOffline', label: 'Prefer offline analysis first', type: 'boolean', defaultValue: true },
      { key: 'inspector.autoAnalyze', label: 'Auto-analyze on file upload', type: 'boolean', defaultValue: false },
      {
        key: 'inspector.defaultProvider',
        label: 'Default AI Provider',
        type: 'select',
        defaultValue: 'openrouter',
        options: [
          { label: 'OpenRouter', value: 'openrouter' },
          { label: 'OpenAI', value: 'openai' },
          { label: 'Anthropic', value: 'anthropic' },
          { label: 'Gemini', value: 'gemini' },
          { label: 'Ollama', value: 'ollama' },
          { label: 'LM Studio', value: 'lmstudio' },
        ],
      },
    ],
  },
})
