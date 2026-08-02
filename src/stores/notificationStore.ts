import { create } from 'zustand'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface Toast {
  id: string
  type: ToastType
  title: string
  message?: string
}

interface NotificationState {
  toasts: Toast[]
  add: (toast: Omit<Toast, 'id'>) => void
  remove: (id: string) => void
  success: (title: string, message?: string) => void
  error: (title: string, message?: string) => void
  info: (title: string, message?: string) => void
  warning: (title: string, message?: string) => void
}

let toastCounter = 0

export const useNotificationStore = create<NotificationState>((set) => ({
  toasts: [],

  add: (toast) => {
    const id = `toast-${++toastCounter}`
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }))
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, 4000)
  },

  remove: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  success: (title, message) =>
    set((s) => {
      const id = `toast-${++toastCounter}`
      setTimeout(() => set((st) => ({ toasts: st.toasts.filter((t) => t.id !== id) })), 4000)
      return { toasts: [...s.toasts, { id, type: 'success', title, message }] }
    }),

  error: (title, message) =>
    set((s) => {
      const id = `toast-${++toastCounter}`
      setTimeout(() => set((st) => ({ toasts: st.toasts.filter((t) => t.id !== id) })), 5000)
      return { toasts: [...s.toasts, { id, type: 'error', title, message }] }
    }),

  info: (title, message) =>
    set((s) => {
      const id = `toast-${++toastCounter}`
      setTimeout(() => set((st) => ({ toasts: st.toasts.filter((t) => t.id !== id) })), 4000)
      return { toasts: [...s.toasts, { id, type: 'info', title, message }] }
    }),

  warning: (title, message) =>
    set((s) => {
      const id = `toast-${++toastCounter}`
      setTimeout(() => set((st) => ({ toasts: st.toasts.filter((t) => t.id !== id) })), 4000)
      return { toasts: [...s.toasts, { id, type: 'warning', title, message }] }
    }),
}))
