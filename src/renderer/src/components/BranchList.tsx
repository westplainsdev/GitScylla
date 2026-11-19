import { useMemo, useState } from 'react'
import type { BranchInfo } from '../../../shared/types'
import { layoutGraph, LANE_COLORS } from '../graph'
import { useRepo } from '../store'
import ContextMenu, { type MenuItem } from './ContextMenu'
import ConfirmDialog from './ConfirmDialog'

interface Leaf {
  kind: 'leaf'
  /** last path segment — what's displayed */
  seg: string
  branch: BranchInfo
}

interface Folder {
  kind: 'folder'
  seg: string
  /** full prefix path — collapse-state key, e.g. "feature" or "origin/feature" */
  path: string
  children: Node[]
}

type Node = Leaf | Folder

/** groups branch names on "/" into a folder tree; folders sort before leaves */
function buildTree(branches: BranchInfo[]): Node[] {
  const root: Folder = { kind: 'folder', seg: '', path: '', children: [] }
  for (const b of branches) {
    const segs = b.name.split('/')
    let node = root
    for (const seg of segs.slice(0, -1)) {
      const path = node.path ? `${node.path}/${seg}` : seg
      let next = node.children.find((c): c is Folder => c.kind === 'folder' && c.seg === seg)
      if (!next) {
        next = { kind: 'folder', seg, path, children: [] }
        node.children.push(next)
      }
      node = next
    }
    node.children.push({ kind: 'leaf', seg: segs[segs.length - 1], branch: b })
  }
  const sortRec = (kids: Node[]): void => {
    kids.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1
      return a.seg.localeCompare(b.seg)
    })
    for (const k of kids) if (k.kind === 'folder') sortRec(k.children)
  }
  sortRec(root.children)
  return root.children
}

const INDENT = 14
const PAD = 24

