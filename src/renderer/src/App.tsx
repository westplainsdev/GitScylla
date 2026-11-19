import { useEffect, useState } from 'react'
import { useRepo } from './store'
import Welcome from './components/Welcome'
import TopBar from './components/TopBar'
import TabBar from './components/TabBar'
import ChangesPane from './components/ChangesPane'
import CommitGraph from './components/CommitGraph'
import AuthDialog from './components/AuthDialog'
import ReconcileDialog from './components/ReconcileDialog'
import ProfileSidebar from './components/ProfileSidebar'
import DiffDrawer from './components/DiffDrawer'
import CommitDetail from './components/CommitDetail'
import RemoteBanner from './components/RemoteBanner'
import Splash from './components/Splash'

export default function App(): React.JSX.Element {
  const { repo, commits, error, setError, boot, handleFsChange } = useRepo()
  const [booted, setBooted] = useState(false)
  const [minElapsed, setMinElapsed] = useState(false)
  const [splashGone, setSplashGone] = useState(false)

  useEffect(() => {
    void boot().finally(() => setBooted(true))
    return window.api.onRepoChanged(handleFsChange)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setMinElapsed(true), 1200)
    return () => clearTimeout(t)
  }, [])

  const splashVisible = !(booted && minElapsed)

  if (new URLSearchParams(location.search).has('splash')) {
    return <Splash fading={false} />
  }

  useEffect(() => {
    if (splashVisible) return
    const t = setTimeout(() => setSplashGone(true), 450)
    return () => clearTimeout(t)
  }, [splashVisible])

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
      {repo ? (
        <div className="body">
          <ChangesPane />
          <div className="main-pane">
            <div className="graph-col">
              <RemoteBanner />
              <CommitGraph commits={commits} />
            </div>
            <CommitDetail />
          </div>
        </div>
      ) : (
        <Welcome />
      )}
      <AuthDialog />
      <ReconcileDialog />
      <ProfileSidebar />
      <DiffDrawer />
      {!splashGone && <Splash fading={!splashVisible} />}
    </div>
  )
}
