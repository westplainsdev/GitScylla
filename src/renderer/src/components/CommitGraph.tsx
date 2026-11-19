import { useMemo, useState } from 'react'
import type { CommitInfo, ResetMode } from '../../../shared/types'
import { layoutGraph, LANE_COLORS, ancestorsOf } from '../graph'
import { useRepo } from '../store'
import ContextMenu, { type MenuItem } from './ContextMenu'
import ConfirmDialog from './ConfirmDialog'

const ROW_H = 26
const COL_W = 12
const PAD_X = 10

const x = (c: number): number => PAD_X + c * COL_W
const y = (r: number): number => r * ROW_H + ROW_H / 2

function edgePath(r1: number, c1: number, r2: number, c2: number): string {
  const x1 = x(c1)
  const y1 = y(r1)
  const x2 = x(c2)
  const y2 = y(r2)
  if (x1 === x2) return `M ${x1} ${y1} L ${x2} ${y2}`
  const d = Math.min(ROW_H * 1.2, (y2 - y1) * 0.45)
  return `M ${x1} ${y1} C ${x1} ${y1 + d}, ${x2} ${y2 - d}, ${x2} ${y2}`
}

function relTime(unixSec: number): string {
  const s = Math.max(1, Math.floor(Date.now() / 1000) - unixSec)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  const mo = Math.floor(d / 30)
  if (mo < 12) return `${mo}mo ago`
  return `${Math.floor(mo / 12)}y ago`
}

function refBadge(
  ref: string,
  remoteNames: string[]
): { cls: string; label: string; title: string } {
  if (ref.startsWith('tag: ')) {
    const label = ref.slice(5)
    return { cls: 'tag', label, title: `Tag '${label}' — fixed pointer to a commit` }
  }
  if (remoteNames.some((n) => ref.startsWith(`${n}/`))) {
    return {
      cls: 'remote',
      label: ref,
      title: `Remote-tracking branch '${ref}' — last-known state on the remote`
    }
  }
  return { cls: 'branch', label: ref, title: `Local branch '${ref}'` }
}

const RESET_MODES: { mode: ResetMode; label: string; desc: string }[] = [
  {
    mode: 'soft',
    label: 'Keep changes staged',
    desc: 'Changes from the removed commits stay staged, ready to recommit.'
  },
  {
    mode: 'mixed',
    label: 'Keep changes unstaged',
    desc: 'Changes stay in your working tree as uncommitted edits.'
  },
  {
    mode: 'hard',
    label: 'Discard changes',
    desc: 'Changes are deleted along with the commits — cannot be undone.'
  }
]

function ResetDialog({
  commit,
  branch,
  rewritesPushed,
  onConfirm,
  onCancel
}: {
  commit: CommitInfo
  branch: string
  rewritesPushed: boolean
  onConfirm: (mode: ResetMode) => void
  onCancel: () => void
}): React.JSX.Element {
  const [mode, setMode] = useState<ResetMode>('mixed')
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>
          Reset {branch} to <code>{commit.hash.slice(0, 10)}</code>
        </h2>
        <div className="modal-hint">
          <p>
            Commits after this one are removed from {branch}.
            {rewritesPushed && (
              <span className="modal-warn">
                {' '}
                Some are already on the remote — reverting is safer, or you&apos;ll need to
                force-push.
              </span>
            )}
          </p>
          {RESET_MODES.map((m) => (
            <label key={m.mode} className="radio-opt">
              <input
                type="radio"
                name="reset-mode"
                checked={mode === m.mode}
                onChange={() => setMode(m.mode)}
              />
              <span>
                <strong>{m.label}</strong>
                <small>{m.desc}</small>
              </span>
            </label>
          ))}
        </div>
        <div className="modal-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={`primary${mode === 'hard' ? ' danger' : ''}`}
            onClick={() => onConfirm(mode)}
            autoFocus
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  )
}

