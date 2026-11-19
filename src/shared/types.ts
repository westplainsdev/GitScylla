export interface CommitInfo {
  hash: string
  parents: string[]
  author: string
  email: string
  /** unix timestamp, seconds */
  date: number
  /** raw decoration string pieces: branch/tag names */
  refs: string[]
  subject: string
}

export type ResetMode = 'soft' | 'mixed' | 'hard'

export interface FileStatus {
  path: string
  /** staged status code: M A D R C ' ' */
  index: string
  /** working tree status code */
  workingDir: string
}

export interface RepoStatus {
  current: string | null
  tracking: string | null
  ahead: number
  behind: number
  staged: string[]
  modified: string[]
  deleted: string[]
  untracked: string[]
  conflicted: string[]
  files: FileStatus[]
  /** in-progress operations detected via .git state files */
  merging: boolean
  rebasing: boolean
  cherryPicking: boolean
  reverting: boolean
}

export interface RemoteInfo {
  name: string
  url: string
}

export interface StashEntry {
  index: number
  /** e.g. "On main: my wip message" or "WIP on main: abc123 subject" */
  message: string
}

export interface BranchInfo {
  name: string
  current: boolean
  remote: boolean
}

export interface RepoInfo {
  path: string
  name: string
}

export interface CredentialEntry {
  host: string
  username: string
}

export interface GitProfile {
  name: string
  email: string
}

export interface Session {
  open: string[]
  /** repo path of the active tab, or null when the Home tab is active */
  active: string | null
  /** most-recently-opened repo paths, front = most recent */
  recent?: string[]
}

/**
 * Every repo-scoped method takes the repo path as its first argument — the
 * main process keeps one GitService per open tab.
 */
export interface GitApi {
  pickDirectory(title?: string): Promise<string | null>
  openRepo(path: string): Promise<RepoInfo>
  closeRepo(repo: string): Promise<void>
  cloneRepo(url: string, parentDir: string): Promise<RepoInfo>
  initRepo(path: string): Promise<RepoInfo>
  status(repo: string): Promise<RepoStatus>
  log(repo: string, limit?: number, skip?: number): Promise<CommitInfo[]>
  branches(repo: string): Promise<BranchInfo[]>
  checkout(repo: string, name: string): Promise<void>
  createBranch(repo: string, name: string): Promise<void>
  /** delete a local branch; force bypasses git's fully-merged safety check */
  deleteBranch(repo: string, name: string, force: boolean): Promise<void>
  stage(repo: string, paths: string[]): Promise<void>
  unstage(repo: string, paths: string[]): Promise<void>
  /** restore unstaged tracked files to the index version — discards local edits */
  discardChanges(repo: string, paths: string[]): Promise<void>
  /** nuke all local changes: reset --hard HEAD + clean -fd (handles unborn HEAD) */
  discardAll(repo: string): Promise<void>
  /** permanently delete untracked files/dirs (git clean -fd) */
  deleteUntracked(repo: string, paths: string[]): Promise<void>
  commit(repo: string, message: string): Promise<void>
  /** full commit message (%B) — used to prefill the amend editor so bodies aren't lost */
  commitMessage(repo: string, hash: string): Promise<string>
  /** rewrite HEAD's message only; --only keeps staged changes out of the amended commit */
  amendMessage(repo: string, message: string): Promise<void>
  /** move the current branch to <hash>; mode decides where the dropped changes go */
  resetTo(repo: string, hash: string, mode: ResetMode): Promise<void>
  /** create a new commit that undoes <hash>; merge commits revert against first parent */
  revertCommit(repo: string, hash: string): Promise<void>
  /** unified diff text for a working-tree file */
  fileDiff(repo: string, path: string, staged: boolean): Promise<string>
  /** files changed by a commit (diffed against first parent; null parent = root commit) */
  commitFiles(repo: string, hash: string, parentHash: string | null): Promise<FileStatus[]>
  /** unified diff of one file inside a commit */
  commitFileDiff(
    repo: string,
    hash: string,
    parentHash: string | null,
    path: string
  ): Promise<string>
  /** merge another branch into the current one */
  mergeBranch(repo: string, name: string): Promise<void>
  /** abort an in-progress merge/rebase/cherry-pick */
  abortOperation(repo: string): Promise<void>
  /** resolve a conflicted file by taking one side wholesale */
  resolveSide(repo: string, path: string, side: 'ours' | 'theirs'): Promise<void>
  stash(repo: string, message?: string): Promise<void>
  stashList(repo: string): Promise<StashEntry[]>
  stashApply(repo: string, index: number): Promise<void>
  stashPop(repo: string, index: number): Promise<void>
  stashDrop(repo: string, index: number): Promise<void>
  /** unified diff of a stash entry */
  stashShow(repo: string, index: number): Promise<string>
  fetch(repo: string): Promise<void>
  pull(repo: string): Promise<void>
  push(repo: string): Promise<void>
  remotes(repo: string): Promise<RemoteInfo[]>
  addRemote(repo: string, name: string, url: string): Promise<void>
  removeRemote(repo: string, name: string): Promise<void>
  /** app version for the About section */
  version(): Promise<string>
  /** persisted open-tab session */
  loadSession(): Promise<Session>
  saveSession(session: Session): Promise<void>
  /** store credentials for a git host (e.g. github.com); secret is a token or password */
  saveCredentials(host: string, username: string, secret: string): Promise<void>
  clearCredentials(host: string): Promise<void>
  listCredentials(): Promise<CredentialEntry[]>
  /** global git identity (user.name / user.email) */
  getProfile(): Promise<GitProfile>
  setProfile(name: string, email: string): Promise<void>
  /** fires when a watched repo directory changes on disk */
  onRepoChanged(cb: (repoPath: string) => void): () => void
}
