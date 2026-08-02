import { create } from 'zustand'
import { api } from '@/lib/api'

interface SettingsState {
  settings: Record<string, string>
  loaded: boolean
  load: () => Promise<void>
  get: (key: string, defaultValue?: string) => string
  set: (key: string, value: string) => Promise<void>
  setMany: (values: Record<string, string>) => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: {},
  loaded: false,

  load: async () => {
    const settings = await api.settings.getAll()
    set({ settings, loaded: true })
  },

  get: (key, defaultValue = '') => {
    return get().settings[key] ?? defaultValue
  },

  set: async (key, value) => {
    await api.settings.set(key, value)
    set((s) => ({ settings: { ...s.settings, [key]: value } }))
  },

  setMany: async (values) => {
    await api.settings.setBatch(values)
    set((s) => ({ settings: { ...s.settings, ...values } }))
  },
}))
