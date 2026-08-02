import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { api, type UserProfile } from '@/lib/api'

interface AuthState {
  token: string | null
  user: UserProfile | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (identifier: string, password: string, rememberMe: boolean) => Promise<void>
  register: (username: string, email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  validateSession: () => Promise<boolean>
  setUser: (user: UserProfile) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      isLoading: true,
      isAuthenticated: false,

      login: async (identifier, password, rememberMe) => {
        const res = await api.auth.login({ identifier, password, rememberMe })
        set({ token: res.token, user: res.user, isAuthenticated: true, isLoading: false })
        await api.activity.log(res.user.id, 'Signed in successfully')
      },

      register: async (username, email, password) => {
        const res = await api.auth.register({ username, email, password })
        set({ token: res.token, user: res.user, isAuthenticated: true, isLoading: false })
      },

      logout: async () => {
        const { token } = get()
        if (token) {
          try {
            await api.auth.logout(token)
          } catch {
            /* session may already be expired */
          }
        }
        set({ token: null, user: null, isAuthenticated: false, isLoading: false })
      },

      validateSession: async () => {
        const { token } = get()
        if (!token) {
          set({ isLoading: false, isAuthenticated: false })
          return false
        }
        try {
          const user = await api.auth.validate(token)
          set({ user, isAuthenticated: true, isLoading: false })
          return true
        } catch {
          set({ token: null, user: null, isAuthenticated: false, isLoading: false })
          return false
        }
      },

      setUser: (user) => set({ user }),
    }),
    {
      name: 'yuzei-auth',
      partialize: (state) => ({ token: state.token, user: state.user, isAuthenticated: state.isAuthenticated }),
    },
  ),
)
