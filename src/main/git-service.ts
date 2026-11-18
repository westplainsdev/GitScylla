import { simpleGit, SimpleGit } from 'simple-git'
import { basename, join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import type { BranchInfo, CommitInfo, RepoInfo, RepoStatus } from '../shared/types'
import { CredentialStore, hostOf, isAuthError } from './credentials'

const FIELD = '\x1f'
const RECORD = '\x1e'

/** simple-git guards these env vars by default; our askpass flow needs them */
const GIT_OPTS = {
  allowEnvironment: ['GIT_ASKPASS', 'GIT_TERMINAL_PROMPT', 'GIT_CLIENT_USER', 'GIT_CLIENT_PASS']
}

export class GitService {
  private git: SimpleGit | null = null
  repoPath: string | null = null

  constructor(private creds: CredentialStore) {}

  private require(): SimpleGit {
    if (!this.git) throw new Error('No repository open')
    return this.git
  }

  /** routes git's credential prompts through our askpass script when we have creds for host */
  private applyAuthEnv(git: SimpleGit, host: string | null): void {
    const c = host ? this.creds.get(host) : undefined
    git.env({
      GIT_TERMINAL_PROMPT: '0',
      GIT_ASKPASS: this.creds.askpassPath,
      GIT_CLIENT_USER: c?.username ?? '',
      GIT_CLIENT_PASS: c?.secret ?? ''
    })
  }

  private async remoteHost(): Promise<string | null> {
    try {
      const url = (await this.require().remote(['get-url', 'origin']))?.trim()
      return url ? hostOf(url) : null
    } catch {
      return null
    }
  }

  /** runs an op with auth env applied, translating credential failures into a tagged error */
  private async authed<T>(host: string | null, fn: (g: SimpleGit) => Promise<T>): Promise<T> {
    const git = this.require()
    this.applyAuthEnv(git, host)
    try {
      return await fn(git)
    } catch (e) {
      if (isAuthError(e)) throw new Error(`GIT_AUTH_REQUIRED:${host ?? 'unknown'}`)
      throw e
    }
  }

  async open(path: string): Promise<RepoInfo> {
    const git = simpleGit(path, GIT_OPTS)
    if (!(await git.checkIsRepo())) {
      throw new Error(`${path} is not a git repository`)
    }
    this.git = git
    this.repoPath = path
    return { path, name: basename(path) }
  }

  async init(path: string): Promise<RepoInfo> {
    mkdirSync(path, { recursive: true })
    const git = simpleGit(path, GIT_OPTS)
    await git.init()
    return this.open(path)
  }

  async clone(url: string, parentDir: string): Promise<RepoInfo> {
    const name = basename(url.replace(/[/\\]+$/, ''), '.git') || 'repo'
    const target = join(parentDir, name)
    if (existsSync(target)) throw new Error(`${target} already exists`)
    const host = hostOf(url)
    const c = host ? this.creds.get(host) : undefined
    const git = simpleGit(GIT_OPTS).env({
      GIT_TERMINAL_PROMPT: '0',
      GIT_ASKPASS: this.creds.askpassPath,
      GIT_CLIENT_USER: c?.username ?? '',
      GIT_CLIENT_PASS: c?.secret ?? ''
    })
    try {
      await git.clone(url, target)
    } catch (e) {
      if (isAuthError(e)) throw new Error(`GIT_AUTH_REQUIRED:${host ?? 'unknown'}`)
      throw e
    }
    return this.open(target)
  }

  async status(): Promise<RepoStatus> {
    const s = await this.require().status()
    return {
      current: s.current,
      tracking: s.tracking,
      ahead: s.ahead,
      behind: s.behind,
      staged: s.staged,
      modified: s.modified,
      deleted: s.deleted,
      untracked: s.not_added,
      conflicted: s.conflicted,
      files: s.files.map((f) => ({ path: f.path, index: f.index, workingDir: f.working_dir }))
    }
  }

  async log(limit = 500): Promise<CommitInfo[]> {
    const format = ['%H', '%P', '%an', '%ae', '%at', '%D', '%s'].join(FIELD) + RECORD
    let out: string
    try {
      out = await this.require().raw([
        'log',
        '--all',
        '--topo-order',
        '--decorate=short',
        `-n${limit}`,
        `--pretty=format:${format}`
      ])
    } catch {
      return [] // empty repo / no commits yet
    }
    return out
      .split(RECORD)
      .map((rec) => rec.trim())
      .filter(Boolean)
      .map((rec) => {
        const [hash, parents, author, email, date, refs, subject] = rec.split(FIELD)
        return {
          hash,
          parents: parents ? parents.split(' ').filter(Boolean) : [],
          author,
          email,
          date: Number(date),
          refs: refs
            ? refs.split(', ').map((r) => r.replace(/^HEAD -> /, '')).filter((r) => r !== 'HEAD')
            : [],
          subject
        }
      })
  }

  async branches(): Promise<BranchInfo[]> {
    const b = await this.require().branch(['-a'])
    return b.all
      .filter((name) => !name.includes('HEAD ->'))
      .map((name) => ({
        name: name.replace(/^remotes\//, ''),
        current: name === b.current,
        remote: name.startsWith('remotes/')
      }))
  }

  async checkout(name: string): Promise<void> {
    await this.require().checkout(name)
  }

  async createBranch(name: string): Promise<void> {
    await this.require().checkoutLocalBranch(name)
  }

  async stage(paths: string[]): Promise<void> {
    await this.require().add(paths)
  }

  async unstage(paths: string[]): Promise<void> {
    await this.require().reset(['HEAD', '--', ...paths])
  }

  async commit(message: string): Promise<void> {
    await this.require().commit(message)
  }

  async fetch(): Promise<void> {
    await this.authed(await this.remoteHost(), (g) => g.fetch(['--all', '--prune']))
  }

  async pull(): Promise<void> {
    await this.authed(await this.remoteHost(), (g) => g.pull())
  }

  async push(): Promise<void> {
    const host = await this.remoteHost()
    const s = await this.require().status()
    await this.authed(host, (g) =>
      s.current && !s.tracking
        ? g.push(['--set-upstream', 'origin', s.current])
        : g.push()
    )
  }
}
