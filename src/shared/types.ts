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

export interface GitApi {
  pickDirectory(title?: string): Promise<string | null>
  openRepo(path: string): Promise<RepoInfo>
  cloneRepo(url: string, parentDir: string): Promise<RepoInfo>
  initRepo(path: string): Promise<RepoInfo>
  status(): Promise<RepoStatus>
  log(limit?: number): Promise<CommitInfo[]>
  branches(): Promise<BranchInfo[]>
  checkout(name: string): Promise<void>
  createBranch(name: string): Promise<void>
  stage(paths: string[]): Promise<void>
  unstage(paths: string[]): Promise<void>
  commit(message: string): Promise<void>
  /** unified diff text for a working-tree file */
  fileDiff(path: string, staged: boolean): Promise<string>
  /** files changed by a commit (diffed against first parent; null parent = root commit) */
  commitFiles(hash: string, parentHash: string | null): Promise<FileStatus[]>
  /** unified diff of one file inside a commit */
  commitFileDiff(hash: string, parentHash: string | null, path: string): Promise<string>
  fetch(): Promise<void>
  pull(): Promise<void>
  push(): Promise<void>
  /** store credentials for a git host (e.g. github.com); secret is a token or password */
  saveCredentials(host: string, username: string, secret: string): Promise<void>
  clearCredentials(host: string): Promise<void>
  listCredentials(): Promise<CredentialEntry[]>
  /** global git identity (user.name / user.email) */
  getProfile(): Promise<GitProfile>
  setProfile(name: string, email: string): Promise<void>
  /** fires when the watched repo directory changes on disk */
  onRepoChanged(cb: () => void): () => void
}
