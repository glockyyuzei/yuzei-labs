import type { ComponentType, LazyExoticComponent } from 'react'
import type { LucideIcon } from 'lucide-react'

export interface ToolPermissions {
  filesystem?: boolean
  network?: boolean
  shell?: boolean
  notifications?: boolean
}

export interface ToolSettingsSchema {
  id: string
  label: string
  description?: string
  fields: ToolSettingField[]
}

export interface ToolSettingField {
  key: string
  label: string
  type: 'text' | 'password' | 'boolean' | 'select' | 'path'
  defaultValue?: string | boolean
  options?: { label: string; value: string }[]
  placeholder?: string
}

export interface ToolDefinition {
  id: string
  name: string
  description: string
  icon: LucideIcon
  version: string
  permissions: ToolPermissions
  settingsSchema?: ToolSettingsSchema
  component: ComponentType | LazyExoticComponent<ComponentType>
  settingsComponent?: ComponentType
  onLaunch?: () => void
}

export interface ToolLaunchContext {
  navigate: (path: string) => void
  userId: string
}
