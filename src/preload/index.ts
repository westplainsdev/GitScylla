import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { GitApi } from '../shared/types'

const api: GitApi = {
  pickDirectory: (title) => ipcRenderer.invoke('dialog:pick-directory', title),
  openRepo: (path) => ipcRenderer.invoke('git:open', path),
  closeRepo: (repo) => ipcRenderer.invoke('git:close', repo),
  cloneRepo: (url, dir) => ipcRenderer.invoke('git:clone', url, dir),
  initRepo: (path) => ipcRenderer.invoke('git:init', path),
  status: (repo) => ipcRenderer.invoke('git:status', repo),
  log: (repo, limit, skip) => ipcRenderer.invoke('git:log', repo, limit, skip),
  branches: (repo) => ipcRenderer.invoke('git:branches', repo),
  checkout: (repo, name) => ipcRenderer.invoke('git:checkout', repo, name),
  createBranch: (repo, name) => ipcRenderer.invoke('git:create-branch', repo, name),
  stage: (repo, paths) => ipcRenderer.invoke('git:stage', repo, paths),
  unstage: (repo, paths) => ipcRenderer.invoke('git:unstage', repo, paths),
  discardChanges: (repo, paths) => ipcRenderer.invoke('git:discard', repo, paths),
  discardAll: (repo) => ipcRenderer.invoke('git:discard-all', repo),
  deleteUntracked: (repo, paths) => ipcRenderer.invoke('git:delete-untracked', repo, paths),
  commit: (repo, msg) => ipcRenderer.invoke('git:commit', repo, msg),
  resetTo: (repo, hash, mode) => ipcRenderer.invoke('git:reset', repo, hash, mode),
  revertCommit: (repo, hash) => ipcRenderer.invoke('git:revert', repo, hash),
  fileDiff: (repo, path, staged) => ipcRenderer.invoke('git:file-diff', repo, path, staged),
  commitFiles: (repo, hash, parent) =>
    ipcRenderer.invoke('git:commit-files', repo, hash, parent),
  commitFileDiff: (repo, hash, parent, path) =>
    ipcRenderer.invoke('git:commit-file-diff', repo, hash, parent, path),
  mergeBranch: (repo, name) => ipcRenderer.invoke('git:merge', repo, name),
  abortOperation: (repo) => ipcRenderer.invoke('git:abort-op', repo),
  resolveSide: (repo, path, side) => ipcRenderer.invoke('git:resolve-side', repo, path, side),
  stash: (repo, message) => ipcRenderer.invoke('git:stash', repo, message),
  stashList: (repo) => ipcRenderer.invoke('git:stash-list', repo),
  stashApply: (repo, i) => ipcRenderer.invoke('git:stash-apply', repo, i),
  stashPop: (repo, i) => ipcRenderer.invoke('git:stash-pop', repo, i),
  stashDrop: (repo, i) => ipcRenderer.invoke('git:stash-drop', repo, i),
  stashShow: (repo, i) => ipcRenderer.invoke('git:stash-show', repo, i),
  fetch: (repo) => ipcRenderer.invoke('git:fetch', repo),
  pull: (repo) => ipcRenderer.invoke('git:pull', repo),
  push: (repo) => ipcRenderer.invoke('git:push', repo),
  remotes: (repo) => ipcRenderer.invoke('git:remotes', repo),
  addRemote: (repo, name, url) => ipcRenderer.invoke('git:add-remote', repo, name, url),
  removeRemote: (repo, name) => ipcRenderer.invoke('git:remove-remote', repo, name),
  loadSession: () => ipcRenderer.invoke('session:load'),
  saveSession: (s) => ipcRenderer.invoke('session:save', s),
  saveCredentials: (host, username, secret) =>
    ipcRenderer.invoke('creds:save', host, username, secret),
  clearCredentials: (host) => ipcRenderer.invoke('creds:clear', host),
  listCredentials: () => ipcRenderer.invoke('creds:list'),
  getProfile: () => ipcRenderer.invoke('profile:get'),
  version: () => ipcRenderer.invoke('app:version'),
  setProfile: (name, email) => ipcRenderer.invoke('profile:set', name, email),
  onRepoChanged: (cb) => {
    const listener = (_e: unknown, path: string): void => cb(path)
    ipcRenderer.on('repo:changed', listener)
    return () => ipcRenderer.off('repo:changed', listener)
  }
}

const contextIsolated = (process as unknown as { contextIsolated: boolean }).contextIsolated

if (contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
