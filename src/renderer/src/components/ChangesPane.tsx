import { useState } from 'react'
import { useRepo } from '../store'
import BranchList from './BranchList'
import StashList from './StashList'
import ConfirmDialog from './ConfirmDialog'

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

/** selection key — a file can appear in both staged and unstaged sections */
const keyOf = (r: Row): string => `${r.kind}:${r.path}`

interface Pending {
  title: string
  paths: string[]
  deleteVerb: boolean
  onConfirm: () => void
}

function Section({
  title,
  rows,
  action,
  actionTitle,
  onAction,
  onView,
  viewing,
  onResolve,
  onDiscard,
  discardTitle,
  selected,
  onToggle
}: {
  title: string
  rows: Row[]
  action: string
  actionTitle: string
  onAction: (paths: string[]) => void
  onView: (r: Row) => void
  viewing: string | null
  onResolve?: (r: Row, side: 'ours' | 'theirs') => void
  /** presence enables per-row + discard-all buttons (unstaged/untracked only) */
  onDiscard?: (paths: string[]) => void
  discardTitle?: string
  selected?: Set<string>
  onToggle?: (r: Row) => void
}): React.JSX.Element | null {
  if (rows.length === 0) return null
  const selectable = !!selected && !!onToggle
  return (
    <div className="file-section">
      <div className="file-section-head">
        <span>
          {title} <em>{rows.length}</em>
        </span>
        <span className="file-section-actions">
          {onDiscard && (
            <button
              className="mini danger"
              title={discardTitle}
              onClick={() => onDiscard(rows.map((r) => r.path))}
            >
              ✕ all
            </button>
          )}
          <button className="mini" title={actionTitle} onClick={() => onAction(rows.map((r) => r.path))}>
            {action} all
          </button>
        </span>
      </div>
      {rows.map((r) => (
        <div
          key={keyOf(r)}
          className={`file-row${viewing === r.path ? ' viewing' : ''}`}
          title={`${r.path} — ${CODE_LABEL[r.code] ?? r.code}`}
          onClick={() => onView(r)}
        >
          {selectable && (
            <input
              type="checkbox"
              checked={selected.has(keyOf(r))}
              onClick={(e) => e.stopPropagation()}
              onChange={() => onToggle(r)}
            />
          )}
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
          {onDiscard && (
            <button
              className="mini danger"
              title={discardTitle}
              onClick={(e) => {
                e.stopPropagation()
                onDiscard([r.path])
              }}
            >
              ✕
            </button>
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
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pending, setPending] = useState<Pending | null>(null)

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
    const r = await run('committing', async (repo) => {
      await window.api.commit(repo, message)
      return true
    })
    if (r) setMessage('')
  }

  // --- discard flows: every route goes through the confirm dialog ---

  const askDiscard = (restore: string[], del: string[]): void => {
    if (restore.length + del.length === 0) return
    const parts: string[] = []
    if (restore.length) parts.push(`revert ${restore.length} modified file${restore.length > 1 ? 's' : ''}`)
    if (del.length) parts.push(`permanently delete ${del.length} untracked file${del.length > 1 ? 's' : ''}`)
    setPending({
      title: 'Discard changes?',
      paths: [...restore, ...del],
      deleteVerb: del.length > 0,
      onConfirm: () =>
        void (async () => {
          await run('discarding', async (repo) => {
            if (restore.length) await window.api.discardChanges(repo, restore)
            if (del.length) await window.api.deleteUntracked(repo, del)
          })
          setSelected(new Set())
        })()
    })
  }

  /** the "oh shit" button — reset --hard + clean -fd across the whole tree */
  const askDiscardAll = (): void => {
    setPending({
      title: 'Discard ALL changes?',
      paths: [...conflicted, ...staged, ...unstaged, ...untracked].map((r) => r.path),
      deleteVerb: true,
      onConfirm: () =>
        void (async () => {
          await run('discarding', (repo) => window.api.discardAll(repo))
          setSelected(new Set())
        })()
    })
  }

  const toggle = (r: Row): void =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(keyOf(r))) next.delete(keyOf(r))
      else next.add(keyOf(r))
      return next
    })

  const selPaths = (rows: Row[]): string[] =>
    rows.filter((r) => selected.has(keyOf(r))).map((r) => r.path)

  const selStaged = selPaths(staged)
  const selUnstaged = selPaths(unstaged)
  const selUntracked = selPaths(untracked)
  const selCount = selStaged.length + selUnstaged.length + selUntracked.length

  const clear = (): void => setSelected(new Set())

  const clean = staged.length + unstaged.length + untracked.length + conflicted.length === 0

  const inProgress =
    status.merging || status.rebasing || status.cherryPicking || status.reverting
  const opLabel = status.merging
    ? 'merge'
    : status.rebasing
      ? 'rebase'
      : status.cherryPicking
        ? 'cherry-pick'
        : 'revert'

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
      <div className="changes-head">
        <span>Changes</span>
        {!clean && (
          <button
            className="mini danger nuke-all"
            title="Discard ALL changes — staged, unstaged, and untracked (cannot be undone)"
            onClick={askDiscardAll}
          >
            ✕ all
          </button>
        )}
      </div>
      {selCount > 0 && (
        <div className="selection-bar">
          <span>{selCount} selected</span>
          <button
            className="mini"
            disabled={selUnstaged.length + selUntracked.length === 0}
            onClick={() => {
              stage([...selUnstaged, ...selUntracked])
              clear()
            }}
          >
            Stage
          </button>
          <button
            className="mini"
            disabled={selStaged.length === 0}
            onClick={() => {
              unstage(selStaged)
              clear()
            }}
          >
            Unstage
          </button>
          <button
            className="mini danger"
            disabled={selUnstaged.length + selUntracked.length === 0}
            onClick={() => askDiscard(selUnstaged, selUntracked)}
          >
            Discard
          </button>
          <button className="mini" onClick={clear}>
            Clear
          </button>
        </div>
      )}
      <div className="changes-scroll">
        {clean && !inProgress && <div className="clean">Working tree clean</div>}
        <Section title="Conflicted" rows={conflicted} action="✓" actionTitle="Mark resolved" onAction={stage} onView={view} viewing={viewingPath} onResolve={resolve} />
        <Section title="Staged" rows={staged} action="−" actionTitle="Unstage" onAction={unstage} onView={view} viewing={viewingPath} selected={selected} onToggle={toggle} />
        <Section title="Unstaged" rows={unstaged} action="+" actionTitle="Stage" onAction={stage} onView={view} viewing={viewingPath} onDiscard={(paths) => askDiscard(paths, [])} discardTitle="Discard changes (restore last version)" selected={selected} onToggle={toggle} />
        <Section title="Untracked" rows={untracked} action="+" actionTitle="Stage" onAction={stage} onView={view} viewing={viewingPath} onDiscard={(paths) => askDiscard([], paths)} discardTitle="Delete (permanent)" selected={selected} onToggle={toggle} />
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
      {pending && (
        <ConfirmDialog
          title={pending.title}
          body={
            <>
              <p>
                {pending.deleteVerb
                  ? 'This cannot be undone — deleted untracked files are gone for good.'
                  : 'This reverts the file to its last version and cannot be undone.'}
              </p>
              <ul className="discard-list">
                {pending.paths.slice(0, 8).map((p) => (
                  <li key={p}>{p}</li>
                ))}
                {pending.paths.length > 8 && <li>…and {pending.paths.length - 8} more</li>}
              </ul>
            </>
          }
          confirmLabel={pending.deleteVerb ? 'Discard / delete' : 'Discard changes'}
          onConfirm={() => {
            pending.onConfirm()
            setPending(null)
          }}
          onCancel={() => setPending(null)}
        />
      )}
    </aside>
  )
}
