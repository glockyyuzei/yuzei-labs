import { useEffect, useState } from 'react'
import { Header } from '@/components/layout/Header'
import { Tabs } from '@/components/ui/Tabs'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Card, CardDescription, CardTitle } from '@/components/ui/Card'
import { useSettingsStore } from '@/stores/settingsStore'
import { toolRegistry } from '@/core/registry/ToolRegistry'
import { useNotificationStore } from '@/stores/notificationStore'
import { useAuthStore } from '@/stores/authStore'

const coreTabs = [
  { id: 'general', label: 'General' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'authentication', label: 'Authentication' },
  { id: 'ai', label: 'AI' },
  { id: 'workspace', label: 'Workspace' },
  { id: 'notifications', label: 'Notifications' },
]

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState('general')
  const { settings, load, set, setMany } = useSettingsStore()
  const toast = useNotificationStore()
  const { user } = useAuthStore()

  const toolTabs = toolRegistry.getSettingsSchemas().map((s) => ({
    id: `tool-${s.toolId}`,
    label: s.toolName,
  }))

  const tabs = [...coreTabs, ...toolTabs]

  useEffect(() => {
    load()
  }, [load])

  const save = async () => {
    toast.success('Settings Saved')
  }

  const updateField = (key: string, value: string) => {
    set(key, value)
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header title="Settings" subtitle="Configure Yuzei Labs and your tools" />

      <div className="px-8 pt-4">
        <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
      </div>

      <div className="flex-1 overflow-y-auto p-8 animate-fade-in">
        {activeTab === 'general' && (
          <Card className="max-w-2xl">
            <CardTitle>General</CardTitle>
            <CardDescription>Application-wide preferences</CardDescription>
            <div className="mt-6 space-y-4">
              <Input
                label="Default Workspace Directory"
                value={settings['workspace.defaultPath'] || ''}
                onChange={(e) => updateField('workspace.defaultPath', e.target.value)}
                placeholder="C:\Projects"
              />
              <Input
                label="Author Name"
                value={settings['general.author'] || 'Glockyyuzei'}
                onChange={(e) => updateField('general.author', e.target.value)}
              />
              <Button onClick={save}>Save Changes</Button>
            </div>
          </Card>
        )}

        {activeTab === 'appearance' && (
          <Card className="max-w-2xl">
            <CardTitle>Appearance</CardTitle>
            <CardDescription>Visual preferences</CardDescription>
            <div className="mt-6 space-y-4">
              <div>
                <label className="block text-sm text-[#888] mb-2">Theme</label>
                <select
                  value={settings['appearance.theme'] || 'dark'}
                  onChange={(e) => updateField('appearance.theme', e.target.value)}
                  className="w-full rounded-lg border border-[#333] bg-[#111] px-4 py-2.5 text-sm text-white"
                >
                  <option value="dark">Dark (Default)</option>
                  <option value="light">Light</option>
                  <option value="system">System</option>
                </select>
              </div>
              <Button onClick={save}>Save Changes</Button>
            </div>
          </Card>
        )}

        {activeTab === 'authentication' && (
          <Card className="max-w-2xl">
            <CardTitle>Authentication</CardTitle>
            <CardDescription>Account and session settings</CardDescription>
            <div className="mt-6 space-y-4">
              <div className="rounded-lg bg-[#0a0a0a] p-4 border border-[#1a1a1a]">
                <p className="text-sm font-medium">{user?.username}</p>
                <p className="text-xs text-[#666]">{user?.email}</p>
                <p className="text-xs text-[#666] mt-2">
                  Joined {user?.joinedAt ? new Date(user.joinedAt).toLocaleDateString() : '—'}
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm text-[#888]">
                <input
                  type="checkbox"
                  checked={settings['auth.rememberMe'] !== 'false'}
                  onChange={(e) => updateField('auth.rememberMe', String(e.target.checked))}
                  className="rounded border-[#333]"
                />
                Remember me by default
              </label>
              <Button onClick={save}>Save Changes</Button>
            </div>
          </Card>
        )}

        {activeTab === 'ai' && (
          <Card className="max-w-2xl">
            <CardTitle>AI Configuration</CardTitle>
            <CardDescription>Configure AI providers for Inspector</CardDescription>
            <div className="mt-6 space-y-4">
              <div>
                <label className="block text-sm text-[#888] mb-2">Default Provider</label>
                <select
                  value={settings['ai.provider'] || 'openrouter'}
                  onChange={(e) => updateField('ai.provider', e.target.value)}
                  className="w-full rounded-lg border border-[#333] bg-[#111] px-4 py-2.5 text-sm text-white"
                >
                  <option value="openrouter">OpenRouter</option>
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic Claude</option>
                  <option value="gemini">Google Gemini</option>
                  <option value="ollama">Ollama</option>
                  <option value="lmstudio">LM Studio</option>
                  <option value="custom">Custom OpenAI-Compatible</option>
                </select>
              </div>
              <Input
                label="API Key"
                type="password"
                value={settings['ai.apiKey'] || ''}
                onChange={(e) => updateField('ai.apiKey', e.target.value)}
                placeholder="sk-..."
              />
              <Input
                label="Model (optional)"
                value={settings['ai.model'] || ''}
                onChange={(e) => updateField('ai.model', e.target.value)}
                placeholder="anthropic/claude-3.5-sonnet"
              />
              <Input
                label="Custom Base URL (optional)"
                value={settings['ai.baseUrl'] || ''}
                onChange={(e) => updateField('ai.baseUrl', e.target.value)}
                placeholder="http://localhost:1234/v1"
              />
              <Button onClick={save}>Save Changes</Button>
            </div>
          </Card>
        )}

        {activeTab === 'workspace' && (
          <Card className="max-w-2xl">
            <CardTitle>Workspace</CardTitle>
            <CardDescription>Default project and workspace settings</CardDescription>
            <div className="mt-6 space-y-4">
              <Input
                label="Default Workspace"
                value={settings['workspace.defaultPath'] || ''}
                onChange={(e) => updateField('workspace.defaultPath', e.target.value)}
                placeholder="D:\Projects\MyMod"
              />
              <p className="text-xs text-[#666]">
                Publisher automatically opens this workspace when no project is loaded.
              </p>
              <Input
                label="Default Java Version"
                value={settings['workspace.javaVersion'] || '17'}
                onChange={(e) => updateField('workspace.javaVersion', e.target.value)}
              />
              <Input
                label="Max Recent Workspaces"
                value={settings['workspace.maxRecent'] || '10'}
                onChange={(e) => updateField('workspace.maxRecent', e.target.value)}
              />
              <Button onClick={save}>Save Changes</Button>
            </div>
          </Card>
        )}

        {activeTab === 'notifications' && (
          <Card className="max-w-2xl">
            <CardTitle>Notifications</CardTitle>
            <CardDescription>Toast and system notification preferences</CardDescription>
            <div className="mt-6 space-y-3">
              {[
                ['notifications.build', 'Build notifications'],
                ['notifications.deploy', 'Deploy notifications'],
                ['notifications.server', 'Server status notifications'],
                ['notifications.analysis', 'Analysis completed notifications'],
              ].map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-sm text-[#888]">
                  <input
                    type="checkbox"
                    checked={settings[key] !== 'false'}
                    onChange={(e) => updateField(key, String(e.target.checked))}
                    className="rounded border-[#333]"
                  />
                  {label}
                </label>
              ))}
              <Button onClick={save} className="mt-4">Save Changes</Button>
            </div>
          </Card>
        )}

        {toolRegistry.getSettingsSchemas().map((toolSettings) =>
          activeTab === `tool-${toolSettings.toolId}` ? (
            <Card key={toolSettings.toolId} className="max-w-2xl">
              <CardTitle>{toolSettings.toolName} Settings</CardTitle>
              <CardDescription>{toolSettings.schema.description}</CardDescription>
              <div className="mt-6 space-y-4">
                {toolSettings.schema.fields.map((field) =>
                  field.type === 'boolean' ? (
                    <label key={field.key} className="flex items-center gap-2 text-sm text-[#888]">
                      <input
                        type="checkbox"
                        checked={settings[field.key] !== 'false'}
                        onChange={(e) => updateField(field.key, String(e.target.checked))}
                        className="rounded border-[#333]"
                      />
                      {field.label}
                    </label>
                  ) : field.type === 'select' ? (
                    <div key={field.key}>
                      <label className="block text-sm text-[#888] mb-2">{field.label}</label>
                      <select
                        value={settings[field.key] || String(field.defaultValue || '')}
                        onChange={(e) => updateField(field.key, e.target.value)}
                        className="w-full rounded-lg border border-[#333] bg-[#111] px-4 py-2.5 text-sm text-white"
                      >
                        {field.options?.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <Input
                      key={field.key}
                      label={field.label}
                      type={field.type === 'password' ? 'password' : 'text'}
                      value={settings[field.key] || String(field.defaultValue || '')}
                      onChange={(e) => updateField(field.key, e.target.value)}
                      placeholder={field.placeholder}
                    />
                  ),
                )}
                <Button onClick={() => setMany(settings).then(save)}>Save Changes</Button>
              </div>
            </Card>
          ) : null,
        )}
      </div>
    </div>
  )
}
