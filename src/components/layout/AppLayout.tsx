import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { AppStatusBar } from './AppStatusBar'
import { ToastContainer } from '@/components/ui/Toast'

export function AppLayout() {
  return (
    <div className="flex h-screen bg-[#0a0a0a]">
      <Sidebar />
      <main className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-hidden flex flex-col">
          <Outlet />
        </div>
        <AppStatusBar />
      </main>
      <ToastContainer />
    </div>
  )
}
