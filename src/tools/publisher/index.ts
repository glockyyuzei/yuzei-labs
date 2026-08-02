import { toolRegistry } from '@/core/registry/ToolRegistry'
import { Package } from 'lucide-react'
import { PublisherTool } from './PublisherTool'

toolRegistry.register({
  id: 'publisher',
  name: 'Publisher',
  description: 'Build and publish Java applications, mods, and plugins.',
  icon: Package,
  version: '1.0.0',
  permissions: { filesystem: true, shell: true, network: true, notifications: true },
  component: PublisherTool,
  settingsSchema: {
    id: 'publisher',
    label: 'Publisher',
    description: 'Build, publish, and release settings',
    fields: [
      {
        key: 'publisher.developerName',
        label: 'Default Developer Name',
        type: 'text',
        defaultValue: 'Glockyyuzei',
        placeholder: 'Glockyyuzei',
      },
      {
        key: 'publisher.outputDir',
        label: 'Default Build Output Directory',
        type: 'path',
        placeholder: 'D:\\Artifacts',
      },
      {
        key: 'publisher.preferredIde',
        label: 'Preferred IDE',
        type: 'select',
        defaultValue: 'intellij',
        options: [
          { value: 'intellij', label: 'IntelliJ IDEA' },
          { value: 'eclipse', label: 'Eclipse IDE' },
          { value: 'vscode', label: 'Visual Studio Code' },
        ],
      },
      {
        key: 'publisher.autoCopyArtifacts',
        label: 'Automatically copy artifacts after build',
        type: 'boolean',
        defaultValue: true,
      },
      {
        key: 'publisher.autoOpenOutput',
        label: 'Automatically open output folder after build',
        type: 'boolean',
        defaultValue: false,
      },
      {
        key: 'publisher.discordEnabled',
        label: 'Enable Discord notifications',
        type: 'boolean',
        defaultValue: true,
      },
      {
        key: 'publisher.discordWebhook',
        label: 'Discord Webhook URL',
        type: 'text',
        placeholder: 'https://discord.com/api/webhooks/...',
      },
      {
        key: 'publisher.discordUsername',
        label: 'Discord Username',
        type: 'text',
        defaultValue: 'Yuzei Labs',
      },
      {
        key: 'publisher.discordAvatar',
        label: 'Discord Avatar URL',
        type: 'text',
      },
      {
        key: 'publisher.releaseNotesTemplate',
        label: 'Default Release Notes Template',
        type: 'text',
        placeholder: '## Added\n- \n\n## Changed\n- ',
      },
    ],
  },
})
