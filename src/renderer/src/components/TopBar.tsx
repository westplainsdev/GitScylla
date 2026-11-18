import { useState } from 'react'
import { useRepo } from '../store'

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
        <span className="repo-name">{repo?.name}</span>
        <span className="repo-path" title={repo?.path}>
          {repo?.path}
        </span>
      </div>

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

      <div className="actions">
        {busy && <span className="busy">{busy}…</span>}
        <button disabled={remotes.length === 0} onClick={() => act('fetch', (r) => window.api.fetch(r))}>
          Fetch
        </button>
        <button disabled={remotes.length === 0} onClick={() => act('pull', (r) => window.api.pull(r))}>
          Pull
        </button>
        <button disabled={remotes.length === 0} onClick={() => act('push', (r) => window.api.push(r))}>
          Push
        </button>
        <button title="Refresh" onClick={() => void refresh()}>
          ⟳
        </button>
        <button
          onClick={() =>
            void window.api.pickDirectory('Open repository').then((p) => (p ? open(p) : undefined))
          }
        >
          Open…
        </button>
        <button title="Profile & credentials" onClick={toggleProfile}>
          ☰
        </button>
      </div>
    </header>
  )
}
