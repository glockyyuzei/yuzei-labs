import { create } from 'zustand'
import { listen } from '@tauri-apps/api/event'
import { open } from '@tauri-apps/plugin-dialog'
import {
  api,
  type ArtifactInfo,
  type BuildHistoryEntry,
  type ConsoleLine,
  type LastBuildInfo,
  type ModuleInfo,
  type ProjectInfo,
} from '@/lib/api'
import { useSettingsStore } from '@/stores/settingsStore'
import { useNotificationStore } from '@/stores/notificationStore'
import { formatDuration } from '@/lib/utils'

export interface PublisherSettings {
  defaultWorkspace: string
  developerName: string
  outputDir: string
  preferredIde: string
  autoOpenOutput: boolean
  autoCopyArtifacts: boolean
  discordEnabled: boolean
  discordWebhook: string
  discordUsername: string
  discordAvatar: string
  releaseNotesTemplate: string
}

interface PublisherState {
  project: ProjectInfo | null
  modules: ModuleInfo[]
  selectedModules: string[]
  building: boolean
  consoleLines: ConsoleLine[]
  autoScroll: boolean
  artifacts: ArtifactInfo[]
  history: BuildHistoryEntry[]
  lastBuildInfo: LastBuildInfo | null
  lastBuild: { status: string; duration: number } | null
  releaseNotes: string
  editVersion: string
  editDeveloper: string
  editBuildNumber: string
  outputFolder: string | null
  initialized: boolean
  listenersAttached: boolean
  unlistenFns: (() => void) | null

  getSettings: () => PublisherSettings
  init: (userId: string) => Promise<void>
  attachListeners: () => Promise<() => void>
  teardown: () => void
  loadWorkspace: (userId: string, path: string) => Promise<void>
  openWorkspace: (userId: string) => Promise<void>
  loadDefaultWorkspace: (userId: string) => Promise<void>
  runBuild: (userId: string, task: string, username: string) => Promise<void>
  cancelBuild: () => Promise<void>
  refreshArtifacts: (userId: string) => Promise<void>
  refreshHistory: (userId: string, query?: string, statusFilter?: string) => Promise<void>
  refreshLastBuildInfo: (userId: string) => Promise<void>
  saveReleaseNotes: (content: string) => Promise<void>
  loadReleaseNotes: () => Promise<void>
  updateVersion: () => Promise<void>
  addConsoleLine: (line: ConsoleLine) => void
  clearConsole: () => void
  setReleaseNotes: (notes: string) => void
  setEditVersion: (v: string) => void
  setEditDeveloper: (v: string) => void
  setEditBuildNumber: (v: string) => void
  setAutoScroll: (v: boolean) => void
  toggleModule: (gradlePath: string) => void
  selectAllModules: () => void
  deselectAllModules: () => void
}

function readPublisherSettings(): PublisherSettings {
  const settings = useSettingsStore.getState()
  return {
    defaultWorkspace: settings.get('workspace.defaultPath'),
    developerName: settings.get('publisher.developerName') || settings.get('general.author', 'Glockyyuzei'),
    outputDir: settings.get('publisher.outputDir'),
    preferredIde: settings.get('publisher.preferredIde', 'intellij'),
    autoOpenOutput: settings.get('publisher.autoOpenOutput') !== 'false',
    autoCopyArtifacts: settings.get('publisher.autoCopyArtifacts') !== 'false',
    discordEnabled: settings.get('publisher.discordEnabled') !== 'false',
    discordWebhook: settings.get('publisher.discordWebhook'),
    discordUsername: settings.get('publisher.discordUsername', 'Yuzei Labs'),
    discordAvatar: settings.get('publisher.discordAvatar'),
    releaseNotesTemplate: settings.get('publisher.releaseNotesTemplate'),
  }
}

