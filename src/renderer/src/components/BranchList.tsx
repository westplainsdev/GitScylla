import { useState } from 'react'
import { useRepo } from '../store'

export default function BranchList(): React.JSX.Element {
  const { branches, status, busy, run } = useRepo()
  const [collapsed, setCollapsed] = useState(false)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')

  const local = branches.filter((b) => !b.remote)
  const remote = branches.filter((b) => b.remote)

  const checkout = (branch: string): void => {
    if (branch === status?.current) return
    void run('checkout', (r) => window.api.checkout(r, branch))
  }

  const create = (): void => {
    const n = name.trim()
    if (n) void run('branch', (r) => window.api.createBranch(r, n))
    setCreating(false)
    setName('')
  }

  return (
    <div className="branch-list">
      <div className="branch-list-head" onClick={() => setCollapsed(!collapsed)}>
        <span className="collapse-arrow">{collapsed ? '▸' : '▾'}</span>
        <span>Branches</span>
        <button
          className="mini"
          onClick={(e) => {
            e.stopPropagation()
            setCreating(true)
            setCollapsed(false)
          }}
        >
          + New
        </button>
      </div>
      {!collapsed && (
        <div className="branch-items">
          {creating && (
            <input
              className="branch-input"
              autoFocus
              placeholder="branch name — Enter to create"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') create()
                if (e.key === 'Escape') setCreating(false)
              }}
              onBlur={() => setCreating(false)}
            />
          )}
          {local.map((b) => (
            <div
              key={b.name}
              className={`branch-row${b.current ? ' current' : ''}`}
              title={b.name}
              onClick={() => checkout(b.name)}
            >
              <span className="branch-dot">{b.current ? '●' : '○'}</span>
              <span className="branch-name">{b.name}</span>
              {busy && b.current && <span className="branch-busy">{busy}…</span>}
              {!b.current && (
                <button
                  className="mini merge-btn"
                  title={`Merge ${b.name} into ${status?.current ?? 'current'}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    void run('merge', (r) => window.api.mergeBranch(r, b.name))
                  }}
                >
                  merge
                </button>
              )}
            </div>
          ))}
          {remote.length > 0 && <div className="branch-subhead">Remote</div>}
          {remote.map((b) => (
            <div key={b.name} className="branch-row remote" title={b.name}>
              <span className="branch-dot">◌</span>
              <span className="branch-name">{b.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
