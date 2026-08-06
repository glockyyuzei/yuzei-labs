import { toolRegistry } from '@/core/registry/ToolRegistry'
import { ServerCog } from 'lucide-react'
import { SelfHostTool } from './SelfHostTool'

toolRegistry.register({
  id: 'selfhost',
  name: 'Self-Hosting',
  description: 'First-party control panel for servers you host on this machine.',
  icon: ServerCog,
  version: '0.1.0',
  permissions: { filesystem: true, shell: true, network: true, notifications: true },
  component: SelfHostTool,
  settingsSchema: {
    id: 'selfhost',
    label: 'Self-Hosting',
    description: 'Default paths and behavior for self-hosted servers',
    fields: [
      { key: 'selfhost.defaultJavaPath', label: 'Default Java Path (blank = system default)', type: 'text' },
      { key: 'selfhost.backupDir', label: 'Backup Output Directory', type: 'path' },
      { key: 'selfhost.autoStartOnLaunch', label: 'Auto-start servers when Yuzei Labs opens', type: 'boolean', defaultValue: false },
    ],
  },
})