export const usePublisherStore = create<PublisherState>((set, get) => ({
  project: null,
  modules: [],
  selectedModules: [],
  building: false,
  consoleLines: [],
  autoScroll: true,
  artifacts: [],
  history: [],
  lastBuildInfo: null,
  lastBuild: null,
  releaseNotes: '',
  editVersion: '',
  editDeveloper: '',
  editBuildNumber: '',
  outputFolder: null,
  initialized: false,
  listenersAttached: false,
  unlistenFns: null,

  getSettings: readPublisherSettings,

  init: async (userId) => {
    const pub = get()
    if (!pub.listenersAttached) {
      const unlisten = await pub.attachListeners()
      set({ unlistenFns: unlisten })
    }
    await pub.loadDefaultWorkspace(userId)
    await pub.refreshHistory(userId)
    set({ initialized: true })
  },

  attachListeners: async () => {
    const unlistenOutput = await listen<ConsoleLine>('build-output', (event) => {
      get().addConsoleLine(event.payload)
    })
    const unlistenStart = await listen<string>('build-started', () => {
      set({ building: true })
    })
    const unlistenFinish = await listen('build-finished', () => {
      set({ building: false })
    })
    set({ listenersAttached: true })
    return () => {
      unlistenOutput()
      unlistenStart()
      unlistenFinish()
    }
  },

  teardown: () => {
    const { unlistenFns } = get()
    unlistenFns?.()
    set({
      listenersAttached: false,
      unlistenFns: null,
      initialized: false,
      project: null,
      modules: [],
      selectedModules: [],
      building: false,
      consoleLines: [],
      artifacts: [],
      history: [],
      lastBuildInfo: null,
      lastBuild: null,
      releaseNotes: '',
      editVersion: '',
      editDeveloper: '',
      editBuildNumber: '',
      outputFolder: null,
    })
  },

  loadWorkspace: async (userId, path) => {
    const toast = useNotificationStore.getState()
    const pubSettings = readPublisherSettings()
    try {
      const info = await api.publisher.detectProject(path)
      set({
        project: info,
        editVersion: info.version,
        editDeveloper: pubSettings.developerName,
      })
      try {
        const modules = await api.publisher.detectModules(path)
        set({ modules, selectedModules: modules.map((m) => m.gradlePath) })
        if (modules.length > 0) {
          get().addConsoleLine({
            level: 'INFO',
            message: `Detected ${modules.length} module(s): ${modules.map((m) => m.name).join(', ')}`,
            timestamp: new Date().toLocaleTimeString(),
          })
        }
      } catch {
        set({ modules: [], selectedModules: [] })
      }
      await api.publisher.saveRecentWorkspace(
        userId,
        info.workspacePath,
        info.name,
        info.projectType,
        info.version,
      )
      const [arts, lastInfo] = await Promise.all([
        api.publisher.getArtifacts(userId, info.workspacePath),
        api.publisher.getLastBuildInfo(userId, info.workspacePath),
      ])
      set({ artifacts: arts, lastBuildInfo: lastInfo })
      await get().loadReleaseNotes()
      get().addConsoleLine({
        level: 'INFO',
        message: `Workspace loaded: ${info.workspacePath}`,
        timestamp: new Date().toLocaleTimeString(),
      })
      get().addConsoleLine({
        level: 'INFO',
        message: `Project type: ${info.projectType}`,
        timestamp: new Date().toLocaleTimeString(),
      })
      get().addConsoleLine({
        level: 'INFO',
        message: `Java Version: ${info.javaVersion}`,
        timestamp: new Date().toLocaleTimeString(),
      })
      toast.success('Workspace Loaded', info.name)
    } catch (err) {
      toast.error('Failed to open workspace', String(err))
      throw err
    }
  },

  openWorkspace: async (userId) => {
    const selected = await open({ directory: true, multiple: false })
    if (!selected) return
    await get().loadWorkspace(userId, selected as string)
  },

  loadDefaultWorkspace: async (userId) => {
    if (get().project) return
    const { defaultWorkspace } = readPublisherSettings()
    if (defaultWorkspace) {
      try {
        await get().loadWorkspace(userId, defaultWorkspace)
      } catch {
        // Default workspace may be invalid — ignore silently
      }
    }
  },

  runBuild: async (userId, task, username) => {
    const { project, modules, selectedModules } = get()
    if (!project) return
    const toast = useNotificationStore.getState()
    const pubSettings = readPublisherSettings()

    if (modules.length > 0 && selectedModules.length === 0) {
      toast.error('No Modules Selected', 'Select at least one module to build.')
      return
    }
    if (task.includes('publish')) {
      if (!(get().editVersion || project.version)) {
        toast.error('Version Required', 'Enter a version before publishing.')
        return
      }
      if (!(get().editDeveloper || pubSettings.developerName)) {
        toast.error('Developer Name Required', 'Enter your developer name before publishing.')
        return
      }
    }

    set({ building: true, consoleLines: [] })
    toast.info('Build Started', task)
    get().addConsoleLine({
      level: 'INFO',
      message: modules.length > 0
        ? `Starting Gradle task: ${task} (${selectedModules.length} module${selectedModules.length === 1 ? '' : 's'})`
        : `Starting Gradle task: ${task}`,
      timestamp: new Date().toLocaleTimeString(),
    })

    try {
      const outputDir = pubSettings.autoCopyArtifacts ? pubSettings.outputDir : undefined
      const result = await api.publisher.runGradle(
        userId,
        project.workspacePath,
        task,
        outputDir || undefined,
        get().editVersion || project.version,
        modules.length > 0 ? selectedModules : undefined,
      )
      set({
        lastBuild: { status: result.status, duration: result.durationMs },
        artifacts: result.artifacts,
      })

      result.output.split('\n').filter(Boolean).forEach((line) => {
        get().addConsoleLine({
          level: line.toLowerCase().includes('error')
            ? 'ERROR'
            : line.toLowerCase().includes('warn')
              ? 'WARN'
              : line.toLowerCase().includes('success')
                ? 'SUCCESS'
                : 'INFO',
          message: line,
          timestamp: new Date().toLocaleTimeString(),
        })
      })

      await get().refreshLastBuildInfo(userId)
      await get().refreshHistory(userId)

      if (result.status.includes('SUCCESS')) {
        toast.success('Build Completed', formatDuration(result.durationMs))
        if (result.artifacts.length === 0) {
          get().addConsoleLine({
            level: 'WARN',
            message: 'Build succeeded but no JAR artifacts were found in build/libs.',
            timestamp: new Date().toLocaleTimeString(),
          })
        }
        if (outputDir && pubSettings.autoCopyArtifacts && result.artifacts.length > 0) {
          const folder = `${outputDir}\\${project.name}\\${get().editVersion || project.version}`
          set({ outputFolder: folder })
          get().addConsoleLine({
            level: 'SUCCESS',
            message: `Build artifacts copied to ${folder}`,
            timestamp: new Date().toLocaleTimeString(),
          })
          if (pubSettings.autoOpenOutput) {
            await api.publisher.openFolder(folder)
          }
        }
        if (task.includes('publish') && pubSettings.discordEnabled && pubSettings.discordWebhook) {
          try {
            await api.publisher.sendDiscordWebhook({
              webhookUrl: pubSettings.discordWebhook,
              username: pubSettings.discordUsername,
              avatarUrl: pubSettings.discordAvatar || undefined,
              project: project.name,
              version: get().editVersion || project.version,
              developer: get().editDeveloper || pubSettings.developerName || username,
              duration: formatDuration(result.durationMs),
              status: result.status,
              artifacts: result.artifacts.map((a) => ({
                filename: a.filename,
                filePath: a.filePath,
                sizeBytes: a.sizeBytes,
              })),
            })
            toast.success('Publish Completed', 'Discord notification sent')
          } catch (err) {
            toast.error('Discord Notification Failed', String(err))
          }
        }
        await api.activity.log(userId, `Build completed for ${project.name}`, 'publisher')
      } else if (result.status.includes('CANCELLED')) {
        toast.warning('Build Cancelled')
      } else {
        toast.error('Build Failed')
      }
    } catch (err) {
      toast.error('Build Error', String(err))
      get().addConsoleLine({
        level: 'ERROR',
        message: String(err),
        timestamp: new Date().toLocaleTimeString(),
      })
    } finally {
      set({ building: false })
    }
  },

  cancelBuild: async () => {
    try {
      await api.publisher.cancelBuild()
      useNotificationStore.getState().warning('Build Cancelled')
    } catch (err) {
      useNotificationStore.getState().error('Cancel Failed', String(err))
    }
  },

  refreshArtifacts: async (userId) => {
    const { project } = get()
    if (!project) return
    const arts = await api.publisher.getArtifacts(userId, project.workspacePath)
    set({ artifacts: arts })
  },

  refreshHistory: async (userId, query, statusFilter) => {
    const history = await api.publisher.getBuildHistory(userId, 50, query, statusFilter)
    set({ history })
  },

  refreshLastBuildInfo: async (userId) => {
    const { project } = get()
    if (!project) return
    const lastBuildInfo = await api.publisher.getLastBuildInfo(userId, project.workspacePath)
    set({ lastBuildInfo })
  },

  saveReleaseNotes: async (content) => {
    const { project, editVersion } = get()
    if (!project) return
    await api.publisher.saveReleaseNotes(project.workspacePath, content, editVersion)
    set({ releaseNotes: content })
    useNotificationStore.getState().success('Release Notes Saved')
  },

  loadReleaseNotes: async () => {
    const { project } = get()
    if (!project) return
    const notes = await api.publisher.getReleaseNotes(project.workspacePath)
    if (notes) {
      set({ releaseNotes: notes })
    } else {
      const template = readPublisherSettings().releaseNotesTemplate
      set({
        releaseNotes: template || `## Added\n- \n\n## Changed\n- \n\n## Fixed\n- \n\n## Removed\n- \n\n## Known Issues\n- \n`,
      })
    }
  },

  updateVersion: async () => {
    const { project, editVersion, editDeveloper, editBuildNumber } = get()
    if (!project) return
    const updated = await api.publisher.updateProjectVersion(
      project.workspacePath,
      editVersion,
      editDeveloper,
      editBuildNumber || undefined,
    )
    set({ project: updated, editVersion: updated.version })
    useNotificationStore.getState().success('Version Updated', updated.version)
  },

  addConsoleLine: (line) => set((s) => ({ consoleLines: [...s.consoleLines, line] })),
  clearConsole: () => set({ consoleLines: [] }),
  setReleaseNotes: (notes) => set({ releaseNotes: notes }),
  setEditVersion: (v) => set({ editVersion: v }),
  setEditDeveloper: (v) => set({ editDeveloper: v }),
  setEditBuildNumber: (v) => set({ editBuildNumber: v }),
  setAutoScroll: (v) => set({ autoScroll: v }),
  toggleModule: (gradlePath) =>
    set((s) => ({
      selectedModules: s.selectedModules.includes(gradlePath)
        ? s.selectedModules.filter((p) => p !== gradlePath)
        : [...s.selectedModules, gradlePath],
    })),
  selectAllModules: () => set((s) => ({ selectedModules: s.modules.map((m) => m.gradlePath) })),
  deselectAllModules: () => set({ selectedModules: [] }),
}))