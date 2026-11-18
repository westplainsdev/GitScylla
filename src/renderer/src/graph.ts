import type { CommitInfo } from '../../shared/types'

export interface GraphNode {
  lane: number
  colorIdx: number
  isMerge: boolean
}

export interface GraphEdge {
  r1: number
  c1: number
  r2: number
  c2: number
  colorIdx: number
}

export interface GraphLayout {
  nodes: GraphNode[]
  edges: GraphEdge[]
  cols: number
}

export const LANE_COLORS = [
  '#58a6ff',
  '#3fb950',
  '#d29922',
  '#f778ba',
  '#a371f7',
  '#ff7b72',
  '#76e3ea',
  '#e3b341'
]

interface EdgeDraft {
  r1: number
  c1: number
  parent: string
  /** fallback column when parent is beyond the loaded window */
  stubC2: number
  colorIdx: number
}

/**
 * Assigns each commit a column ("lane") and produces node->parent edges,
 * gitk/GitKraken style. Commits must be in topological order (children
 * before parents), which `git log --topo-order` guarantees.
 *
 * Convention (matches `git log --graph`): a commit's first parent keeps the
 * mainline column — if another child already claimed that parent in a
 * rightward lane, the claim is "stolen" back into the mainline lane.
 */
export function layoutGraph(commits: CommitInfo[]): GraphLayout {
  const rowOf = new Map<string, number>()
  commits.forEach((c, i) => rowOf.set(c.hash, i))

  // lanes[j] = hash of the commit expected to next appear in column j
  const lanes: (string | null)[] = []
  const laneColor: number[] = []
  const nodes: GraphNode[] = []
  const drafts: EdgeDraft[] = []
  let cols = 0
  let nextColor = 0

  const allocLane = (from = 0): number => {
    for (let i = from; i < lanes.length; i++) {
      if (lanes[i] === null) return i
    }
    lanes.push(null)
    laneColor.push(-1)
    return lanes.length - 1
  }

  for (let i = 0; i < commits.length; i++) {
    const c = commits[i]
    let lane = lanes.indexOf(c.hash)
    if (lane === -1) {
      lane = allocLane()
      laneColor[lane] = nextColor++
    }
    const color = laneColor[lane]
    nodes.push({ lane, colorIdx: color, isMerge: c.parents.length > 1 })

    // this commit has arrived — release every lane expecting it
    for (let j = 0; j < lanes.length; j++) {
      if (lanes[j] === c.hash) lanes[j] = null
    }

    c.parents.forEach((p, pi) => {
      let pl = lanes.indexOf(p)
      const existed = pl !== -1
      if (!existed) {
        if (pi === 0) {
          pl = lane // first parent continues straight down this lane
          laneColor[lane] = color
        } else {
          pl = allocLane() // merge source gets its own lane
          laneColor[pl] = nextColor++
        }
        lanes[pl] = p
      } else if (pi === 0 && pl > lane) {
        // steal: first-parent chains win the leftmost column
        lanes[pl] = null
        pl = lane
        laneColor[lane] = color
        lanes[lane] = p
      }
      drafts.push({ r1: i, c1: lane, parent: p, stubC2: pl, colorIdx: existed ? color : laneColor[pl] })
    })

    for (let j = lanes.length - 1; j >= 0; j--) {
      if (lanes[j] !== null) {
        cols = Math.max(cols, j + 1)
        break
      }
    }
  }

  const edges: GraphEdge[] = drafts.map((d) => {
    const r2 = rowOf.get(d.parent)
    return {
      r1: d.r1,
      c1: d.c1,
      r2: r2 ?? commits.length,
      c2: r2 !== undefined ? nodes[r2].lane : d.stubC2,
      colorIdx: d.colorIdx
    }
  })

  return { nodes, edges, cols }
}
