import { useEffect } from 'react'
import { useRepo } from './store'
import Welcome from './components/Welcome'
import TopBar from './components/TopBar'
import ChangesPane from './components/ChangesPane'
import CommitGraph from './components/CommitGraph'
import AuthDialog from './components/AuthDialog'
import ProfileSidebar from './components/ProfileSidebar'

export default function App(): React.JSX.Element {
  const { repo, commits, selectedCommit, error, refresh, setError } = useRepo()

  useEffect(() => {
    if (!repo) return
    return window.api.onRepoChanged(() => void refresh())
  }, [repo, refresh])

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
            </div>
          )}
        </div>
      </div>
      <AuthDialog />
      <ProfileSidebar />
    </div>
  )
}
