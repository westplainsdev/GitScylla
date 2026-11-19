import { useState } from 'react'
import { useRepo } from '../store'

export default function CommitDetail(): React.JSX.Element | null {
  const { selectedCommit, commitFileList, select, openDiff, status, repo, run } = useRepo()
  const [editingHash, setEditingHash] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [loadingMsg, setLoadingMsg] = useState(false)

  if (!selectedCommit) return null
  const c = selectedCommit

  // keyed by hash — selecting another commit exits edit mode automatically
  const editing = editingHash === c.hash
  const isHead = !!status?.current && c.refs.includes(status.current)
  const pushed = !!status?.tracking && status.ahead === 0

  const startEdit = async (): Promise<void> => {
    setEditingHash(c.hash)
    if (!repo) return
    setLoadingMsg(true)
    try {
      // %B pulls the full message so a multi-paragraph body survives the amend
      setDraft((await window.api.commitMessage(repo.path, c.hash)).trim())
    } catch {
      setDraft(c.subject)
    } finally {
      setLoadingMsg(false)
    }
  }

  const apply = (): void => {
    const msg = draft.trim()
    if (!msg) return
    setEditingHash(null)
    void select(null) // amend rewrites the hash — the selection is stale
    void run('amending', (r) => window.api.amendMessage(r, msg))
  }

  return (
    <div className="detail-pane">
      <div className="detail-head">
        <code>{c.hash.slice(0, 10)}</code>
        <button className="mini" title="Close" onClick={() => void select(null)}>
          ✕
        </button>
      </div>
      {editing ? (
        <div className="amend-box">
          <textarea
            className="amend-input"
            value={loadingMsg ? 'Loading…' : draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={Math.min(10, Math.max(2, draft.split('\n').length + 1))}
            autoFocus
            disabled={loadingMsg}
          />
          {pushed && (
            <div className="amend-warn">
              Already pushed to {status?.tracking} — amending rewrites pushed history and will
              require a force-push.
            </div>
          )}
          <div className="amend-actions">
            <button className="mini" onClick={() => setEditingHash(null)}>
              Cancel
            </button>
            <button
              className="mini amend-confirm"
              disabled={!draft.trim() || loadingMsg}
              onClick={apply}
            >
              Amend
            </button>
          </div>
        </div>
      ) : (
        <div className="detail-subject">{c.subject}</div>
      )}
      {isHead && !editing && (
        <button className="mini amend-btn" onClick={() => void startEdit()}>
          Amend message
        </button>
      )}
      <div className="detail-meta">
        {c.author} &lt;{c.email}&gt;
        <br />
        {new Date(c.date * 1000).toLocaleString()}
      </div>
      <div className="detail-count">
        {commitFileList.length} file{commitFileList.length === 1 ? '' : 's'} changed
      </div>
      <div className="detail-files">
        {commitFileList.map((f) => (
          <button
            key={f.path}
            className="detail-file"
            title={`${f.path} (${f.index})`}
            onClick={() =>
              void openDiff({
                path: f.path,
                staged: false,
                hash: c.hash,
                parent: c.parents[0] ?? null
              })
            }
          >
            <span className={`code code-${f.index}`}>{f.index}</span>
            <span className="file-path">{f.path}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
