import { useState } from 'react'
import { useRepo } from '../store'

interface Row {
  path: string
  code: string
  kind: 'staged' | 'unstaged' | 'untracked' | 'conflicted'
}

const CODE_LABEL: Record<string, string> = {
  M: 'modified',
  A: 'added',
  D: 'deleted',
  R: 'renamed',
  C: 'copied',
  U: 'conflict',
  '?': 'new'
}

function Section({
  title,
  rows,
  action,
  actionTitle,
  onAction,
  onView,
  viewing
}: {
  title: string
  rows: Row[]
  action: string
  actionTitle: string
  onAction: (paths: string[]) => void
  onView: (r: Row) => void
  viewing: string | null
}): React.JSX.Element | null {
  if (rows.length === 0) return null
  return (
    <div className="file-section">
      <div className="file-section-head">
        <span>
          {title} <em>{rows.length}</em>
        </span>
        <button className="mini" title={actionTitle} onClick={() => onAction(rows.map((r) => r.path))}>
          {action} all
        </button>
      </div>
      {rows.map((r) => (
        <div
          key={r.kind + r.path}
          className={`file-row${viewing === r.path ? ' viewing' : ''}`}
          title={`${r.path} — ${CODE_LABEL[r.code] ?? r.code}`}
          onClick={() => onView(r)}
        >
          <span className={`code code-${r.code === '?' ? 'A' : r.code}`}>{r.code === ' ' ? 'M' : r.code}</span>
          <span className="file-path">{r.path}</span>
          <button
            className="mini"
            onClick={(e) => {
              e.stopPropagation()
              onAction([r.path])
            }}
          >
            {action}
          </button>
        </div>
      ))}
    </div>
  )
}

export default function ChangesPane(): React.JSX.Element {
  const { status, busy, run, diffView, openDiff } = useRepo()
  const [message, setMessage] = useState('')

  if (!status) return <aside className="changes" />

  const staged: Row[] = []
  const unstaged: Row[] = []
  const untracked: Row[] = []
  const conflicted: Row[] = []

  for (const f of status.files) {
    if (f.index === '?' && f.workingDir === '?') {
      untracked.push({ path: f.path, code: '?', kind: 'untracked' })
      continue
    }
    if (f.index === 'U' || f.workingDir === 'U' || status.conflicted.includes(f.path)) {
      conflicted.push({ path: f.path, code: 'U', kind: 'conflicted' })
      continue
    }
    if (f.index !== ' ') {
      staged.push({ path: f.path, code: f.index, kind: 'staged' })
    }
    if (f.workingDir !== ' ') {
      unstaged.push({ path: f.path, code: f.workingDir, kind: 'unstaged' })
    }
  }

  const viewingPath = diffView && !diffView.hash ? diffView.path : null
  const view = (r: Row): void => void openDiff({ path: r.path, staged: r.kind === 'staged' })

  const stage = (paths: string[]): void => void run('staging', () => window.api.stage(paths))
  const unstage = (paths: string[]): void => void run('unstaging', () => window.api.unstage(paths))
  const commit = async (): Promise<void> => {
    const r = await run('committing', () => window.api.commit(message))
    if (r !== undefined) setMessage('')
  }

  const clean = staged.length + unstaged.length + untracked.length + conflicted.length === 0

  return (
    <aside className="changes">
      <div className="changes-head">Changes</div>
      <div className="changes-scroll">
        {clean && <div className="clean">Working tree clean</div>}
        <Section title="Conflicted" rows={conflicted} action="stage" actionTitle="Mark resolved" onAction={stage} onView={view} viewing={viewingPath} />
        <Section title="Staged" rows={staged} action="−" actionTitle="Unstage" onAction={unstage} onView={view} viewing={viewingPath} />
        <Section title="Unstaged" rows={unstaged} action="+" actionTitle="Stage" onAction={stage} onView={view} viewing={viewingPath} />
        <Section title="Untracked" rows={untracked} action="+" actionTitle="Stage" onAction={stage} onView={view} viewing={viewingPath} />
      </div>
      <div className="commit-box">
        <textarea
          placeholder="Commit message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void commit()
          }}
        />
        <button
          className="primary"
          disabled={!message.trim() || staged.length === 0 || busy !== null}
          onClick={() => void commit()}
        >
          Commit {staged.length > 0 ? `(${staged.length})` : ''} to {status.current ?? 'HEAD'}
        </button>
      </div>
    </aside>
  )
}
