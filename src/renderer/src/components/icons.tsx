/** inline SVG action icons — stroke follows currentColor */
const ICONS: Record<string, React.JSX.Element> = {
  // cloud with down arrow
  fetch: (
    <>
      <path d="M17.5 19a4.5 4.5 0 1 0-.9-8.92A6 6 0 0 0 6.7 8 4 4 0 0 0 7 19h10.5z" />
      <path d="M12 12v4.5m0 0l-2-2m2 2l2-2" />
    </>
  ),
  // down arrow into tray
  pull: <path d="M12 4v10m0 0l-4-4m4 4l4-4M4 15v4h16v-4" />,
  // up arrow out of tray
  push: <path d="M12 14V4m0 0L8 8m4-4l4 4M4 15v4h16v-4" />,
  // circular arrow
  refresh: <path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v4h-4" />,
  // folder
  open: (
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  ),
  // hamburger
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  // git branch: trunk with forked lane
  branch: (
    <>
      <circle cx="6" cy="5" r="2.5" />
      <circle cx="6" cy="19" r="2.5" />
      <path d="M6 7.5v9M6 13a8 8 0 0 0 8-8" />
      <circle cx="17" cy="5" r="2.5" />
    </>
  )
}

export default function Icon({ name, size = 16 }: { name: string; size?: number }): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICONS[name] ?? null}
    </svg>
  )
}
