import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Hexagon } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useAuthStore } from '@/stores/authStore'
import { useNotificationStore } from '@/stores/notificationStore'

export function LoginPage() {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const login = useAuthStore((s) => s.login)
  const toast = useNotificationStore()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(identifier, password, rememberMe)
      toast.success('Login Successful', 'Welcome back to Yuzei Labs')
      navigate('/')
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a] p-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="flex flex-col items-center mb-8">
          <Hexagon className="h-12 w-12 text-white mb-4" strokeWidth={1.5} />
          <h1 className="text-2xl font-semibold">Yuzei Labs</h1>
          <p className="text-sm text-[#888] mt-1">Modular Developer Platform</p>
        </div>

        <div className="rounded-2xl border border-[#222] bg-[#111] p-8">
          <h2 className="text-lg font-semibold mb-1">Sign In</h2>
          <p className="text-sm text-[#888] mb-6">Enter your credentials to continue</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Username or Email"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="glockyyuzei"
              required
            />
            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-[#888] cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-[#333] bg-[#111]"
                />
                Remember Me
              </label>
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <Button type="submit" className="w-full" loading={loading}>
              Sign In
            </Button>
          </form>

          <p className="text-sm text-[#888] text-center mt-6">
            Don&apos;t have an account?{' '}
            <Link to="/register" className="text-white hover:underline">
              Sign Up
            </Link>
          </p>
        </div>

        <p className="text-xs text-[#444] text-center mt-6">
          by Glockyyuzei · Yuzei Labs v0.1.0
        </p>
      </div>
    </div>
  )
}