import { useRepo } from '../store'

export default function TabBar(): React.JSX.Element {
  const { tabs, activePath, activateTab, activateHome, closeTab, open } = useRepo()

  return (
    <div className="tabbar">
      <div
        className={`tab home-tab${activePath === null ? ' active' : ''}`}
        data-tip="Home"
        onClick={() => activePath !== null && activateHome()}
      >
        <span className="tab-name">⌂ Home</span>
      </div>
      {tabs.map((t) => (
        <div
          key={t.path}
          className={`tab${t.path === activePath ? ' active' : ''}`}
          data-tip={t.path}
          onClick={() => t.path !== activePath && void activateTab(t.path)}
        >
          {t.stale && <span className="stale-dot" data-tip="Changed on disk" />}
          <span className="tab-name">{t.name}</span>
          <button
            className="tab-close"
            data-tip="Close tab"
            aria-label="Close tab"
            onClick={(e) => {
              e.stopPropagation()
              void closeTab(t.path)
            }}
          >
            ×
          </button>
        </div>
      ))}
      <button
        className="tab-add"
        data-tip="Open repository"
        onClick={() =>
          void window.api.pickDirectory('Open repository').then((p) => (p ? open(p) : undefined))
        }
      >
        +
      </button>
    </div>
  )
}