export default function BranchList(): React.JSX.Element {
  const { branches, commits, status, busy, run, setHighlightRef, pinnedRef, setPinnedRef } =
    useRepo()
  const [collapsed, setCollapsed] = useState(false)
  const [folded, setFolded] = useState<Set<string>>(new Set())
  const [remoteCollapsed, setRemoteCollapsed] = useState(false)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [menu, setMenu] = useState<{ x: number; y: number; b: BranchInfo; remote: boolean } | null>(
    null
  )
  const [delTarget, setDelTarget] = useState<{ b: BranchInfo; force: boolean } | null>(null)

  const local = branches.filter((b) => !b.remote)
  const remote = branches.filter((b) => b.remote)
  const localTree = useMemo(() => buildTree(local), [local])
  const remoteTree = useMemo(() => buildTree(remote), [remote])

  /** branch name → lane color of the commit carrying its ref badge */
  const laneColors = useMemo(() => {
    const map = new Map<string, string>()
    if (commits.length === 0) return map
    const layout = layoutGraph(commits)
    commits.forEach((c, i) => {
      const color = LANE_COLORS[layout.nodes[i].colorIdx % LANE_COLORS.length]
      for (const r of c.refs) {
        if (!r.startsWith('tag:') && !map.has(r)) map.set(r, color)
      }
    })
    return map
  }, [commits])

  const checkout = (branch: string): void => {
    if (branch === status?.current) return
    setPinnedRef(null) // the newly-current branch takes the spotlight
    void run('checkout', (r) => window.api.checkout(r, branch))
  }

  const create = (): void => {
    const n = name.trim()
    if (n) void run('branch', (r) => window.api.createBranch(r, n))
    setCreating(false)
    setName('')
  }

  /** safe-delete first; git's "not fully merged" reply promotes to a force-delete confirm */
  const doDelete = async (t: { b: BranchInfo; force: boolean }): Promise<void> => {
    const r = await run('deleting', async (repo) => {
      try {
        await window.api.deleteBranch(repo, t.b.name, t.force)
      } catch (e) {
        if (String(e).includes('GIT_BRANCH_UNMERGED')) return 'unmerged'
        throw e
      }
      return 'ok'
    })
    if (r === 'unmerged') setDelTarget({ b: t.b, force: true })
  }

  const menuItemsFor = (b: BranchInfo, remoteRow: boolean): MenuItem[] => {
    const items: MenuItem[] = []
    if (!remoteRow && !b.current) {
      items.push({ label: 'Checkout', onClick: () => checkout(b.name) })
      items.push({
        label: `Merge into ${status?.current ?? 'current'}`,
        onClick: () => void run('merge', (r) => window.api.mergeBranch(r, b.name))
      })
    }
    items.push({
      label: 'Copy name',
      hint: b.name,
      onClick: () => void navigator.clipboard.writeText(b.name)
    })
    if (!remoteRow && !b.current) {
      items.push({
        label: 'Delete branch…',
        danger: true,
        onClick: () => setDelTarget({ b, force: false })
      })
    }
    return items
  }

  const toggleFold = (path: string): void =>
    setFolded((s) => {
      const next = new Set(s)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })

  const leafRow = (
    b: BranchInfo,
    seg: string,
    depth: number,
    remoteRow: boolean
  ): React.JSX.Element => {
    const laneColor = laneColors.get(b.name)
    return (
      <div
        key={b.name}
        className={`branch-row${b.current ? ' current' : ''}${remoteRow ? ' remote' : ''}${
          pinnedRef === b.name ? ' pinned' : ''
        }`}
        style={{ paddingLeft: PAD + depth * INDENT }}
        title={remoteRow ? b.name : `${b.name} — click to pin, double-click to checkout`}
        onClick={() => setPinnedRef(pinnedRef === b.name ? null : b.name)}
        onDoubleClick={remoteRow ? undefined : () => checkout(b.name)}
        onMouseEnter={() => setHighlightRef(b.name)}
        onMouseLeave={() => setHighlightRef(null)}
      >
        <span className="branch-dot" style={{ color: laneColor }}>
          {remoteRow ? '◌' : b.current ? '●' : '○'}
        </span>
        <span className="branch-name" style={{ color: laneColor }}>
          {seg}
        </span>
        {busy && b.current && <span className="branch-busy">{busy}…</span>}
        <button
          className="mini merge-btn"
          title="Branch actions"
          onClick={(e) => {
            e.stopPropagation()
            setMenu({ x: e.clientX, y: e.clientY, b, remote: remoteRow })
          }}
        >
          ⋯
        </button>
      </div>
    )
  }

  const renderNodes = (nodes: Node[], depth: number, remoteRow: boolean): React.JSX.Element[] =>
    nodes.flatMap((n) => {
      if (n.kind === 'leaf') return [leafRow(n.branch, n.seg, depth, remoteRow)]
      const isFolded = folded.has(n.path)
      const rows = [
        <div
          key={`folder:${n.path}`}
          className="branch-row branch-folder"
          style={{ paddingLeft: PAD + depth * INDENT }}
          title={n.path}
          onClick={() => toggleFold(n.path)}
        >
          <span className="collapse-arrow">{isFolded ? '▸' : '▾'}</span>
          <span className="branch-name folder-name">{n.seg}</span>
        </div>
      ]
      if (!isFolded) rows.push(...renderNodes(n.children, depth + 1, remoteRow))
      return rows
    })

  return (
    <div className="branch-list">
      <div className="branch-list-head" onClick={() => setCollapsed(!collapsed)}>
        <span className="collapse-arrow">{collapsed ? '▸' : '▾'}</span>
        <span>Local</span>
        <span className="branch-count">{local.length}</span>
        <button
          className="mini"
          onClick={(e) => {
            e.stopPropagation()
            setCreating(true)
            setCollapsed(false)
          }}
        >
          + New
        </button>
      </div>
      {!collapsed && (
        <div className="branch-items">
          {creating && (
            <input
              className="branch-input"
              autoFocus
              placeholder="branch name — Enter to create"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') create()
                if (e.key === 'Escape') setCreating(false)
              }}
              onBlur={() => setCreating(false)}
            />
          )}
          {renderNodes(localTree, 0, false)}
          {remote.length > 0 && (
            <div
              className="branch-subhead branch-subhead-btn"
              onClick={() => setRemoteCollapsed(!remoteCollapsed)}
            >
              <span className="collapse-arrow">{remoteCollapsed ? '▸' : '▾'}</span>
              <span>Remote</span>
              <span className="branch-count">{remote.length}</span>
            </div>
          )}
          {!remoteCollapsed && renderNodes(remoteTree, 0, true)}
        </div>
      )}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItemsFor(menu.b, menu.remote)}
          onClose={() => setMenu(null)}
        />
      )}
      {delTarget && (
        <ConfirmDialog
          title={`Delete ${delTarget.b.name}?`}
          body={
            <p>
              {delTarget.force
                ? 'This branch has unmerged commits — deleting will discard them.'
                : 'The branch pointer is removed; commits stay reachable via other refs.'}{' '}
              This cannot be undone.
            </p>
          }
          confirmLabel={delTarget.force ? 'Force delete' : 'Delete'}
          onConfirm={() => {
            const t = delTarget
            setDelTarget(null)
            void doDelete(t)
          }}
          onCancel={() => setDelTarget(null)}
        />
      )}
    </div>
  )
}
