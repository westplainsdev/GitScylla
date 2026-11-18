import { useState } from 'react'
import { useRepo } from '../store'
import BranchList from './BranchList'
import StashList from './StashList'

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
  viewing,
  onResolve
}: {
  title: string
  rows: Row[]
  action: string
  actionTitle: string
  onAction: (paths: string[]) => void
  onView: (r: Row) => void
  viewing: string | null
  onResolve?: (r: Row, side: 'ours' | 'theirs') => void
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
          {onResolve && r.kind === 'conflicted' && (
            <>
              <button
                className="mini"
                title="Take our version"
                onClick={(e) => {
                  e.stopPropagation()
                  onResolve(r, 'ours')
                }}
              >
                ours
              </button>
              <button
                className="mini"
                title="Take their version"
                onClick={(e) => {
                  e.stopPropagation()
                  onResolve(r, 'theirs')
                }}
              >
                theirs
              </button>
            </>
          )}
          <button
            className="mini"
            title={r.kind === 'conflicted' ? 'Mark resolved (stage)' : actionTitle}
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

  const resolve = (r: Row, side: 'ours' | 'theirs'): void =>
    void run('resolving', (repo) => window.api.resolveSide(repo, r.path, side))

  const stage = (paths: string[]): void => void run('staging', (repo) => window.api.stage(repo, paths))
  const unstage = (paths: string[]): void => void run('unstaging', (repo) => window.api.unstage(repo, paths))
  const commit = async (): Promise<void> => {
    const r = await run('committing', (repo) => window.api.commit(repo, message))
    if (r !== undefined) setMessage('')
  }

  const clean = staged.length + unstaged.length + untracked.length + conflicted.length === 0

  const inProgress = status.merging || status.rebasing || status.cherryPicking
  const opLabel = status.merging ? 'merge' : status.rebasing ? 'rebase' : 'cherry-pick'

  return (
    <aside className="changes">
      {inProgress && (
        <div className="merge-banner">
          <div className="merge-banner-text">
            <strong>{opLabel} in progress</strong>
            <span>
              {conflicted.length > 0
                ? `${conflicted.length} conflicted file${conflicted.length > 1 ? 's' : ''} — resolve, then commit`
                : 'No conflicts — commit to finish'}
            </span>
          </div>
          <button className="mini danger" onClick={() => run('abort', (repo) => window.api.abortOperation(repo))}>
            Abort
          </button>
        </div>
      )}
      <BranchList />
      <StashList />
      <div className="changes-head">Changes</div>
      <div className="changes-scroll">
        {clean && !inProgress && <div className="clean">Working tree clean</div>}
        <Section title="Conflicted" rows={conflicted} action="✓" actionTitle="Mark resolved" onAction={stage} onView={view} viewing={viewingPath} onResolve={resolve} />
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
