import { invoke } from '@tauri-apps/api/core'

export interface UserProfile {
  id: string
  username: string
  email: string
  avatar: string
  joinedAt: string
  lastLogin?: string
}

export interface AuthResponse {
  token: string
  user: UserProfile
}

export interface ProjectInfo {
  name: string
  version: string
  javaVersion: string
  gradleVersion: string
  projectType: string
  workspacePath: string
  gitBranch?: string
}

export interface ModuleInfo {
  name: string
  gradlePath: string
  moduleDir: string
}

export interface BuildResult {
  id: string
  status: string
  durationMs: number
  output: string
  artifacts: ArtifactInfo[]
}

export interface ArtifactInfo {
  id: string
  filename: string
  version?: string
  filePath: string
  sizeBytes: number
  status: string
  buildTime: string
}

export interface BuildHistoryEntry {
  id: string
  projectName: string
  projectPath: string
  task: string
  status: string
  durationMs?: number
  version?: string
  createdAt: string
}

export interface LastBuildInfo {
  lastBuild?: string
  lastPublish?: string
  lastBuildStatus?: string
  lastBuildDurationMs?: number
}

export interface ConsoleLine {
  level: string
  message: string
  timestamp: string
}

export interface VersionHistoryEntry {
  version: string
  developer: string
  buildNumber: string
  createdAt: string
}

export interface RecentWorkspace {
  path: string
  name: string
  projectType: string
  version?: string
  openedAt: string
}

export interface ActivityEntry {
  id: number
  message: string
  toolId?: string
  createdAt: string
}

export interface DeploymentProfile {
  id: string
  name: string
  projectPath?: string
  targetType: string
  config: Record<string, unknown>
  createdAt: string
}

export interface ServerConfig {
  id: string
  name: string
  serverFolder: string
  modsFolder?: string
  pluginsFolder?: string
  javaVersion?: string
  startupScript?: string
  shutdownScript?: string
  workingDirectory?: string
  config: Record<string, unknown>
  createdAt: string
}

export interface ServerStatus {
  id: string
  name: string
  status: string
  onlinePlayers: number
  maxPlayers: number
  uptimeSecs: number
  cpuUsage: number
  ramUsageMb: number
  ramTotalMb: number
  tps: number
}

export interface FileEntry {
  name: string
  path: string
  isDir: boolean
  size: number
  modified: string
}

export interface DeployHistoryEntry {
  id: string
  serverName: string
  artifactName: string
  targetFolder: string
  status: string
  message?: string
  createdAt: string
}

export interface DeployResult {
  success: boolean
  message: string
  targets: string[]
}

export interface DetectedIde {
  id: string
  name: string
  found: boolean
  path?: string
}

export interface AnalysisResult {
  summary: string
  rootCause: string
  suggestedFixes: string[]
  confidence: number
  relatedFiles: string[]
  errorType: string
  usedAi: boolean
  source: string
}

