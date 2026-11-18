import { create } from 'zustand'
import type { BranchInfo, CommitInfo, RepoInfo, RepoStatus } from '../../shared/types'

interface RepoState {
  repo: RepoInfo | null
  status: RepoStatus | null
  commits: CommitInfo[]
  branches: BranchInfo[]
  selectedCommit: CommitInfo | null
  busy: string | null
  error: string | null

  setError(e: string | null): void
  open(path: string): Promise<void>
  clone(url: string, dir: string): Promise<void>
  init(path: string): Promise<void>
  refresh(): Promise<void>
  select(c: CommitInfo | null): void
  run<T>(label: string, fn: () => Promise<T>): Promise<T | undefined>
}

export const useRepo = create<RepoState>((set, get) => ({
  repo: null,
  status: null,
  commits: [],
  branches: [],
  selectedCommit: null,
  busy: null,
  error: null,

  setError: (error) => set({ error }),

  open: async (path) => {
    try {
      const repo = await window.api.openRepo(path)
      set({ repo, selectedCommit: null, error: null })
      await get().refresh()
    } catch (e) {
      set({ error: msg(e) })
    }
  },

  clone: async (url, dir) => {
    try {
      const repo = await window.api.cloneRepo(url, dir)
      set({ repo, selectedCommit: null, error: null })
      await get().refresh()
    } catch (e) {
      set({ error: msg(e) })
    }
  },

  init: async (path) => {
    try {
      const repo = await window.api.initRepo(path)
      set({ repo, selectedCommit: null, error: null })
      await get().refresh()
    } catch (e) {
      set({ error: msg(e) })
    }
  },

  refresh: async () => {
    if (!get().repo) return
    const [status, commits, branches] = await Promise.all([
      window.api.status(),
      window.api.log(500),
      window.api.branches()
    ])
    set({ status, commits, branches })
  },

  select: (c) => set({ selectedCommit: c }),

  run: async (label, fn) => {
    set({ busy: label, error: null })
    try {
      const r = await fn()
      await get().refresh()
      return r
    } catch (e) {
      set({ error: msg(e) })
      return undefined
    } finally {
      set({ busy: null })
    }
  }
}))

function msg(e: unknown): string {
  if (e instanceof Error) {
    // unwrap ipc error prefix
    return e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
  }
  return String(e)
}
