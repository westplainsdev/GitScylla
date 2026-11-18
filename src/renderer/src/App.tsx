import { useEffect } from 'react'
import { useRepo } from './store'
import Welcome from './components/Welcome'
import TopBar from './components/TopBar'
import TabBar from './components/TabBar'
import ChangesPane from './components/ChangesPane'
import CommitGraph from './components/CommitGraph'
import AuthDialog from './components/AuthDialog'
import ProfileSidebar from './components/ProfileSidebar'
import DiffDrawer from './components/DiffDrawer'

export default function App(): React.JSX.Element {
  const {
    repo,
    commits,
    selectedCommit,
    commitFileList,
    error,
    setError,
    openDiff,
    boot,
    handleFsChange
  } = useRepo()

  useEffect(() => {
    void boot()
    return window.api.onRepoChanged(handleFsChange)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!repo) {
    return (
      <>
        <Welcome />
        <AuthDialog />
        <ProfileSidebar />
      </>
    )
  }

  return (
    <div className="app">
      <TopBar />
      <TabBar />
      {error && (
        <div className="error-bar" onClick={() => setError(null)}>
          {error}
          <span className="dismiss">✕</span>
        </div>
      )}
      <div className="body">
        <ChangesPane />
        <div className="main-pane">
          <CommitGraph commits={commits} />
          {selectedCommit && (
            <div className="detail-bar">
              <code>{selectedCommit.hash.slice(0, 10)}</code>
              <span className="detail-subject">{selectedCommit.subject}</span>
              <span className="detail-meta">
                {selectedCommit.author} &lt;{selectedCommit.email}&gt; ·{' '}
                {new Date(selectedCommit.date * 1000).toLocaleString()}
              </span>
              {commitFileList.length > 0 && (
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
                          hash: selectedCommit.hash,
                          parent: selectedCommit.parents[0] ?? null
                        })
                      }
                    >
                      <span className={`code code-${f.index}`}>{f.index}</span>
                      {f.path}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <AuthDialog />
      <ProfileSidebar />
      <DiffDrawer />
    </div>
  )
}
