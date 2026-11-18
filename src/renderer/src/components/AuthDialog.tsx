import { useState } from 'react'
import { useRepo } from '../store'

export default function AuthDialog(): React.JSX.Element | null {
  const { authRequest, setAuthRequest, setError } = useRepo()
  const [username, setUsername] = useState('')
  const [secret, setSecret] = useState('')
  const [saving, setSaving] = useState(false)

  if (!authRequest) return null
  const { host, retry } = authRequest
  const isGithub = host === 'github.com'

  const submit = async (): Promise<void> => {
    if (!username.trim() || !secret.trim()) return
    setSaving(true)
    try {
      await window.api.saveCredentials(host, username.trim(), secret.trim())
      setAuthRequest(null)
      retry()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={() => setAuthRequest(null)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Sign in to {isGithub ? 'GitHub' : host}</h2>
        <p className="modal-hint">
          {isGithub ? (
            <>
              GitHub no longer accepts passwords — use a{' '}
              <a href="https://github.com/settings/tokens" target="_blank" rel="noreferrer">
                personal access token
              </a>{' '}
              with <code>repo</code> scope.
            </>
          ) : (
            'Enter your username and a password or access token.'
          )}
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <label>
            Username
            <input
              autoFocus
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </label>
          <label>
            {isGithub ? 'Personal access token' : 'Password / token'}
            <input
              type="password"
              autoComplete="current-password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
            />
          </label>
          <div className="modal-actions">
            <button type="button" onClick={() => setAuthRequest(null)}>
              Cancel
            </button>
            <button
              type="submit"
              className="primary"
              disabled={!username.trim() || !secret.trim() || saving}
            >
              {saving ? 'Signing in…' : 'Sign in & retry'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
