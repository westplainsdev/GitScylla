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
  fetch(): Promise<void>
  pull(): Promise<void>
  push(): Promise<void>
  /** fires when the watched repo directory changes on disk */
  onRepoChanged(cb: () => void): () => void
}
