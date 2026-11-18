import { useState } from 'react'
import { useRepo } from '../store'
import logo from '../assets/logo.svg'

type Mode = 'none' | 'clone' | 'init'

export default function Welcome(): React.JSX.Element {
  const { open, openTab, clone, init, error, busy, toggleProfile, recent, tabs } = useRepo()
  const [mode, setMode] = useState<Mode>('none')
  const [url, setUrl] = useState('')
  const [dir, setDir] = useState('')

  const pickThen = async (title: string, fn: (path: string) => Promise<void>): Promise<void> => {
    const path = await window.api.pickDirectory(title)
    if (path) await fn(path)
  }

  return (
    <div className="welcome">
      <img className="welcome-logo" src={logo} alt="GitScylla" />
      <p className="tagline">A git client with teeth</p>

      <div className="welcome-cards">
        <button
          className="card"
          onClick={() => void pickThen('Open repository', (p) => open(p))}
        >
          <strong>Open repository</strong>
          <span>Browse to a folder containing a git repo</span>
        </button>
        <button className="card" onClick={() => setMode(mode === 'clone' ? 'none' : 'clone')}>
          <strong>Clone repository</strong>
          <span>Clone from a remote URL</span>
        </button>
        <button
          className="card"
          onClick={() => void pickThen('Choose folder to init', (p) => init(p))}
        >
          <strong>Init repository</strong>
          <span>Create a new git repo in a folder</span>
        </button>
      </div>

      {mode === 'clone' && (
        <form
          className="clone-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (url.trim() && dir) void clone(url.trim(), dir)
          }}
        >
          <input
            placeholder="https://github.com/user/repo.git or git@github.com:user/repo.git"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <div className="clone-dir">
            <input
              readOnly
              placeholder="Destination folder…"
              value={dir}
            />
            <button
              type="button"
              onClick={() => void window.api.pickDirectory('Clone into').then((p) => p && setDir(p))}
            >
              Browse…
            </button>
          </div>
          <button className="primary" disabled={!url.trim() || !dir || busy !== null}>
            {busy === 'cloning' ? 'Cloning…' : 'Clone'}
          </button>
        </form>
      )}

      {recent.length > 0 && (
        <div className="recent">
          <h2>Recent repositories</h2>
          <div className="recent-list">
            {recent.map((r) => (
              <button
                key={r.path}
                className="recent-row"
                onClick={() => void openTab(r.path)}
                title={r.path}
              >
                <span className="recent-name">{r.name}</span>
                <span className="recent-path">{r.path}</span>
                {tabs.some((t) => t.path === r.path) && (
                  <span className="recent-open">open</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <div className="error">{error}</div>}

      <button className="mini profile-link" onClick={toggleProfile}>
        ☰ Profile &amp; credentials
      </button>
    </div>
  )
}
