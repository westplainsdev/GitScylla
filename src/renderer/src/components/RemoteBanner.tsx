import { useState } from 'react'
import { useRepo } from '../store'

export default function RemoteBanner(): React.JSX.Element | null {
  const { remotes, busy, run } = useRepo()
  const [url, setUrl] = useState('')

  if (remotes.length > 0) return null

  const add = (): void => {
    const u = url.trim()
    if (!u) return
    void run('adding remote', async (repo) => {
      await window.api.addRemote(repo, 'origin', u)
      setUrl('')
    })
  }

  return (
    <div className="remote-banner">
      <span className="remote-banner-label">No remote configured — add one to push:</span>
      <input
        type="text"
        placeholder="https://github.com/user/repo.git"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') add()
        }}
      />
      <button className="mini" disabled={!url.trim() || busy !== null} onClick={add}>
        Add origin
      </button>
    </div>
  )
}
