import { useEffect, useState } from 'react'
import { useRepo } from '../store'

function IdentitySection(): React.JSX.Element {
  const { profile, loadProfile } = useRepo()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (profile) {
      setName(profile.name)
      setEmail(profile.email)
    }
  }, [profile])

  const dirty = profile !== null && (name !== profile.name || email !== profile.email)

  return (
    <section className="profile-section">
      <h3>Commit identity</h3>
      <p className="section-hint">Used as the author on every commit (git user.name / user.email).</p>
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        Email
        <input value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <div className="section-actions">
        {saved && <span className="saved-note">Saved</span>}
        <button
          className="primary"
          disabled={!dirty}
          onClick={() =>
            void window.api.setProfile(name.trim(), email.trim()).then(() => {
              void loadProfile()
              setSaved(true)
              setTimeout(() => setSaved(false), 2000)
            })
          }
        >
          Save identity
        </button>
      </div>
    </section>
  )
}

function CredentialsSection(): React.JSX.Element {
  const { credentials, loadCredentials } = useRepo()
  const [adding, setAdding] = useState(false)
  const [username, setUsername] = useState('')
  const [secret, setSecret] = useState('')

  const save = async (): Promise<void> => {
    if (!username.trim() || !secret.trim()) return
    await window.api.saveCredentials('github.com', username.trim(), secret.trim())
    setAdding(false)
    setUsername('')
    setSecret('')
    await loadCredentials()
  }

  return (
    <section className="profile-section">
      <div className="section-head">
        <h3>GitHub credentials</h3>
        <button className="mini" onClick={() => setAdding(!adding)}>
          {adding ? 'Cancel' : '+ Add'}
        </button>
      </div>
      <p className="section-hint">
        Used when pushing, pulling, or cloning over HTTPS. The token is a GitHub personal
        access token (repo scope) — stored encrypted in the OS keychain.
      </p>

      {adding && (
        <form
          className="cred-form"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          <input
            placeholder="GitHub username"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <input
            type="password"
            placeholder="Personal access token"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
          />
          <button
            type="submit"
            className="primary"
            disabled={!username.trim() || !secret.trim()}
          >
            Save credentials
          </button>
        </form>
      )}

      {credentials.length === 0 && !adding && <p className="empty-note">No saved credentials.</p>}
      {credentials.map((c) => (
        <div key={c.host} className="cred-row">
          <div className="cred-id">
            <strong>{c.host}</strong>
            <span>{c.username}</span>
          </div>
          <button
            className="mini danger"
            onClick={() =>
              void window.api.clearCredentials(c.host).then(() => loadCredentials())
            }
          >
            Remove
          </button>
        </div>
      ))}
    </section>
  )
}

export default function ProfileSidebar(): React.JSX.Element | null {
  const { profileOpen, toggleProfile } = useRepo()
  if (!profileOpen) return null

  return (
    <>
      <div className="sidebar-overlay" onClick={toggleProfile} />
      <aside className="profile-sidebar">
        <div className="profile-head">
          <h2>Profile</h2>
          <button className="mini" onClick={toggleProfile}>
            ✕
          </button>
        </div>
        <IdentitySection />
        <CredentialsSection />
      </aside>
    </>
  )
}
