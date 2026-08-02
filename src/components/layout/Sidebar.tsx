import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Settings,
  LogOut,
  Hexagon,
  History,
  User,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { APP_VERSION } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'
import { toolRegistry } from '@/core/registry/ToolRegistry'

function NavItem({
  to,
  icon: Icon,
  label,
  end,
}: {
  to: string
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  label: string
  end?: boolean
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors duration-150',
          isActive
            ? 'bg-[#1a1a1a] text-white'
            : 'text-[#888] hover:bg-[#111] hover:text-white',
        )
      }
    >
      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
      {label}
    </NavLink>
  )
}

export function Sidebar() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  const tools = toolRegistry.getAll()

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <aside className="flex h-full w-56 flex-col border-r border-[#222] bg-[#0a0a0a]">
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-[#222]">
        <Hexagon className="h-7 w-7 text-white" strokeWidth={1.5} />
        <span className="text-base font-semibold tracking-tight">Yuzei Labs</span>
      </div>

      <nav className="flex-1 space-y-4 px-3 py-4 overflow-y-auto">
        <div className="space-y-0.5">
          <NavItem to="/profile" icon={User} label="Profile" end />
          <NavItem to="/" icon={LayoutDashboard} label="Dashboard" end />
        </div>

        {tools.length > 0 && (
          <div>
            <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#555]">
              Tools
            </p>
            <div className="space-y-0.5">
              {tools.map((tool) => (
                <NavItem key={tool.id} to={`/tools/${tool.id}`} icon={tool.icon} label={tool.name} />
              ))}
            </div>
          </div>
        )}

        <div className="space-y-0.5">
          <NavItem to="/history" icon={History} label="History" end />
          <NavItem to="/settings" icon={Settings} label="Settings" end />
        </div>
      </nav>

      <div className="border-t border-[#222] p-4">
        <div className="flex items-center gap-3 rounded-lg bg-[#111] p-3">
          <button
            onClick={() => navigate('/profile')}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#222] text-xs font-bold overflow-hidden"
            title="Profile"
          >
            {user?.avatar ? (
              <img src={user.avatar} alt="" className="h-full w-full object-cover" />
            ) : (
              user?.username?.[0]?.toUpperCase() || 'U'
            )}
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user?.username}</p>
            <p className="text-xs text-[#666]">Online</p>
          </div>
          <button
            onClick={handleLogout}
            className="text-[#666] hover:text-white transition-colors"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
        <p className="text-[10px] text-[#444] mt-3 text-center">
          Yuzei Labs v{APP_VERSION}
        </p>
      </div>
    </aside>
  )
}
