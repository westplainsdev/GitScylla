import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export interface MenuItem {
  label: string
  hint?: string
  danger?: boolean
  onClick: () => void
}

interface Props {
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}

/** right-click popup menu anchored at the cursor; overlay catches dismiss clicks */
export default function ContextMenu({ x, y, items, onClose }: Props): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })

  // clamp inside the window once we know the rendered size
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos({
      left: Math.max(4, Math.min(x, window.innerWidth - r.width - 8)),
      top: Math.max(4, Math.min(y, window.innerHeight - r.height - 8))
    })
  }, [x, y])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="ctx-overlay"
      onClick={onClose}
      onContextMenu={(e) => {
        e.preventDefault()
        onClose()
      }}
    >
      <div ref={ref} className="ctx-menu" style={pos} onClick={(e) => e.stopPropagation()}>
        {items.map((it) => (
          <button
            key={it.label}
            className={`ctx-item${it.danger ? ' danger' : ''}`}
            onClick={() => {
              onClose()
              it.onClick()
            }}
          >
            <span>{it.label}</span>
            {it.hint && <span className="ctx-hint">{it.hint}</span>}
          </button>
        ))}
      </div>
    </div>
  )
}
