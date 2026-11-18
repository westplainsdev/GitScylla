import { simpleGit, SimpleGit } from 'simple-git'
import { basename, join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import type { BranchInfo, CommitInfo, RepoInfo, RepoStatus } from '../shared/types'

const FIELD = '\x1f'
const RECORD = '\x1e'

export class GitService {
  private git: SimpleGit | null = null
  repoPath: string | null = null

  private require(): SimpleGit {
    if (!this.git) throw new Error('No repository open')
    return this.git
  }

  async open(path: string): Promise<RepoInfo> {
    const git = simpleGit(path)
    if (!(await git.checkIsRepo())) {
      throw new Error(`${path} is not a git repository`)
    }
    this.git = git
    this.repoPath = path
    return { path, name: basename(path) }
  }

  async init(path: string): Promise<RepoInfo> {
    mkdirSync(path, { recursive: true })
    const git = simpleGit(path)
    await git.init()
    return this.open(path)
  }

  async clone(url: string, parentDir: string): Promise<RepoInfo> {
    const name = basename(url.replace(/[/\\]+$/, ''), '.git') || 'repo'
    const target = join(parentDir, name)
    if (existsSync(target)) throw new Error(`${target} already exists`)
    await simpleGit().clone(url, target)
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
    await this.require().fetch(['--all', '--prune'])
  }

  async pull(): Promise<void> {
    await this.require().pull()
  }

  async push(): Promise<void> {
    const git = this.require()
    const s = await git.status()
    if (s.current && !s.tracking) {
      await git.push(['--set-upstream', 'origin', s.current])
    } else {
      await git.push()
    }
  }
}
