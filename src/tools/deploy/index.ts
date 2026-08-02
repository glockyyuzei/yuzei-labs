import { toolRegistry } from '@/core/registry/ToolRegistry'
import { Rocket } from 'lucide-react'
import { DeployTool } from './DeployTool'

toolRegistry.register({
  id: 'deploy',
  name: 'Deploy',
  description: 'Automate deployment and testing.',
  icon: Rocket,
  version: '0.1.0',
  permissions: { filesystem: true, shell: true, network: true, notifications: true },
  component: DeployTool,
  settingsSchema: {
    id: 'deploy',
    label: 'Deploy',
    description: 'Deployment and server management settings',
    fields: [
      { key: 'deploy.defaultBackup', label: 'Auto-backup before deploy', type: 'boolean', defaultValue: true },
      { key: 'deploy.defaultRestart', label: 'Auto-restart server after deploy', type: 'boolean', defaultValue: false },
      { key: 'deploy.watchInterval', label: 'Watch mode interval (seconds)', type: 'text', defaultValue: '5' },
      { key: 'deploy.pterodactylUrl', label: 'Pterodactyl Panel URL', type: 'text' },
      { key: 'deploy.pterodactylKey', label: 'Pterodactyl API Key', type: 'password' },
    ],
  },
})
