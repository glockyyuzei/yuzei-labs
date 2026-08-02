import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { LoginPage } from '@/pages/LoginPage'
import { RegisterPage } from '@/pages/RegisterPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { ProfilePage } from '@/pages/ProfilePage'
import { HistoryPage } from '@/pages/HistoryPage'
import { ToolPage } from '@/pages/ToolPage'
import { useAuthStore } from '@/stores/authStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { usePublisherStore } from '@/tools/publisher/stores/publisherStore'
import '@/tools'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, validateSession } = useAuthStore()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    validateSession().finally(() => setChecking(false))
  }, [validateSession])

  if (checking || isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0a0a0a]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white border-t-transparent" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

function AppRoutes() {
  const loadSettings = useSettingsStore((s) => s.load)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const user = useAuthStore((s) => s.user)

  useEffect(() => {
    if (isAuthenticated) loadSettings()
  }, [isAuthenticated, loadSettings])

  useEffect(() => {
    // Boot the publisher store as soon as we're authenticated so the
    // default workspace, project info, and build history are ready for
    // the Dashboard and status bar without waiting on the Publisher tool.
    if (isAuthenticated && user) {
      usePublisherStore.getState().init(user.id)
    } else {
      // Logged out — release the build-output/started/finished listeners
      // instead of leaving them attached indefinitely.
      usePublisherStore.getState().teardown()
    }
  }, [isAuthenticated, user])

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="tools/:toolId/*" element={<ToolPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}