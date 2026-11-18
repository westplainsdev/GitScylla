import { create } from 'zustand'
import type {
  BranchInfo,
  CommitInfo,
  CredentialEntry,
  FileStatus,
  GitProfile,
  RepoInfo,
  RepoStatus,
  StashEntry
} from '../../shared/types'

interface AuthRequest {
  host: string
  retry: () => void
}

export interface DiffTarget {
  path: string
  /** working-tree view: index-vs-HEAD when true */
  staged: boolean
  /** set when viewing a file inside a commit instead of the working tree */
  hash?: string
  parent?: string | null
  /** set when viewing a stash entry's diff */
  stashIndex?: number
}

export interface Tab extends RepoInfo {
  /** repo changed on disk while not active — refresh on next activation */
  stale?: boolean
}

interface RepoState {
  tabs: Tab[]
  activePath: string | null
  repo: RepoInfo | null
  booted: boolean

  status: RepoStatus | null
  commits: CommitInfo[]
  branches: BranchInfo[]
  stashes: StashEntry[]
  commitFileList: FileStatus[]
  selectedCommit: CommitInfo | null
  diffView: DiffTarget | null
  diffText: string | null
  diffLoading: boolean

  busy: string | null
  error: string | null
  authRequest: AuthRequest | null
  profileOpen: boolean
  credentials: CredentialEntry[]
  profile: GitProfile | null

  setError(e: string | null): void
  setAuthRequest(r: AuthRequest | null): void
  toggleProfile(): void
  loadCredentials(): Promise<void>
  loadProfile(): Promise<void>

  boot(): Promise<void>
  open(path: string): Promise<void>
  openTab(path: string): Promise<void>
  closeTab(path: string): Promise<void>
  activateTab(path: string): Promise<void>
  clone(url: string, dir: string): Promise<void>
  init(path: string): Promise<void>
  refresh(): Promise<void>
  handleFsChange(path: string): void
  select(c: CommitInfo | null): Promise<void>
  openDiff(t: DiffTarget): Promise<void>
  closeDiff(): void
  run<T>(label: string, fn: (repo: string) => Promise<T>): Promise<T | undefined>
}

