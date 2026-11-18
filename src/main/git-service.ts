import { simpleGit, SimpleGit } from 'simple-git'
import { basename, join } from 'path'
import { existsSync, mkdirSync, readFileSync } from 'fs'
import type {
  BranchInfo,
  CommitInfo,
  FileStatus,
  RepoInfo,
  RepoStatus,
  StashEntry
} from '../shared/types'
import { CredentialStore, hostOf, isAuthError } from './credentials'

const FIELD = '\x1f'
const RECORD = '\x1e'

/** git reports merge conflicts as errors with these signatures */
function isConflict(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e)
  return /Automatic merge failed|CONFLICT|Merge conflict|conflict in/i.test(m)
}

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
      const res = await this.require().remote(['get-url', 'origin'])
      const url = typeof res === 'string' ? res.trim() : ''
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
      files: s.files.map((f) => ({ path: f.path, index: f.index, workingDir: f.working_dir })),
      merging: this.stateFile('MERGE_HEAD'),
      rebasing:
        this.stateFile('REBASE_HEAD') ||
        existsSync(join(this.gitDir(), 'rebase-merge')) ||
        existsSync(join(this.gitDir(), 'rebase-apply')),
      cherryPicking: this.stateFile('CHERRY_PICK_HEAD')
    }
  }

  private gitDir(): string {
    return join(this.repoPath!, '.git')
  }

  private stateFile(name: string): boolean {
    return existsSync(join(this.gitDir(), name))
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
    await this.authed(await this.remoteHost(), async (g) => {
      try {
        await g.pull()
      } catch (e) {
        // merge conflicts on pull are a state, not a failure — the UI shows the merge banner
        if (isConflict(e)) return
        throw e
      }
    })
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

  /** unified diff for a working-tree file; staged diffs are index-vs-HEAD */
  async fileDiff(path: string, staged: boolean): Promise<string> {
    const git = this.require()
    if (staged) return git.diff(['--cached', '--', path])

    const s = await git.status()
    if (s.not_added.includes(path)) return this.untrackedDiff(path)
    return git.diff(['--', path])
  }

  /** synthesizes a unified diff that adds every line of a new (untracked) file */
  private untrackedDiff(path: string): string {
    const abs = join(this.repoPath!, path)
    const buf = readFileSync(abs)
    if (buf.subarray(0, 8192).includes(0)) {
      return `diff --git a/${path} b/${path}\nBinary file ${path}`
    }
    const lines = buf.toString('utf8').split('\n')
    if (lines.at(-1) === '') lines.pop()
    const body = lines.map((l) => `+${l}`).join('\n')
    return [
      `diff --git a/${path} b/${path}`,
      'new file mode 100644',
      '--- /dev/null',
      `+++ b/${path}`,
      `@@ -0,0 +1,${lines.length} @@`,
      body
    ].join('\n')
  }

  /** name-status list of files changed by a commit (vs first parent) */
  async commitFiles(hash: string, parentHash: string | null): Promise<FileStatus[]> {
    const git = this.require()
    const args = parentHash
      ? ['diff', '--name-status', parentHash, hash]
      : ['show', '--format=', '--name-status', hash]
    const out = await git.raw(args)
    return out
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [code, ...paths] = line.split('\t')
        const path = paths[paths.length - 1] // renames: take new path
        return { path, index: code[0], workingDir: ' ' }
      })
  }

  /** unified diff of one file within a commit, vs its first parent */
  async commitFileDiff(hash: string, parentHash: string | null, path: string): Promise<string> {
    const git = this.require()
    return parentHash
      ? git.diff([parentHash, hash, '--', path])
      : git.raw(['show', '--format=', hash, '--', path])
  }

  async mergeBranch(name: string): Promise<void> {
    const git = this.require()
    try {
      await git.merge([name])
    } catch (e) {
      if (isConflict(e)) return // landed in merge-conflict state — banner handles it
      throw e
    }
  }

  async abortOperation(): Promise<void> {
    const git = this.require()
    const s = await this.status()
    if (s.merging) return git.raw(['merge', '--abort']).then(() => {})
    if (s.rebasing) return git.raw(['rebase', '--abort']).then(() => {})
    if (s.cherryPicking) return git.raw(['cherry-pick', '--abort']).then(() => {})
  }

  /** resolves a conflicted file by taking one side, then stages it */
  async resolveSide(path: string, side: 'ours' | 'theirs'): Promise<void> {
    const git = this.require()
    await git.checkout([`--${side}`, '--', path])
    await git.add([path])
  }

  async stash(message?: string): Promise<void> {
    const args = ['stash', 'push']
    if (message) args.push('-m', message)
    await this.require().raw(args)
  }

  async stashList(): Promise<StashEntry[]> {
    const out = await this.require().raw(['stash', 'list'])
    if (!out.trim()) return []
    return out
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const m = line.match(/^stash@\{(\d+)\}:\s*(.*)$/)
        return m ? { index: Number(m[1]), message: m[2] } : { index: -1, message: line }
      })
  }

  async stashApply(index: number): Promise<void> {
    await this.stashOp('apply', index)
  }

  async stashPop(index: number): Promise<void> {
    await this.stashOp('pop', index)
  }

  async stashDrop(index: number): Promise<void> {
    await this.stashOp('drop', index)
  }

  private async stashOp(op: 'apply' | 'pop' | 'drop', index: number): Promise<void> {
    const git = this.require()
    try {
      await git.raw(['stash', op, `stash@{${index}}`])
    } catch (e) {
      // apply/pop can land in conflict state — that's a valid outcome
      if (op !== 'drop' && isConflict(e)) return
      throw e
    }
  }

  async stashShow(index: number): Promise<string> {
    return this.require().raw(['stash', 'show', '-p', `stash@{${index}}`])
  }
}