export default function CommitGraph({ commits }: { commits: CommitInfo[] }): React.JSX.Element {
  const {
    selectedCommit,
    select,
    hasMore,
    loadingMore,
    loadMore,
    status,
    run,
    highlightRef,
    pinnedRef,
    remotes
  } = useRepo()
  const layout = useMemo(() => layoutGraph(commits), [commits])
  const graphW = (layout.cols + 1) * COL_W + PAD_X

  const [menu, setMenu] = useState<{ x: number; y: number; c: CommitInfo } | null>(null)
  const [resetTarget, setResetTarget] = useState<CommitInfo | null>(null)
  const [revertTarget, setRevertTarget] = useState<CommitInfo | null>(null)

  const current = status?.current
  const tracking = status?.tracking
  const remoteNames = useMemo(() => remotes.map((r) => r.name), [remotes])
  const byHash = useMemo(() => new Map(commits.map((c) => [c.hash, c])), [commits])
  const headCommit = useMemo(
    () => (current ? commits.find((c) => c.refs.includes(current)) : undefined),
    [commits, current]
  )
  const remoteTip = useMemo(
    () => (tracking ? commits.find((c) => c.refs.includes(tracking)) : undefined),
    [commits, tracking]
  )
  const onHeadBranch = useMemo(
    () => (headCommit ? ancestorsOf(byHash, [headCommit.hash]) : new Set<string>()),
    [byHash, headCommit]
  )

  const menuItems = (c: CommitInfo): MenuItem[] => {
    const items: MenuItem[] = []
    if (headCommit && c.hash === headCommit.hash && c.parents.length > 0) {
      items.push({
        label: 'Undo commit',
        hint: 'keep changes staged',
        onClick: () => {
          void select(null)
          void run('undo commit', (repo) => window.api.resetTo(repo, c.parents[0], 'soft'))
        }
      })
    }
    if (current && c.hash !== headCommit?.hash && onHeadBranch.has(c.hash)) {
      items.push({
        label: `Reset ${current} to this commit…`,
        onClick: () => setResetTarget(c)
      })
    }
    items.push({ label: 'Revert commit…', onClick: () => setRevertTarget(c) })
    return items
  }

  // resetting to this commit would drop the remote tip → pushed history rewritten
  const resetDropsRemote =
    resetTarget && remoteTip ? !ancestorsOf(byHash, [resetTarget.hash]).has(remoteTip.hash) : false

  /**
   * Spotlight: the checked-out branch's first-parent chain stays lit and
   * everything else dims; hovering another branch temporarily spotlights it.
   * `fp[i]` = row of commit i's first parent (undefined → beyond window/root).
   */
  const chain = useMemo(() => {
    const ref = highlightRef ?? pinnedRef ?? current
    if (!ref) return null
    const rowOf = new Map(commits.map((c, i) => [c.hash, i]))
    let i = commits.findIndex((c) => c.refs.includes(ref))
    if (i === -1) return null // tip outside the loaded window — nothing to light
    const rows = new Set<number>()
    while (i !== -1 && !rows.has(i)) {
      rows.add(i)
      const p = commits[i].parents[0]
      i = p !== undefined ? (rowOf.get(p) ?? -1) : -1
    }
    return {
      rows,
      fp: commits.map((c) => (c.parents[0] ? rowOf.get(c.parents[0]) : undefined))
    }
  }, [commits, highlightRef, pinnedRef, current])

  return (
    <div className="graph-scroll">
      <div className="graph-inner" style={{ paddingLeft: graphW }}>
        <svg
          className="graph-svg"
          width={graphW}
          height={commits.length * ROW_H + ROW_H}
          style={{ left: 0 }}
        >
          {layout.edges.map((e, i) => {
            const lit =
              chain !== null && chain.rows.has(e.r1) && e.r2 === (chain.fp[e.r1] ?? commits.length)
            return (
              <path
                key={i}
                d={edgePath(e.r1, e.c1, e.r2, e.c2)}
                stroke={LANE_COLORS[e.colorIdx % LANE_COLORS.length]}
                strokeWidth={lit ? 2.4 : 1.6}
                fill="none"
                opacity={chain ? (lit ? 1 : 0.12) : 0.9}
              />
            )
          })}
          {layout.nodes.map((n, i) => {
            const lit = chain !== null && chain.rows.has(i)
            return (
              <g key={commits[i].hash} opacity={chain ? (lit ? 1 : 0.15) : 1}>
                <circle
                  cx={x(n.lane)}
                  cy={y(i)}
                  r={lit ? 5 : 4.2}
                  fill={LANE_COLORS[n.colorIdx % LANE_COLORS.length]}
                  stroke="#0d1117"
                  strokeWidth={2}
                />
                {n.isMerge && (
                  <circle
                    cx={x(n.lane)}
                    cy={y(i)}
                    r={7}
                    fill="none"
                    stroke={LANE_COLORS[n.colorIdx % LANE_COLORS.length]}
                    strokeWidth={1}
                    opacity={0.6}
                  />
                )}
              </g>
            )
          })}
        </svg>
        {commits.map((c, i) => (
          <div
            key={c.hash}
            className={`graph-row${selectedCommit?.hash === c.hash ? ' selected' : ''}`}
            style={{ height: ROW_H }}
            onClick={() => select(selectedCommit?.hash === c.hash ? null : c)}
            onContextMenu={(e) => {
              e.preventDefault()
              setMenu({ x: e.clientX, y: e.clientY, c })
            }}
            data-row={i}
          >
            <span className="refs">
              {c.refs.map((r) => {
                const b = refBadge(r, remoteNames)
                return (
                  <span key={r} className={`ref-badge ${b.cls}`} data-tip={b.title}>
                    {b.label}
                  </span>
                )
              })}
            </span>
            <span className="subject" data-tip={c.subject}>
              {c.subject}
            </span>
            <span className="author">{c.author}</span>
            <span className="date">{relTime(c.date)}</span>
          </div>
        ))}
        {hasMore && (
          <div className="graph-loadmore" style={{ height: ROW_H * 2 }}>
            <button className="mini" disabled={loadingMore} onClick={() => void loadMore()}>
              {loadingMore ? 'Loading…' : `Load more (${commits.length} shown)`}
            </button>
          </div>
        )}
      </div>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems(menu.c)}
          onClose={() => setMenu(null)}
        />
      )}
      {resetTarget && current && (
        <ResetDialog
          commit={resetTarget}
          branch={current}
          rewritesPushed={resetDropsRemote}
          onConfirm={(mode) => {
            const t = resetTarget
            setResetTarget(null)
            void select(null)
            void run('reset', (repo) => window.api.resetTo(repo, t.hash, mode))
          }}
          onCancel={() => setResetTarget(null)}
        />
      )}
      {revertTarget && (
        <ConfirmDialog
          title={`Revert ${revertTarget.hash.slice(0, 10)}?`}
          body={
            <p>
              Creates a new commit that undoes <em>{revertTarget.subject}</em> — the original stays
              in history, so this is safe for commits already pushed.
            </p>
          }
          confirmLabel="Revert"
          danger={false}
          onConfirm={() => {
            const t = revertTarget
            setRevertTarget(null)
            void run('revert', (repo) => window.api.revertCommit(repo, t.hash))
          }}
          onCancel={() => setRevertTarget(null)}
        />
      )}
    </div>
  )
}
