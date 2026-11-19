import { simpleGit, SimpleGit } from 'simple-git'
import { basename, join } from 'path'
import { existsSync, mkdirSync, readFileSync } from 'fs'
import type {
  BranchInfo,
  CommitInfo,
  FileStatus,
  RemoteInfo,
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
const PASSTHROUGH_ENV = [
  'HOME', 'PATH', 'USER', 'LANG', 'LC_ALL', 'TMPDIR', 'TEMP', 'TMP',
  'XDG_CONFIG_HOME', 'SSH_AUTH_SOCK', 'SSH_ASKPASS', 'GIT_SSH', 'GIT_SSH_COMMAND'
]
const GIT_OPTS = {
  allowEnvironment: [...PASSTHROUGH_ENV, 'GIT_ASKPASS', 'GIT_TERMINAL_PROMPT', 'GIT_CLIENT_USER', 'GIT_CLIENT_PASS']
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
    // .env() replaces the child env entirely, so forward what git needs
    const env: Record<string, string> = {}
    for (const key of PASSTHROUGH_ENV) {
      const v = process.env[key]
      if (v !== undefined) env[key] = v
    }
    git.env({
      ...env,
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
      if (isAuthError(e)) {
        throw new Error(`GIT_AUTH_REQUIRED:${host ?? 'unknown'}`, { cause: e })
      }
      throw e
    }
  }

  async open(path: string): Promise<RepoInfo> {
    const git = simpleGit(path, GIT_OPTS)
    if (!(await git.checkIsRepo())) {
      throw new Error(`${path} is not a git repository`)
    }
    // canonicalize to the repo toplevel so subdirs map to the same service/tab
    const top = (await git.revparse(['--show-toplevel'])).trim()
    this.git = simpleGit(top, GIT_OPTS)
    this.repoPath = top
    return { path: top, name: basename(top) }
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
      if (isAuthError(e)) {
        throw new Error(`GIT_AUTH_REQUIRED:${host ?? 'unknown'}`, { cause: e })
      }
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
      cherryPicking: this.stateFile('CHERRY_PICK_HEAD'),
      reverting: this.stateFile('REVERT_HEAD')
    }
  }

  private gitDir(): string {
    return join(this.repoPath!, '.git')
  }

  private stateFile(name: string): boolean {
    return existsSync(join(this.gitDir(), name))
  }

  async log(limit = 500, skip = 0): Promise<CommitInfo[]> {
    const format = ['%H', '%P', '%an', '%ae', '%at', '%D', '%s'].join(FIELD) + RECORD
    const args = ['log', '--all', '--topo-order', '--decorate=short', `-n${limit}`]
    if (skip > 0) args.push(`--skip=${skip}`)
    args.push(`--pretty=format:${format}`)
    let out: string
    try {
      out = await this.require().raw(args)
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
    const git = this.require()
    const [b, up] = await Promise.all([
      git.branch(['-a']),
      git
        .raw(['for-each-ref', '--format=%(refname:short)%09%(upstream:short)', 'refs/heads'])
        .catch(() => '')
    ])
    const upstreams = new Map(
      up
        .split('\n')
        .filter(Boolean)
        .map((l) => l.split('\t') as [string, string | undefined])
    )
    return b.all
      .filter((name) => !name.includes('HEAD ->'))
      .map((name) => {
        const remote = name.startsWith('remotes/')
        const local = name.replace(/^remotes\//, '')
        return {
          name: local,
          current: name === b.current,
          remote,
          upstream: remote ? undefined : upstreams.get(local) || undefined
        }
      })
  }

  async checkout(name: string): Promise<string> {
    await this.require().checkout(name)
    return `Switched to branch '${name}'`
  }

  /** "make a local copy of origin/x": checkout x if it exists, else create it tracking the remote ref */
  async checkoutRemote(remoteRef: string): Promise<string> {
    const local = remoteRef.split('/').slice(1).join('/')
    const git = this.require()
    const exists = await git
      .raw(['show-ref', '--verify', '--quiet', `refs/heads/${local}`])
      .then(() => true)
      .catch(() => false)
    if (exists) {
      await git.checkout(local)
      return `Switched to branch '${local}'`
    }
    await git.raw(['checkout', '-b', local, '--track', remoteRef])
    return `Created branch '${local}' tracking '${remoteRef}'`
  }

  async createBranch(name: string): Promise<string> {
    await this.require().checkoutLocalBranch(name)
    return `Created and switched to branch '${name}'`
  }

  async deleteBranch(name: string, force: boolean): Promise<string> {
    try {
      await this.require().raw(['branch', force ? '-D' : '-d', name])
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e)
      // tagged so the renderer can offer a force-delete confirm
      if (/not fully merged/i.test(m)) throw new Error('GIT_BRANCH_UNMERGED', { cause: e })
      throw e
    }
    return `Deleted branch '${name}'`
  }

  async stage(paths: string[]): Promise<void> {
    await this.require().add(paths)
  }

  async unstage(paths: string[]): Promise<void> {
    await this.require().reset(['HEAD', '--', ...paths])
  }

  /** restores worktree files to the index version — the "discard local edits" op */
  async discardChanges(paths: string[]): Promise<void> {
    await this.require().raw(['checkout', '--', ...paths])
  }

  /** permanently removes untracked files and directories */
  async deleteUntracked(paths: string[]): Promise<void> {
    await this.require().raw(['clean', '-fd', '--', ...paths])
  }

  /** the "nuke everything" op: staged + unstaged reverted to HEAD, untracked deleted */
  async discardAll(): Promise<string> {
    try {
      await this.require().reset(['--hard', 'HEAD'])
    } catch {
      // unborn HEAD (no commits yet): unstage everything so clean can remove it
      await this.require().raw(['rm', '-r', '--cached', '--ignore-unmatch', '.']).catch(() => {})
    }
    await this.require().raw(['clean', '-fd'])
    return 'Working tree reset to HEAD'
  }

  async commit(message: string): Promise<string> {
    const r = await this.require().commit(message)
    // subject line only — a long message would blow out the toast
    const subject = message.split('\n', 1)[0]
    const short = subject.length > 80 ? `${subject.slice(0, 77)}…` : subject
    return `Committed '${short}'${r.branch ? ` on '${r.branch}'` : ''}`
  }

  async commitMessage(hash: string): Promise<string> {
    return this.require().raw(['log', '--format=%B', '-1', hash])
  }

  /** --only: rewrite the message without sweeping staged changes into the commit */
  async amendMessage(message: string): Promise<string> {
    await this.require().raw(['commit', '--amend', '--only', '-m', message])
    return 'Amended commit message'
  }

  async resetTo(hash: string, mode: 'soft' | 'mixed' | 'hard'): Promise<string> {
    await this.require().raw(['reset', `--${mode}`, hash])
    return `Reset to ${hash.slice(0, 7)} (${mode})`
  }

  async revertCommit(hash: string): Promise<string> {
    const git = this.require()
    // reverting a merge commit needs -m 1 (diff against first parent)
    const line = await git.raw(['rev-list', '--parents', '-n', '1', hash])
    const merge = line.trim().split(/\s+/).length > 2
    try {
      await git.raw(['revert', '--no-edit', ...(merge ? ['-m', '1'] : []), hash])
    } catch (e) {
      if (isConflict(e)) {
        // conflicted revert — banner + abort flow handles it
        return `Reverting ${hash.slice(0, 7)} — conflicts to resolve`
      }
      throw e
    }
    return `Reverted ${hash.slice(0, 7)}`
  }

  async fetch(): Promise<string> {
    const res = await this.authed(await this.remoteHost(), (g) => g.fetch(['--all', '--prune']))
    const updated = res?.updated ?? []
    if (updated.length === 0) return 'Already up to date — nothing new on the remotes'
    const names = updated
      .slice(0, 4)
      .map((u) => u.name.replace(/^refs\/remotes\//, ''))
      .join(', ')
    const more = updated.length > 4 ? ` +${updated.length - 4} more` : ''
    return `Fetched ${updated.length} update${updated.length === 1 ? '' : 's'}: ${names}${more}`
  }

  async pull(rebase?: boolean): Promise<string> {
    return this.authed(await this.remoteHost(), async (g) => {
      // count incoming commits first so the summary can say what actually happened
      const incoming = await g
        .raw(['rev-list', '--count', 'HEAD..@{u}'])
        .then((x) => Number(x.trim()))
        .catch(() => NaN)
      try {
        const strategy = rebase === undefined ? [] : rebase ? ['--rebase'] : ['--no-rebase']
        await g.raw(['pull', ...strategy])
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e)
        // no reconcile strategy configured — tagged so the UI can ask merge-vs-rebase
        if (/divergent branches|have diverged/i.test(m)) {
          throw new Error('GIT_PULL_DIVERGENT', { cause: e })
        }
        // merge conflicts on pull are a state, not a failure — the UI shows the merge banner
        if (isConflict(e)) return 'Pull hit conflicts — resolve and commit, or abort'
        throw e
      }
      if (incoming === 0) return 'Already up to date'
      const n = Number.isFinite(incoming)
        ? `${incoming} commit${incoming === 1 ? '' : 's'}`
        : 'changes'
      return rebase ? `Rebased onto upstream (${n})` : `Pulled ${n} from upstream`
    })
  }

  async setPullStrategy(rebase: boolean): Promise<void> {
    await this.require().raw(['config', 'pull.rebase', String(rebase)])
  }

  async push(): Promise<string> {
    const host = await this.remoteHost()
    const git = this.require()
    const s = await git.status()
    const upstream = await git
      .raw(['rev-parse', '--abbrev-ref', '@{u}'])
      .then((x) => x.trim())
      .catch(() => '')
    const ahead = upstream
      ? await git
          .raw(['rev-list', '--count', '@{u}..HEAD'])
          .then((x) => Number(x.trim()))
          .catch(() => NaN)
      : NaN
    return this.authed(host, async (g) => {
      try {
        if (s.current && !s.tracking) {
          await g.push(['--set-upstream', 'origin', s.current])
          return `Pushed '${s.current}' and set upstream to 'origin/${s.current}'`
        }
        await g.push()
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e)
        // someone pushed since our last fetch — translate git's rejection
        if (/non-fast-forward|fetch first|tip of your current branch is behind/i.test(m)) {
          throw new Error(
            'Push rejected — the remote has newer commits. Pull first, then push again.',
            { cause: e }
          )
        }
        throw e
      }
      if (ahead === 0) return 'Everything up to date'
      return Number.isFinite(ahead)
        ? `Pushed ${ahead} commit${ahead === 1 ? '' : 's'} to ${upstream}`
        : `Pushed to ${upstream || 'origin'}`
    })
  }

  async remotes(): Promise<RemoteInfo[]> {
    const list = await this.require().getRemotes(true)
    return list.map((r) => ({ name: r.name, url: r.refs.push || r.refs.fetch }))
  }

  async addRemote(name: string, url: string): Promise<void> {
    await this.require().addRemote(name, url)
  }

  async removeRemote(name: string): Promise<void> {
    await this.require().removeRemote(name)
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

  async mergeBranch(name: string): Promise<string> {
    const git = this.require()
    const s = await this.status()
    try {
      await git.merge([name])
    } catch (e) {
      // landed in merge-conflict state — banner handles it
      if (isConflict(e)) return `Merging '${name}' — conflicts to resolve`
      throw e
    }
    return `Merged '${name}' into '${s.current ?? 'HEAD'}'`
  }

  async abortOperation(): Promise<string> {
    const git = this.require()
    const s = await this.status()
    const op = s.merging
      ? 'merge'
      : s.rebasing
        ? 'rebase'
        : s.cherryPicking
          ? 'cherry-pick'
          : s.reverting
            ? 'revert'
            : ''
    if (!op) return 'Nothing in progress to abort'
    await git.raw([op, '--abort'])
    return `Aborted ${op}`
  }

  /** resolves a conflicted file by taking one side, then stages it */
  async resolveSide(path: string, side: 'ours' | 'theirs'): Promise<void> {
    const git = this.require()
    await git.checkout([`--${side}`, '--', path])
    await git.add([path])
  }

  async stash(message?: string): Promise<string> {
    const args = ['stash', 'push']
    if (message) args.push('-m', message)
    await this.require().raw(args)
    return 'Stashed changes'
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

  async stashApply(index: number): Promise<string> {
    return this.stashOp('apply', index)
  }

  async stashPop(index: number): Promise<string> {
    return this.stashOp('pop', index)
  }

  async stashDrop(index: number): Promise<string> {
    return this.stashOp('drop', index)
  }

  private async stashOp(op: 'apply' | 'pop' | 'drop', index: number): Promise<string> {
    const git = this.require()
    try {
      await git.raw(['stash', op, `stash@{${index}}`])
    } catch (e) {
      // apply/pop can land in conflict state — that's a valid outcome
      if (op !== 'drop' && isConflict(e)) {
        return `Applying stash@{${index}} — conflicts to resolve`
      }
      throw e
    }
    const verb = op === 'apply' ? 'Applied' : op === 'pop' ? 'Popped' : 'Dropped'
    return `${verb} stash@{${index}}`
  }

  async stashShow(index: number): Promise<string> {
    return this.require().raw(['stash', 'show', '-p', `stash@{${index}}`])
  }
}
