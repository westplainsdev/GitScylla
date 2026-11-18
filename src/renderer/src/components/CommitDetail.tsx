import { useRepo } from '../store'

export default function CommitDetail(): React.JSX.Element | null {
  const { selectedCommit, commitFileList, select, openDiff } = useRepo()

  if (!selectedCommit) return null
  const c = selectedCommit

  return (
    <div className="detail-pane">
      <div className="detail-head">
        <code>{c.hash.slice(0, 10)}</code>
        <button className="mini" title="Close" onClick={() => void select(null)}>
          ✕
        </button>
      </div>
      <div className="detail-subject">{c.subject}</div>
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
