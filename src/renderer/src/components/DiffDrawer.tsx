import { useEffect, useMemo } from 'react'
import { parseDiff } from '../diff'
import { useRepo } from '../store'

export default function DiffDrawer(): React.JSX.Element | null {
  const { diffView, diffText, diffLoading, closeDiff } = useRepo()

  useEffect(() => {
    if (!diffView) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') closeDiff()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [diffView, closeDiff])

  const lines = useMemo(() => (diffText ? parseDiff(diffText) : []), [diffText])

  if (!diffView) return null

  const title =
    diffView.stashIndex !== undefined
      ? `${diffView.path} (stash diff)`
      : diffView.hash
        ? `${diffView.path} @ ${diffView.hash.slice(0, 7)}`
        : `${diffView.path} ${diffView.staged ? '(staged)' : '(working tree)'}`

  return (
    <aside className="diff-drawer">
      <div className="diff-head">
        <code className="diff-title" data-tip={diffView.path}>
          {title}
        </code>
        <button className="mini" onClick={closeDiff}>
          ✕
        </button>
      </div>
      <div className="diff-body">
        {diffLoading && <div className="diff-empty">Loading…</div>}
        {!diffLoading && lines.length === 0 && <div className="diff-empty">No changes</div>}
        {!diffLoading && lines.length > 0 && (
          <table className="diff-table">
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} className={`dl-${l.type}`}>
                  <td className="dl-no">{l.oldNo ?? ''}</td>
                  <td className="dl-no">{l.newNo ?? ''}</td>
                  <td className="dl-mark">
                    {l.type === 'add' ? '+' : l.type === 'del' ? '−' : l.type === 'hunk' ? '' : ' '}
                  </td>
                  <td className="dl-code">{l.content}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </aside>
  )
}
