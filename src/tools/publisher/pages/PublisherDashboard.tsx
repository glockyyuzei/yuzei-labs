import { useEffect, useState } from 'react'
import { FolderOpen, Package } from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/Button'
import { Card, CardDescription, CardTitle } from '@/components/ui/Card'
import { StatusBar } from '@/components/ui/StatusBar'
import { useAuthStore } from '@/stores/authStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useNotificationStore } from '@/stores/notificationStore'
import { usePublisherStore } from '@/tools/publisher/stores/publisherStore'
import { api, type DetectedIde } from '@/lib/api'
import { formatDuration } from '@/lib/utils'
import { BuildActions } from '@/tools/publisher/components/BuildActions'
import { ProjectPanel } from '@/tools/publisher/components/ProjectPanel'
import { ArtifactsPanel } from '@/tools/publisher/components/ArtifactsPanel'
import { BuildStatusCard } from '@/tools/publisher/components/BuildStatusCard'
import { ReleaseNotesEditor } from '@/tools/publisher/components/ReleaseNotesEditor'
import { VersionEditor } from '@/tools/publisher/components/VersionEditor'
import { ModuleSelector } from '@/tools/publisher/components/ModuleSelector'
import { Console } from '@/tools/publisher/components/Console'

export function PublisherDashboard() {
  const { user } = useAuthStore()
  const settingsLoaded = useSettingsStore((s) => s.loaded)
  const setSetting = useSettingsStore((s) => s.set)
  const toast = useNotificationStore()
  const pub = usePublisherStore()
  const [detectedIdes, setDetectedIdes] = useState<DetectedIde[]>([])

  useEffect(() => {
    if (user && settingsLoaded) {
      pub.init(user.id)
      pub.refreshArtifacts(user.id)
    }
  }, [user, settingsLoaded])

  useEffect(() => {
    api.publisher.detectInstalledIdes().then(setDetectedIdes).catch(() => {})
  }, [])

  useEffect(() => {
    if (!settingsLoaded || !user) return
    const pubSettings = pub.getSettings()
    if (pubSettings.developerName && !pub.editDeveloper) {
      pub.setEditDeveloper(pubSettings.developerName)
    }
  }, [settingsLoaded, user])

  const pubSettings = pub.getSettings()

  const handleOpenInIde = async (ideOverride?: string) => {
    if (!pub.project) return
    const ide = ideOverride || pubSettings.preferredIde
    try {
      await api.publisher.openInIde(pub.project.workspacePath, ide)
    } catch (err) {
      toast.error('Could not open IDE', String(err))
    }
  }

  const handleSelectIde = (ideId: string) => {
    setSetting('publisher.preferredIde', ideId)
    handleOpenInIde(ideId)
  }

  if (!user) return null

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header
        title="Publisher"
        subtitle="Build. Publish. Ship. All in one place."
        actions={
          <Button variant="outline" size="sm" onClick={() => pub.openWorkspace(user.id)}>
            <FolderOpen className="h-3.5 w-3.5" />
            Open Workspace
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto p-6 lg:p-8 animate-fade-in">
        {!pub.project ? (
          <Card className="max-w-lg mx-auto text-center py-16">
            <Package className="h-14 w-14 text-[#333] mx-auto mb-4" />
            <CardTitle>No Workspace Open</CardTitle>
            <CardDescription>
              Open a Gradle project or configure a default workspace in Settings
            </CardDescription>
            <Button className="mt-6" onClick={() => pub.openWorkspace(user.id)}>
              <FolderOpen className="h-4 w-4" />
              Open Workspace
            </Button>
          </Card>
        ) : (
          <div className="space-y-6 max-w-7xl mx-auto">
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              <div className="xl:col-span-2 space-y-6">
                <ProjectPanel
                  project={pub.project}
                  lastBuildInfo={pub.lastBuildInfo}
                  buildStatus={pub.lastBuild?.status || pub.lastBuildInfo?.lastBuildStatus}
                  preferredIde={pubSettings.preferredIde}
                  detectedIdes={detectedIdes}
                  onOpenInIde={() => handleOpenInIde()}
                  onSelectIde={handleSelectIde}
                  onOpenWorkspace={() => pub.openWorkspace(user.id)}
                />

                <ModuleSelector
                  modules={pub.modules}
                  selected={pub.selectedModules}
                  onToggle={pub.toggleModule}
                  onSelectAll={pub.selectAllModules}
                  onDeselectAll={pub.deselectAllModules}
                  disabled={pub.building}
                />

                <VersionEditor
                  version={pub.editVersion}
                  developer={pub.editDeveloper}
                  buildNumber={pub.editBuildNumber}
                  projectPath={pub.project?.workspacePath}
                  onVersionChange={pub.setEditVersion}
                  onDeveloperChange={pub.setEditDeveloper}
                  onBuildNumberChange={pub.setEditBuildNumber}
                  onSave={() => pub.updateVersion()}
                />

                <Card>
                  <CardTitle>Quick Actions</CardTitle>
                  <div className="mt-4">
                    <BuildActions
                      building={pub.building}
                      disabled={pub.modules.length > 0 && pub.selectedModules.length === 0}
                      disabledReason="Select at least one module above before building."
                      onClean={() => pub.runBuild(user.id, 'clean', user.username)}
                      onBuild={() => pub.runBuild(user.id, 'build', user.username)}
                      onBuildPublish={() => pub.runBuild(user.id, 'build publish', user.username)}
                      onCancel={() => pub.cancelBuild()}
                    />
                  </div>
                  {pubSettings.outputDir && (
                    <div className="mt-4 rounded-lg bg-[#0a0a0a] p-3 border border-[#1a1a1a]">
                      <p className="text-xs text-[#666]">Build Output Directory</p>
                      <p className="text-sm truncate font-mono">{pubSettings.outputDir}</p>
                    </div>
                  )}
                </Card>

                <ReleaseNotesEditor
                  value={pub.releaseNotes}
                  onChange={pub.setReleaseNotes}
                  onSave={() => pub.saveReleaseNotes(pub.releaseNotes)}
                />
              </div>

              <div className="space-y-6">
                <BuildStatusCard
                  status={pub.lastBuild?.status}
                  duration={pub.lastBuild?.duration}
                  version={pub.editVersion || pub.project.version}
                  outputFolder={pub.outputFolder}
                  onOpenOutput={
                    pub.outputFolder
                      ? () => api.publisher.openFolder(pub.outputFolder!)
                      : undefined
                  }
                />
                <ArtifactsPanel
                  artifacts={pub.artifacts}
                  onRefresh={() => pub.refreshArtifacts(user.id)}
                  userId={user.id}
                  projectPath={pub.project?.workspacePath}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <Console
        lines={pub.consoleLines}
        autoScroll={pub.autoScroll}
        onAutoScrollChange={pub.setAutoScroll}
        onClear={pub.clearConsole}
      />

      <StatusBar
        items={[
          {
            label: 'Publisher',
            value: pub.building ? 'Building...' : 'Ready',
          },
          {
            label: 'Project',
            value: pub.project?.name || 'None',
          },
          ...(pub.lastBuild
            ? [
                {
                  label: 'Last Build',
                  value: formatDuration(pub.lastBuild.duration),
                },
              ]
            : []),
        ]}
      />
    </div>
  )
}