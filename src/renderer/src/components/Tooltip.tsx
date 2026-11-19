import { useEffect, useLayoutEffect, useRef, useState } from 'react'

interface Tip {
  text: string
  x: number
  y: number
  above: boolean
}

const SHOW_DELAY = 450

/**
 * App-styled replacement for the native `title` tooltip. Any element with a
 * `data-tip` attribute gets this on hover — fixed positioning so scroll
 * containers can't clip it.
 */
export default function Tooltip(): React.JSX.Element | null {
  const [tip, setTip] = useState<Tip | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const timer = useRef(0)

  useEffect(() => {
    const hide = (): void => {
      window.clearTimeout(timer.current)
      setTip(null)
    }
    const onOver = (e: MouseEvent): void => {
      const el = (e.target as HTMLElement | null)?.closest?.('[data-tip]')
      window.clearTimeout(timer.current)
      if (!(el instanceof HTMLElement)) return setTip(null)
      const text = el.getAttribute('data-tip')
      if (!text) return setTip(null)
      const r = el.getBoundingClientRect()
      timer.current = window.setTimeout(() => {
        // flip above when there isn't room below
        const above = r.bottom + 48 > window.innerHeight
        setTip({ text, x: r.left + r.width / 2, y: above ? r.top - 8 : r.bottom + 8, above })
      }, SHOW_DELAY)
    }
    document.addEventListener('mouseover', onOver)
    document.addEventListener('mousedown', hide, true)
    document.addEventListener('scroll', hide, true)
    window.addEventListener('blur', hide)
    return () => {
      window.clearTimeout(timer.current)
      document.removeEventListener('mouseover', onOver)
      document.removeEventListener('mousedown', hide, true)
      document.removeEventListener('scroll', hide, true)
      window.removeEventListener('blur', hide)
    }
  }, [])

  // clamp horizontally once we can measure the tooltip
  useLayoutEffect(() => {
    if (!tip || !ref.current) return
    const w = ref.current.offsetWidth
    const left = Math.min(Math.max(tip.x - w / 2, 8), window.innerWidth - w - 8)
    ref.current.style.left = `${left}px`
  }, [tip])

  if (!tip) return null
  return (
    <div ref={ref} className={`app-tip${tip.above ? ' above' : ''}`} style={{ top: tip.y }}>
      {tip.text}
    </div>
  )
}
