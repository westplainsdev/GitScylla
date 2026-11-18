import { useState } from 'react'
import { useRepo } from '../store'

export default function TopBar(): React.JSX.Element {
  const { repo, status, branches, busy, run, refresh, open } = useRepo()
  const [newBranch, setNewBranch] = useState<string | null>(null)
  const [branchName, setBranchName] = useState('')

  const local = branches.filter((b) => !b.remote)

  const act = (label: string, fn: () => Promise<unknown>): void => {
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
              onChange={(e) => act('checkout', () => window.api.checkout(e.target.value))}
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
                act('branch', () => window.api.createBranch(branchName.trim()))
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
        <button onClick={() => act('fetch', () => window.api.fetch())}>Fetch</button>
        <button onClick={() => act('pull', () => window.api.pull())}>Pull</button>
        <button onClick={() => act('push', () => window.api.push())}>Push</button>
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
      </div>
    </header>
  )
}
