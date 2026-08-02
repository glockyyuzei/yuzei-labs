import { useRef, useState } from 'react'
import { Camera, KeyRound, LogOut, User as UserIcon } from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { Card, CardDescription, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useAuthStore } from '@/stores/authStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useNotificationStore } from '@/stores/notificationStore'
import { api } from '@/lib/api'
import { useNavigate } from 'react-router-dom'

export function ProfilePage() {
  const { user, setUser, logout } = useAuthStore()
  const navigate = useNavigate()
  const toast = useNotificationStore()
  const developerName = useSettingsStore((s) => s.get('publisher.developerName'))
  const setSetting = useSettingsStore((s) => s.set)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [devNameDraft, setDevNameDraft] = useState(developerName || '')
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)

  const handleAvatarPick = () => fileInputRef.current?.click()

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return
    if (!file.type.startsWith('image/')) {
      toast.error('Invalid File', 'Please pick an image file.')
      return
    }
    setUploadingAvatar(true)
    try {
      // Downscale client-side before it ever hits the backend's 2MB ceiling —
      // full-resolution phone photos would otherwise bloat the local DB.
      const dataUrl = await downscaleImage(file, 256)
      const updated = await api.auth.updateAvatar(user.id, dataUrl)
      setUser(updated)
      toast.success('Profile Picture Updated')
    } catch (err) {
      toast.error('Upload Failed', String(err))
    } finally {
      setUploadingAvatar(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const saveDeveloperName = () => {
    setSetting('publisher.developerName', devNameDraft)
    toast.success('Developer Name Saved')
  }

  const handleChangePassword = async () => {
    if (!user) return
    if (!currentPassword || !newPassword) {
      toast.error('Fill In Both Password Fields')
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords Don\'t Match')
      return
    }
    setChangingPassword(true)
    try {
      await api.auth.changePassword(user.id, currentPassword, newPassword)
      toast.success('Password Changed', 'Other sessions have been signed out.')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      toast.error('Could Not Change Password', String(err))
    } finally {
      setChangingPassword(false)
    }
  }

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header title="Profile" subtitle="Your account and preferences" />
      <div className="flex-1 overflow-y-auto p-8 animate-fade-in">
        <div className="max-w-2xl mx-auto space-y-6">
          <Card>
            <div className="flex items-center gap-5">
              <div className="relative shrink-0">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#1a1a1a] border border-[#333] overflow-hidden">
                  {user?.avatar ? (
                    <img src={user.avatar} alt="Avatar" className="h-full w-full object-cover" />
                  ) : (
                    <UserIcon className="h-8 w-8 text-[#666]" />
                  )}
                </div>
                <button
                  onClick={handleAvatarPick}
                  disabled={uploadingAvatar}
                  className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-white text-black hover:bg-[#eee] transition-colors disabled:opacity-50"
                  title="Change profile picture"
                >
                  <Camera className="h-3.5 w-3.5" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarChange}
                />
              </div>
              <div className="min-w-0">
                <CardTitle>{user?.username}</CardTitle>
                <CardDescription>{user?.email}</CardDescription>
                <p className="text-xs text-[#555] mt-1">
                  Joined {user?.joinedAt ? new Date(user.joinedAt).toLocaleDateString() : '—'}
                </p>
              </div>
            </div>
          </Card>

          <Card>
            <CardTitle>Developer Name</CardTitle>
            <CardDescription>
              Used across Publisher and Deploy — build history, version tracking, and Discord notifications.
            </CardDescription>
            <div className="mt-4 flex gap-3">
              <Input
                value={devNameDraft}
                onChange={(e) => setDevNameDraft(e.target.value)}
                placeholder="Your name"
                className="flex-1"
              />
              <Button onClick={saveDeveloperName}>Save</Button>
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-2 mb-1">
              <KeyRound className="h-4 w-4 text-[#888]" />
              <CardTitle>Change Password</CardTitle>
            </div>
            <CardDescription>Changing your password signs out every other active session.</CardDescription>
            <div className="mt-4 space-y-3">
              <Input
                type="password"
                label="Current Password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
              <Input
                type="password"
                label="New Password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <Input
                type="password"
                label="Confirm New Password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
              <Button onClick={handleChangePassword} loading={changingPassword}>
                Update Password
              </Button>
            </div>
          </Card>

          <Card>
            <CardTitle>Session</CardTitle>
            <CardDescription>Sign out of Yuzei Labs on this device.</CardDescription>
            <div className="mt-4">
              <Button variant="danger" onClick={handleLogout}>
                <LogOut className="h-4 w-4" />
                Log Out
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

function downscaleImage(file: File, maxDimension: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Failed to read image'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Failed to decode image'))
      img.onload = () => {
        const scale = Math.min(1, maxDimension / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Canvas not supported'))
          return
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.85))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}
