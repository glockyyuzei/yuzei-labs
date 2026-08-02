import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Hexagon } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useAuthStore } from '@/stores/authStore'
import { useNotificationStore } from '@/stores/notificationStore'

export function RegisterPage() {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const register = useAuthStore((s) => s.register)
  const toast = useNotificationStore()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    if (!agreed) {
      setError('You must agree to the Terms and Privacy Policy')
      return
    }

    setLoading(true)
    try {
      await register(username, email, password)
      toast.success('Account Created', 'Welcome to Yuzei Labs')
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
          <p className="text-sm text-[#888] mt-1">Create your developer account</p>
        </div>

        <div className="rounded-2xl border border-[#222] bg-[#111] p-8">
          <h2 className="text-lg font-semibold mb-1">Create Account</h2>
          <p className="text-sm text-[#888] mb-6">Join the Yuzei Labs ecosystem</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="glockyyuzei"
              required
            />
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
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
            <Input
              label="Confirm Password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              required
            />

            <label className="flex items-start gap-2 text-sm text-[#888] cursor-pointer">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 rounded border-[#333] bg-[#111]"
              />
              I agree to the Terms of Service and Privacy Policy
            </label>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <Button type="submit" className="w-full" loading={loading}>
              Create Account
            </Button>
          </form>

          <p className="text-sm text-[#888] text-center mt-6">
            Already have an account?{' '}
            <Link to="/login" className="text-white hover:underline">
              Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
