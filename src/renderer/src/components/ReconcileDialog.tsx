import { useState } from 'react'
import { useRepo } from '../store'

const MODES: { rebase: boolean; label: string; desc: string }[] = [
  {
    rebase: false,
    label: 'Merge',
    desc: 'Create a merge commit joining your branch and the remote.'
  },
  {
    rebase: true,
    label: 'Rebase',
    desc: 'Replay your local commits on top of the remote — linear history.'
  }
]

/** shown when git refuses a pull because divergent branches have no configured strategy */
export default function ReconcileDialog(): React.JSX.Element | null {
  const { pullDivergent, setPullDivergent, run } = useRepo()
  const [rebase, setRebase] = useState(false)
  const [remember, setRemember] = useState(false)

  if (!pullDivergent) return null

  const go = (): void => {
    setPullDivergent(false)
    void run('pull', async (repo) => {
      if (remember) await window.api.setPullStrategy(repo, rebase)
      return window.api.pull(repo, rebase)
    })
  }

  return (
    <div className="modal-overlay" onClick={() => setPullDivergent(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Branches have diverged</h2>
        <div className="modal-hint">
          <p>Your branch and the remote each have commits the other lacks. Reconcile with:</p>
          {MODES.map((m) => (
            <label key={m.label} className="radio-opt">
              <input
                type="radio"
                name="reconcile-mode"
                checked={rebase === m.rebase}
                onChange={() => setRebase(m.rebase)}
              />
              <span>
                <strong>{m.label}</strong>
                <small>{m.desc}</small>
              </span>
            </label>
          ))}
          <label className="radio-opt">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            <span>
              <strong>Remember for this repo</strong>
              <small>Writes pull.rebase to the repo&apos;s git config.</small>
            </span>
          </label>
        </div>
        <div className="modal-actions">
          <button type="button" onClick={() => setPullDivergent(false)}>
            Cancel
          </button>
          <button type="button" className="primary" onClick={go} autoFocus>
            Pull
          </button>
        </div>
      </div>
    </div>
  )
}