export const useRepo = create<RepoState>((set, get) => {
  /** active repo path — throws if none (callers guard) */
  const rp = (): string => get().repo!.path

  const saveSession = (): void => {
    const { tabs, activePath } = get()
    void window.api.saveSession({ open: tabs.map((t) => t.path), active: activePath })
  }

  return {
    tabs: [],
    activePath: null,
    repo: null,
    booted: false,

    status: null,
    commits: [],
    branches: [],
    stashes: [],
    commitFileList: [],
    selectedCommit: null,
    diffView: null,
    diffText: null,
    diffLoading: false,

    busy: null,
    error: null,
    authRequest: null,
    profileOpen: false,
    credentials: [],
    profile: null,

    setError: (error) => set({ error }),
    setAuthRequest: (authRequest) => set({ authRequest }),

    toggleProfile: () => {
      const opening = !get().profileOpen
      set({ profileOpen: opening })
      if (opening) {
        void get().loadCredentials()
        void get().loadProfile()
      }
    },

    loadCredentials: async () => {
      set({ credentials: await window.api.listCredentials() })
    },

    loadProfile: async () => {
      set({ profile: await window.api.getProfile() })
    },

    boot: async () => {
      if (get().booted) return
      set({ booted: true })
      const session = await window.api.loadSession()
      const live: Tab[] = []
      for (const path of session.open) {
        try {
          const info = await window.api.openRepo(path)
          live.push(info)
        } catch {
          // path moved or is no longer a repo — drop silently
        }
      }
      set({ tabs: live })
      const active = live.find((t) => t.path === session.active) ?? live[0]
      if (active) await get().activateTab(active.path)
      else saveSession()
    },

    /** used by Welcome / Open button — opens and activates a tab */
    open: async (path) => {
      await get().openTab(path)
    },

    openTab: async (path) => {
      try {
        const info = await window.api.openRepo(path)
        const tabs = get().tabs.filter((t) => t.path !== info.path)
        tabs.push(info)
        set({ tabs, error: null })
        await get().activateTab(info.path)
      } catch (e) {
        set({ error: msg(e) })
      }
    },

    closeTab: async (path) => {
      void window.api.closeRepo(path)
      const tabs = get().tabs.filter((t) => t.path !== path)
      set({ tabs })
      if (get().activePath === path) {
        const next = tabs[tabs.length - 1]
        if (next) await get().activateTab(next.path)
        else {
          set({
            activePath: null,
            repo: null,
            status: null,
            commits: [],
            branches: [],
            stashes: [],
            selectedCommit: null,
            diffView: null,
            diffText: null
          })
          saveSession()
        }
      } else {
        saveSession()
      }
    },

    activateTab: async (path) => {
      const tab = get().tabs.find((t) => t.path === path)
      if (!tab) return
      set({
        activePath: path,
        repo: { path: tab.path, name: tab.name },
        selectedCommit: null,
        commitFileList: [],
        diffView: null,
        diffText: null,
        tabs: get().tabs.map((t) => (t.path === path ? { ...t, stale: false } : t))
      })
      saveSession()
      await get().refresh()
    },

    clone: async (url, dir) => {
      set({ busy: 'cloning', error: null })
      try {
        const info = await window.api.cloneRepo(url, dir)
        const tabs = get().tabs.filter((t) => t.path !== info.path)
        tabs.push(info)
        set({ tabs })
        await get().activateTab(info.path)
      } catch (e) {
        const host = authHost(e)
        if (host) {
          set({ authRequest: { host, retry: () => void get().clone(url, dir) } })
        } else {
          set({ error: msg(e) })
        }
      } finally {
        set({ busy: null })
      }
    },

    init: async (path) => {
      try {
        const info = await window.api.initRepo(path)
        const tabs = get().tabs.filter((t) => t.path !== info.path)
        tabs.push(info)
        set({ tabs })
        await get().activateTab(info.path)
      } catch (e) {
        set({ error: msg(e) })
      }
    },

    refresh: async () => {
      if (!get().repo) return
      const repo = rp()
      const [status, commits, branches, stashes] = await Promise.all([
        window.api.status(repo),
        window.api.log(repo, 500),
        window.api.branches(repo),
        window.api.stashList(repo)
      ])
      set({ status, commits, branches, stashes })
      // keep an open working-tree diff in sync with disk changes
      const dv = get().diffView
      if (dv && !dv.hash && dv.stashIndex === undefined) {
        try {
          set({ diffText: await window.api.fileDiff(repo, dv.path, dv.staged) })
        } catch {
          set({ diffText: null })
        }
      }
    },

    handleFsChange: (path) => {
      const g = get()
      if (path === g.activePath) {
        void g.refresh()
      } else if (g.tabs.some((t) => t.path === path)) {
        set({ tabs: g.tabs.map((t) => (t.path === path ? { ...t, stale: true } : t)) })
      }
    },

    select: async (c) => {
      set({ selectedCommit: c, commitFileList: [] })
      if (c) {
        try {
          const parent = c.parents[0] ?? null
          set({ commitFileList: await window.api.commitFiles(rp(), c.hash, parent) })
        } catch {
          set({ commitFileList: [] })
        }
      }
    },

    openDiff: async (t) => {
      set({ diffView: t, diffLoading: true })
      try {
        const repo = rp()
        const text =
          t.stashIndex !== undefined
            ? await window.api.stashShow(repo, t.stashIndex)
            : t.hash
              ? await window.api.commitFileDiff(repo, t.hash, t.parent ?? null, t.path)
              : await window.api.fileDiff(repo, t.path, t.staged)
        set({ diffText: text, diffLoading: false })
      } catch (e) {
        set({ error: msg(e), diffLoading: false })
      }
    },

    closeDiff: () => set({ diffView: null, diffText: null }),

    run: async (label, fn) => {
      const repo = rp()
      set({ busy: label, error: null })
      try {
        const r = await fn(repo)
        await get().refresh()
        return r
      } catch (e) {
        const host = authHost(e)
        if (host) {
          set({ authRequest: { host, retry: () => void get().run(label, fn) } })
        } else {
          set({ error: msg(e) })
        }
        return undefined
      } finally {
        set({ busy: null })
      }
    }
  }
})

function msg(e: unknown): string {
  if (e instanceof Error) {
    // unwrap ipc error prefix
    return e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
  }
  return String(e)
}

function authHost(e: unknown): string | null {
  const m = msg(e).match(/GIT_AUTH_REQUIRED:(\S+)/)
  return m ? m[1] : null
}
