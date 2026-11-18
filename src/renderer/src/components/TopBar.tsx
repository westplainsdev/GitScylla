import { useState } from 'react'
import { useRepo } from '../store'
import Icon from './icons'

export default function TopBar(): React.JSX.Element {
  const { repo, status, branches, remotes, busy, run, refresh, open, toggleProfile } =
    useRepo()
  const [newBranch, setNewBranch] = useState<string | null>(null)
  const [branchName, setBranchName] = useState('')

  const local = branches.filter((b) => !b.remote)

  const act = (label: string, fn: (repo: string) => Promise<unknown>): void => {
    void run(label, fn)
  }

  return (
    <header className="topbar">
      <div className="repo-id">
        <span className="repo-name">{repo ? repo.name : 'GitScylla'}</span>
        {repo && (
          <span className="repo-path" title={repo.path}>
            {repo.path}
          </span>
        )}
      </div>

      {repo && (
      <div className="branch-box">
        {newBranch === null ? (
          <>
            <select
              className="branch-select"
              value={status?.current ?? ''}
              onChange={(e) => act('checkout', (r) => window.api.checkout(r, e.target.value))}
            >
              {status?.current === null && <option value="">(detached HEAD)</option>}
              {local.map((b) => (
                <option key={b.name} value={b.name}>
                  {b.name}
                </option>
              ))}
            </select>
            <button className="mini" title="New branch" onClick={() => setNewBranch('')}>
              + branch
            </button>
          </>
        ) : (
          <form
            className="new-branch"
            onSubmit={(e) => {
              e.preventDefault()
              if (branchName.trim()) {
                act('branch', (r) => window.api.createBranch(r, branchName.trim()))
              }
              setNewBranch(null)
              setBranchName('')
            }}
          >
            <input
              autoFocus
              placeholder="new branch name"
              value={branchName}
              onChange={(e) => setBranchName(e.target.value)}
              onBlur={() => setNewBranch(null)}
            />
          </form>
        )}
        {status && (status.ahead > 0 || status.behind > 0) && (
          <span className="sync-badges">
            {status.ahead > 0 && <span className="ahead">↑{status.ahead}</span>}
            {status.behind > 0 && <span className="behind">↓{status.behind}</span>}
          </span>
        )}
      </div>
      )}

      <div className="actions">
        {busy && <span className="busy">{busy}…</span>}
        {repo && (
          <>
            <button className="tb-btn" title="Fetch" disabled={remotes.length === 0} onClick={() => act('fetch', (r) => window.api.fetch(r))}>
              <Icon name="fetch" size={18} />
              <span>Fetch</span>
            </button>
            <button className="tb-btn" title="Pull" disabled={remotes.length === 0} onClick={() => act('pull', (r) => window.api.pull(r))}>
              <Icon name="pull" size={18} />
              <span>Pull</span>
            </button>
            <button className="tb-btn" title="Push" disabled={remotes.length === 0} onClick={() => act('push', (r) => window.api.push(r))}>
              <Icon name="push" size={18} />
              <span>Push</span>
            </button>
            <button className="tb-btn" title="Refresh" onClick={() => void refresh()}>
              <Icon name="refresh" size={18} />
              <span>Refresh</span>
            </button>
          </>
        )}
        <button
          className="tb-btn"
          title="Open repository"
          onClick={() =>
            void window.api.pickDirectory('Open repository').then((p) => (p ? open(p) : undefined))
          }
        >
          <Icon name="open" size={18} />
          <span>Open</span>
        </button>
        <button className="tb-btn" title="Profile & credentials" onClick={toggleProfile}>
          <Icon name="menu" size={18} />
          <span>Menu</span>
        </button>
      </div>
    </header>
  )
}
