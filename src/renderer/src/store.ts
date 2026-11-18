import { create } from 'zustand'
import type {
  BranchInfo,
  CommitInfo,
  CredentialEntry,
  GitProfile,
  RepoInfo,
  RepoStatus
} from '../../shared/types'

interface AuthRequest {
  host: string
  retry: () => void
}

interface RepoState {
  repo: RepoInfo | null
  status: RepoStatus | null
  commits: CommitInfo[]
  branches: BranchInfo[]
  selectedCommit: CommitInfo | null
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
  authRequest: null,

  setError: (error) => set({ error }),
  setAuthRequest: (authRequest) => set({ authRequest }),
  profileOpen: false,
  credentials: [],
  profile: null,

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
    const finish = async (): Promise<void> => {
      const repo = await window.api.cloneRepo(url, dir)
      set({ repo, selectedCommit: null, error: null })
      await get().refresh()
    }
    set({ busy: 'cloning', error: null })
    try {
      await finish()
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
}))

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