export const api = {
  auth: {
    register: (data: { username: string; email: string; password: string }) =>
      invoke<AuthResponse>('register_user', { req: data }),
    login: (data: { identifier: string; password: string; rememberMe: boolean }) =>
      invoke<AuthResponse>('login_user', { req: data }),
    validate: (token: string) => invoke<UserProfile>('validate_session', { token }),
    logout: (token: string) => invoke<void>('logout_user', { token }),
    changePassword: (userId: string, currentPassword: string, newPassword: string) =>
      invoke<void>('change_password', { userId, currentPassword, newPassword }),
    updateAvatar: (userId: string, avatar: string) =>
      invoke<UserProfile>('update_avatar', { userId, avatar }),
  },
  settings: {
    getAll: () => invoke<Record<string, string>>('get_settings'),
    set: (key: string, value: string) => invoke<void>('set_setting', { key, value }),
    setBatch: (settings: Record<string, string>) =>
      invoke<void>('set_settings_batch', { settings }),
  },
  activity: {
    log: (userId: string, message: string, toolId?: string) =>
      invoke<void>('log_activity', { userId, message, toolId }),
    get: (userId: string, limit = 20) =>
      invoke<ActivityEntry[]>('get_activity', { userId, limit }),
    recordTool: (userId: string, toolId: string) =>
      invoke<void>('record_tool_usage', { userId, toolId }),
    getRecentTools: (userId: string) =>
      invoke<string[]>('get_recent_tools', { userId }),
  },
  publisher: {
    detectProject: (path: string) => invoke<ProjectInfo>('detect_project', { path }),
    detectModules: (path: string) => invoke<ModuleInfo[]>('detect_modules', { path }),
    runGradle: (
      userId: string,
      projectPath: string,
      task: string,
      outputDir?: string,
      version?: string,
      modules?: string[],
    ) =>
      invoke<BuildResult>('run_gradle_task', {
        userId,
        projectPath,
        task,
        outputDir,
        version,
        modules,
      }),
    cancelBuild: () => invoke<void>('cancel_build'),
    getBuildHistory: (userId: string, limit = 50, query?: string, statusFilter?: string) =>
      invoke<BuildHistoryEntry[]>('get_build_history', {
        userId,
        limit,
        query,
        statusFilter,
      }),
    getLastBuildInfo: (userId: string, projectPath: string) =>
      invoke<LastBuildInfo>('get_last_build_info', { userId, projectPath }),
    getArtifacts: (userId: string, projectPath?: string) =>
      invoke<ArtifactInfo[]>('get_artifacts', { userId, projectPath }),
    deleteArtifact: (id: string) => invoke<void>('delete_artifact', { id }),
    renameArtifact: (id: string, newFilename: string) =>
      invoke<ArtifactInfo>('rename_artifact', { id, newFilename }),
    saveRecentWorkspace: (userId: string, path: string, name: string, projectType: string, version?: string) =>
      invoke<void>('save_recent_workspace', { userId, path, name, projectType, version }),
    getRecentWorkspaces: (userId: string) =>
      invoke<RecentWorkspace[]>('get_recent_workspaces', { userId }),
    sendDiscordWebhook: (payload: {
      webhookUrl: string
      username?: string
      avatarUrl?: string
      project: string
      version: string
      developer: string
      duration: string
      status: string
      artifacts: { filename: string; filePath: string; sizeBytes: number }[]
    }) => invoke<void>('send_discord_webhook', { payload }),
    findJars: (path: string) => invoke<string[]>('find_jar_files', { path }),
    openInIde: (projectPath: string, ide: string) =>
      invoke<void>('open_in_ide', { projectPath, ide }),
    detectInstalledIdes: () => invoke<DetectedIde[]>('detect_installed_ides'),
    revealInExplorer: (path: string) => invoke<void>('reveal_in_explorer', { path }),
    openFolder: (path: string) => invoke<void>('open_folder', { path }),
    updateProjectVersion: (
      projectPath: string,
      version: string,
      developer?: string,
      buildNumber?: string,
    ) =>
      invoke<ProjectInfo>('update_project_version', {
        projectPath,
        version,
        developer,
        buildNumber,
      }),
    getVersionHistory: (projectPath: string) =>
      invoke<VersionHistoryEntry[]>('get_version_history', { projectPath }),
    saveReleaseNotes: (projectPath: string, content: string, version?: string) =>
      invoke<void>('save_release_notes', { projectPath, content, version }),
    getReleaseNotes: (projectPath: string) =>
      invoke<string | null>('get_release_notes', { projectPath }),
  },
  deploy: {
    saveProfile: (userId: string, profile: DeploymentProfile) =>
      invoke<void>('save_deployment_profile', { userId, profile }),
    getProfiles: (userId: string) =>
      invoke<DeploymentProfile[]>('get_deployment_profiles', { userId }),
    deleteProfile: (id: string) => invoke<void>('delete_deployment_profile', { id }),
    saveServer: (userId: string, server: ServerConfig) =>
      invoke<void>('save_server', { userId, server }),
    getServers: (userId: string) => invoke<ServerConfig[]>('get_servers', { userId }),
    deleteServer: (id: string) => invoke<void>('delete_server', { id }),
    listDirectory: (path: string) => invoke<FileEntry[]>('list_directory', { path }),
    deletePath: (path: string) => invoke<void>('delete_path', { path }),
    renamePath: (oldPath: string, newPath: string) =>
      invoke<void>('rename_path', { oldPath, newPath }),
    copyFile: (src: string, dest: string) => invoke<void>('copy_file', { src, dest }),
    deploy: (
      userId: string,
      artifactPath: string,
      targetFolder: string,
      autoBackup: boolean,
      autoRestart: boolean,
      serverId?: string,
      serverName?: string,
    ) =>
      invoke<DeployResult>('deploy_artifact', {
        userId,
        artifactPath,
        targetFolder,
        autoBackup,
        autoRestart,
        serverId,
        serverName,
      }),
    getDeployHistory: (userId: string) => invoke<DeployHistoryEntry[]>('get_deploy_history', { userId }),
    startServer: (server: ServerConfig) => invoke<number>('start_server', { server }),
    stopServer: (serverId: string) => invoke<void>('stop_server', { serverId }),
    sendServerCommand: (serverId: string, command: string) =>
      invoke<void>('send_server_command', { serverId, command }),
    getServerStatus: (server: ServerConfig) => invoke<ServerStatus>('get_server_status', { server }),
    readLogTail: (path: string, lines = 200) => invoke<string>('read_log_tail', { path, lines }),
    readTextFile: (path: string) => invoke<string>('read_text_file', { path }),
    writeTextFile: (path: string, content: string) => invoke<void>('write_text_file', { path, content }),
    createProfileId: () => invoke<string>('create_deployment_profile_id'),
    createServerId: () => invoke<string>('create_server_id'),
    backupServer: (serverFolder: string) => invoke<string>('backup_server_folder', { serverFolder }),
  },
  pterodactyl: {
    listServers: (panelUrl: string, apiKey: string) =>
      invoke<{ identifier: string; name: string; node: string; description: string }[]>(
        'pterodactyl_list_servers',
        { panelUrl, apiKey },
      ),
    getStatus: (panelUrl: string, apiKey: string, serverId: string, serverName: string) =>
      invoke<ServerStatus>('pterodactyl_get_status', { panelUrl, apiKey, serverId, serverName }),
    powerAction: (panelUrl: string, apiKey: string, serverId: string, signal: 'start' | 'stop' | 'restart' | 'kill') =>
      invoke<void>('pterodactyl_power_action', { panelUrl, apiKey, serverId, signal }),
    listFiles: (panelUrl: string, apiKey: string, serverId: string, directory: string) =>
      invoke<FileEntry[]>('pterodactyl_list_files', { panelUrl, apiKey, serverId, directory }),
    readFile: (panelUrl: string, apiKey: string, serverId: string, filePath: string) =>
      invoke<string>('pterodactyl_read_file', { panelUrl, apiKey, serverId, filePath }),
    writeFile: (panelUrl: string, apiKey: string, serverId: string, filePath: string, content: string) =>
      invoke<void>('pterodactyl_write_file', { panelUrl, apiKey, serverId, filePath, content }),
    deployArtifact: (
      userId: string,
      serverName: string,
      panelUrl: string,
      apiKey: string,
      serverId: string,
      localFilePath: string,
      targetDirectory: string,
    ) =>
      invoke<void>('pterodactyl_deploy_artifact', {
        userId,
        serverName,
        panelUrl,
        apiKey,
        serverId,
        localFilePath,
        targetDirectory,
      }),
    sendCommand: (panelUrl: string, apiKey: string, serverId: string, command: string) =>
      invoke<void>('pterodactyl_send_command', { panelUrl, apiKey, serverId, command }),
    createBackup: (panelUrl: string, apiKey: string, serverId: string, name?: string) =>
      invoke<string>('pterodactyl_create_backup', { panelUrl, apiKey, serverId, name }),
    getConsoleCredentials: (panelUrl: string, apiKey: string, serverId: string) =>
      invoke<{ token: string; socket: string }>('pterodactyl_get_console_credentials', {
        panelUrl,
        apiKey,
        serverId,
      }),
  },
  inspector: {
    analyzeOffline: (input: string) => invoke<AnalysisResult>('analyze_offline', { input }),
    analyzeWithAi: (req: { input: string; provider: string; apiKey: string; model?: string; baseUrl?: string }) =>
      invoke<AnalysisResult>('analyze_with_ai', { req }),
    chat: (messages: Array<{ role: string; content: string }>, provider: string, apiKey: string, model?: string, baseUrl?: string) =>
      invoke<string>('ai_chat', { messages, provider, apiKey, model, baseUrl }),
    readFile: (path: string) => invoke<string>('read_file_content', { path }),
  },
}
