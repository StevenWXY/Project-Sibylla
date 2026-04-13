import React, { useState } from 'react'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { PixelOctoIcon } from '../brand/PixelOctoIcon'

/**
 * Auth mode: login or register
 */
type AuthMode = 'login' | 'register'

interface LoginPageProps {
  /** Called when authentication succeeds */
  onAuthSuccess: () => void
}

/**
 * LoginPage — Login and registration form
 *
 * Provides a combined login/register interface that communicates
 * with the main process via IPC auth channels.
 */
export function LoginPage({ onAuthSuccess }: LoginPageProps) {
  const [mode, setMode] = useState<AuthMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      if (mode === 'login') {
        const response = await window.electronAPI.auth.login({ email, password })
        if (!response.success) {
          setError(response.error?.message ?? 'Login failed')
          return
        }
      } else {
        if (!name.trim()) {
          setError('Name is required')
          return
        }
        const response = await window.electronAPI.auth.register({ email, password, name })
        if (!response.success) {
          setError(response.error?.message ?? 'Registration failed')
          return
        }
      }

      onAuthSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  const switchMode = () => {
    setMode(mode === 'login' ? 'register' : 'login')
    setError(null)
  }

  return (
    <div className="sibylla-shell flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md space-y-8 rounded-2xl border border-white/10 bg-sys-darkSurface/80 p-8 text-white shadow-glass-dark backdrop-blur-xl">
        {/* Header */}
        <div className="text-center">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1">
            <PixelOctoIcon className="h-4 w-4 text-white" />
            <span className="font-mono text-xs tracking-widest text-white">&lt;SIBYLLA/&gt;</span>
          </div>
          <h1 className="text-3xl font-bold text-white">
            Sibylla
          </h1>
          <p className="mt-2 text-sm text-sys-darkMuted">
            {mode === 'login' ? 'Sign in to your account' : 'Create a new account'}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <Input
              label="Name"
              type="text"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={loading}
              autoComplete="name"
            />
          )}

          <Input
            label="Email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={loading}
            autoComplete="email"
          />

          <Input
            label="Password"
            type="password"
            placeholder={mode === 'register' ? 'At least 8 characters' : 'Enter your password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={loading}
            minLength={mode === 'register' ? 8 : undefined}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />

          {/* Error message */}
          {error && (
            <div
              className="rounded-lg border border-red-700/50 bg-red-950/40 p-3 text-sm text-red-300"
              role="alert"
            >
              {error}
            </div>
          )}

          {/* Submit button */}
          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={loading}
            className="w-full"
          >
            {mode === 'login' ? 'Sign In' : 'Create Account'}
          </Button>
        </form>

        {/* Mode switch */}
        <div className="text-center text-sm">
          <span className="text-sys-darkMuted">
            {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}
          </span>{' '}
          <button
            type="button"
            onClick={switchMode}
            className="font-medium text-white hover:underline"
            disabled={loading}
          >
            {mode === 'login' ? 'Sign up' : 'Sign in'}
          </button>
        </div>

        {/* Skip auth (development) */}
        {process.env.NODE_ENV === 'development' && (
          <div className="border-t border-white/10 pt-4 text-center">
            <button
              type="button"
              onClick={onAuthSuccess}
              className="text-sm text-sys-darkMuted transition-colors hover:text-white"
            >
              Skip (dev only)
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
