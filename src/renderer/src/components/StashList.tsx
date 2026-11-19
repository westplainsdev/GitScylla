import { useState } from 'react'
import { useRepo } from '../store'

export default function StashList(): React.JSX.Element {
  const { stashes, status, run, openDiff } = useRepo()
  const [collapsed, setCollapsed] = useState(stashes.length === 0)
  const [stashing, setStashing] = useState(false)
  const [msg, setMsg] = useState('')

  const dirty =
    status !== null &&
    status.files.length + status.staged.length + status.modified.length > 0

  const save = (): void => {
    void run('stash', (r) => window.api.stash(r, msg.trim() || undefined))
    setStashing(false)
    setMsg('')
  }

  return (
    <div className="branch-list stash-list">
      <div className="branch-list-head" onClick={() => setCollapsed(!collapsed)}>
        <span className="collapse-arrow">{collapsed ? '▸' : '▾'}</span>
        <span>
          Stash <em className="count">{stashes.length || ''}</em>
        </span>
        <button
          className="mini"
          disabled={!dirty}
          data-tip={dirty ? 'Stash current changes' : 'No changes to stash'}
          onClick={(e) => {
            e.stopPropagation()
            setStashing(true)
            setCollapsed(false)
          }}
        >
          + Stash
        </button>
      </div>
      {!collapsed && (
        <div className="branch-items">
          {stashing && (
            <input
              className="branch-input"
              autoFocus
              placeholder="stash message (optional) — Enter"
              value={msg}
              onChange={(e) => setMsg(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') save()
                if (e.key === 'Escape') setStashing(false)
              }}
              onBlur={() => setStashing(false)}
            />
          )}
          {stashes.length === 0 && !stashing && (
            <div className="empty-note stash-empty">No stashes</div>
          )}
          {stashes.map((s) => (
            <div
              key={s.index}
              className="branch-row stash-row"
              data-tip={s.message}
              onClick={() =>
                void openDiff({ path: `stash@{${s.index}}`, staged: false, stashIndex: s.index })
              }
            >
              <span className="branch-dot">≡</span>
              <span className="branch-name">{s.message}</span>
              <span className="stash-actions">
                <button
                  className="mini"
                  data-tip="Apply and remove from stash"
                  onClick={(e) => {
                    e.stopPropagation()
                    void run('stash pop', (r) => window.api.stashPop(r, s.index))
                  }}
                >
                  pop
                </button>
                <button
                  className="mini"
                  data-tip="Apply, keep in stash"
                  onClick={(e) => {
                    e.stopPropagation()
                    void run('stash apply', (r) => window.api.stashApply(r, s.index))
                  }}
                >
                  apply
                </button>
                <button
                  className="mini danger"
                  data-tip="Drop stash"
                  onClick={(e) => {
                    e.stopPropagation()
                    void run('stash drop', (r) => window.api.stashDrop(r, s.index))
                  }}
                >
                  drop
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
