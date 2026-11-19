import { create } from 'zustand'
import type {
  BranchInfo,
  CommitInfo,
  CredentialEntry,
  FileStatus,
  GitProfile,
  RemoteInfo,
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

export interface RecentRepo {
  path: string
  name: string
}

const baseName = (p: string): string => p.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? p

/** commit history page size — "Load more" fetches one page at a time */
const LOG_PAGE = 300

interface RepoState {
  tabs: Tab[]
  activePath: string | null
  /** previously opened repos, most recent first — shown on the Home tab */
  recent: RecentRepo[]
  repo: RepoInfo | null
  booted: boolean

  status: RepoStatus | null
  commits: CommitInfo[]
  /** whether another page of history likely exists */
  hasMore: boolean
  loadingMore: boolean
  branches: BranchInfo[]
  remotes: RemoteInfo[]
  stashes: StashEntry[]
  commitFileList: FileStatus[]
  selectedCommit: CommitInfo | null
  /** branch name currently hovered in the sidebar — its lane lights up in the graph */
  highlightRef: string | null
  /** branch clicked in the sidebar — lane stays lit until another is pinned */
  pinnedRef: string | null
  diffView: DiffTarget | null
  diffText: string | null
  diffLoading: boolean

  busy: string | null
  error: string | null
  /** transient line after an op ("Pushed 3 commits to origin/main") — auto-clears */
  notice: { text: string; kind: 'info' | 'warn' | 'error' } | null
  authRequest: AuthRequest | null
  /** pull hit diverged branches with no configured strategy — needs a merge/rebase choice */
  pullDivergent: boolean
  profileOpen: boolean
  credentials: CredentialEntry[]
  profile: GitProfile | null

  setError(e: string | null): void
  flash(text: string, kind?: 'info' | 'warn' | 'error'): void
  setAuthRequest(r: AuthRequest | null): void
  setPullDivergent(v: boolean): void
  toggleProfile(): void
  loadCredentials(): Promise<void>
  loadProfile(): Promise<void>

  boot(): Promise<void>
  open(path: string): Promise<void>
  openTab(path: string): Promise<void>
  closeTab(path: string): Promise<void>
  activateTab(path: string): Promise<void>
  activateHome(): void
  clone(url: string, dir: string): Promise<void>
  init(path: string): Promise<void>
  refresh(): Promise<void>
  loadMore(): Promise<void>
  handleFsChange(path: string): void
  select(c: CommitInfo | null): Promise<void>
  setHighlightRef(ref: string | null): void
  setPinnedRef(ref: string | null): void
  openDiff(t: DiffTarget): Promise<void>
  closeDiff(): void
  run<T>(label: string, fn: (repo: string) => Promise<T>): Promise<T | undefined>
}

let noticeTimer: ReturnType<typeof setTimeout> | null = null

export const useRepo = create<RepoState>((set, get) => {
  /** active repo path — throws if none (callers guard) */
  const rp = (): string => get().repo!.path

  const saveSession = (): void => {
    const { tabs, activePath, recent } = get()
    void window.api.saveSession({
      open: tabs.map((t) => t.path),
      active: activePath,
      recent: recent.map((r) => r.path)
    })
  }

  const bumpRecent = (path: string): void => {
    const recent = [{ path, name: baseName(path) }, ...get().recent.filter((r) => r.path !== path)]
    set({ recent: recent.slice(0, 25) })
  }

  return {
    tabs: [],
    activePath: null,
    recent: [],
    repo: null,
    booted: false,

    status: null,
    commits: [],
    hasMore: false,
    loadingMore: false,
    branches: [],
    remotes: [],
    stashes: [],
    commitFileList: [],
    selectedCommit: null,
    highlightRef: null,
    pinnedRef: null,
    diffView: null,
    diffText: null,
    diffLoading: false,

    busy: null,
    error: null,
    notice: null,
    authRequest: null,
    pullDivergent: false,
    profileOpen: false,
    credentials: [],
    profile: null,

    setError: (error) => set({ error }),
    flash: (text, kind = 'info') => {
      if (noticeTimer) clearTimeout(noticeTimer)
      set({ notice: { text, kind } })
      // errors linger — they're easy to miss at 6s
      noticeTimer = setTimeout(() => set({ notice: null }), kind === 'error' ? 10000 : 6000)
    },
    setAuthRequest: (authRequest) => set({ authRequest }),
    setPullDivergent: (pullDivergent) => set({ pullDivergent }),

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
      set({
        tabs: live,
        recent: [...new Set([...(session.recent ?? []), ...session.open])].map((p) => ({
          path: p,
          name: baseName(p)
        }))
      })
      const active = live.find((t) => t.path === session.active)
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
        bumpRecent(info.path)
        set({ tabs, error: null })
        await get().activateTab(info.path)
      } catch (e) {
        // dead path — drop it from recents too
        if (get().recent.some((r) => r.path === path)) {
          set({ recent: get().recent.filter((r) => r.path !== path) })
          saveSession()
        }
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
            hasMore: false,
            branches: [],
            remotes: [],
            stashes: [],
            selectedCommit: null,
            highlightRef: null,
            pinnedRef: null,
            pullDivergent: false,
            notice: null,
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
        highlightRef: null,
        pinnedRef: null,
        pullDivergent: false,
        notice: null,
        commitFileList: [],
        diffView: null,
        diffText: null,
        tabs: get().tabs.map((t) => (t.path === path ? { ...t, stale: false } : t))
      })
      saveSession()
      await get().refresh()
    },

    activateHome: () => {
      set({
        activePath: null,
        repo: null,
        status: null,
        commits: [],
        hasMore: false,
        branches: [],
        remotes: [],
        stashes: [],
        commitFileList: [],
        selectedCommit: null,
        highlightRef: null,
        pinnedRef: null,
        pullDivergent: false,
        notice: null,
        diffView: null,
        diffText: null
      })
      saveSession()
    },

    clone: async (url, dir) => {
      set({ busy: 'cloning', error: null })
      try {
        const info = await window.api.cloneRepo(url, dir)
        const tabs = get().tabs.filter((t) => t.path !== info.path)
        tabs.push(info)
        bumpRecent(info.path)
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
        bumpRecent(info.path)
        set({ tabs })
        await get().activateTab(info.path)
      } catch (e) {
        set({ error: msg(e) })
      }
    },

    refresh: async () => {
      if (!get().repo) return
      const repo = rp()
      const [status, commits, branches, remotes, stashes] = await Promise.all([
        window.api.status(repo),
        window.api.log(repo, LOG_PAGE),
        window.api.branches(repo),
        window.api.remotes(repo),
        window.api.stashList(repo)
      ])
      set({ status, commits, hasMore: commits.length === LOG_PAGE, branches, remotes, stashes })
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

    loadMore: async () => {
      const { repo, commits, loadingMore } = get()
      if (!repo || loadingMore) return
      set({ loadingMore: true })
      try {
        const more = await window.api.log(repo.path, LOG_PAGE, commits.length)
        const seen = new Set(commits.map((c) => c.hash))
        set({
          commits: [...commits, ...more.filter((c) => !seen.has(c.hash))],
          hasMore: more.length === LOG_PAGE,
          loadingMore: false
        })
      } catch (e) {
        set({ error: msg(e), loadingMore: false })
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

    setHighlightRef: (highlightRef) => set({ highlightRef }),
    setPinnedRef: (pinnedRef) => set({ pinnedRef }),

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
        // git ops return a one-line summary — surface it so actions aren't silent
        if (typeof r === 'string' && r) {
          // conflict-state results are warnings — the op landed but needs attention
          get().flash(r, /conflict/i.test(r) ? 'warn' : 'info')
        }
        return r
      } catch (e) {
        const host = authHost(e)
        if (host) {
          set({ authRequest: { host, retry: () => void get().run(label, fn) } })
        } else if (msg(e).includes('GIT_PULL_DIVERGENT')) {
          set({ pullDivergent: true })
        } else {
          set({ error: msg(e) })
          get().flash(msg(e), 'error')
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
