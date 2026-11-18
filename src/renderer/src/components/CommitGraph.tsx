import { useMemo } from 'react'
import type { CommitInfo } from '../../../shared/types'
import { layoutGraph, LANE_COLORS } from '../graph'
import { useRepo } from '../store'

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

function refBadge(ref: string): { cls: string; label: string } {
  if (ref.startsWith('tag: ')) return { cls: 'tag', label: ref.slice(5) }
  if (ref.startsWith('origin/') || ref.includes('/')) return { cls: 'remote', label: ref }
  return { cls: 'branch', label: ref }
}

export default function CommitGraph({ commits }: { commits: CommitInfo[] }): React.JSX.Element {
  const { selectedCommit, select, hasMore, loadingMore, loadMore } = useRepo()
  const layout = useMemo(() => layoutGraph(commits), [commits])
  const graphW = (layout.cols + 1) * COL_W + PAD_X

  return (
    <div className="graph-scroll">
      <div className="graph-inner" style={{ paddingLeft: graphW }}>
        <svg
          className="graph-svg"
          width={graphW}
          height={commits.length * ROW_H + ROW_H}
          style={{ left: 0 }}
        >
          {layout.edges.map((e, i) => (
            <path
              key={i}
              d={edgePath(e.r1, e.c1, e.r2, e.c2)}
              stroke={LANE_COLORS[e.colorIdx % LANE_COLORS.length]}
              strokeWidth={1.6}
              fill="none"
              opacity={0.9}
            />
          ))}
          {layout.nodes.map((n, i) => (
            <g key={commits[i].hash}>
              <circle
                cx={x(n.lane)}
                cy={y(i)}
                r={4.2}
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
          ))}
        </svg>
        {commits.map((c, i) => (
          <div
            key={c.hash}
            className={`graph-row${selectedCommit?.hash === c.hash ? ' selected' : ''}`}
            style={{ height: ROW_H }}
            onClick={() => select(selectedCommit?.hash === c.hash ? null : c)}
            data-row={i}
          >
            <span className="refs">
              {c.refs.map((r) => {
                const b = refBadge(r)
                return (
                  <span key={r} className={`ref-badge ${b.cls}`}>
                    {b.label}
                  </span>
                )
              })}
            </span>
            <span className="subject" title={c.subject}>
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
    </div>
  )
}
