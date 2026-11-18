import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { GitApi } from '../shared/types'

const api: GitApi = {
  pickDirectory: (title) => ipcRenderer.invoke('dialog:pick-directory', title),
  openRepo: (path) => ipcRenderer.invoke('git:open', path),
  cloneRepo: (url, dir) => ipcRenderer.invoke('git:clone', url, dir),
  initRepo: (path) => ipcRenderer.invoke('git:init', path),
  status: () => ipcRenderer.invoke('git:status'),
  log: (limit) => ipcRenderer.invoke('git:log', limit),
  branches: () => ipcRenderer.invoke('git:branches'),
  checkout: (name) => ipcRenderer.invoke('git:checkout', name),
  createBranch: (name) => ipcRenderer.invoke('git:create-branch', name),
  stage: (paths) => ipcRenderer.invoke('git:stage', paths),
  unstage: (paths) => ipcRenderer.invoke('git:unstage', paths),
  commit: (msg) => ipcRenderer.invoke('git:commit', msg),
  fileDiff: (path, staged) => ipcRenderer.invoke('git:file-diff', path, staged),
  commitFiles: (hash, parent) => ipcRenderer.invoke('git:commit-files', hash, parent),
  commitFileDiff: (hash, parent, path) =>
    ipcRenderer.invoke('git:commit-file-diff', hash, parent, path),
  fetch: () => ipcRenderer.invoke('git:fetch'),
  pull: () => ipcRenderer.invoke('git:pull'),
  push: () => ipcRenderer.invoke('git:push'),
  mergeBranch: (name) => ipcRenderer.invoke('git:merge', name),
  abortOperation: () => ipcRenderer.invoke('git:abort-op'),
  resolveSide: (path, side) => ipcRenderer.invoke('git:resolve-side', path, side),
  stash: (message) => ipcRenderer.invoke('git:stash', message),
  stashList: () => ipcRenderer.invoke('git:stash-list'),
  stashApply: (i) => ipcRenderer.invoke('git:stash-apply', i),
  stashPop: (i) => ipcRenderer.invoke('git:stash-pop', i),
  stashDrop: (i) => ipcRenderer.invoke('git:stash-drop', i),
  stashShow: (i) => ipcRenderer.invoke('git:stash-show', i),
  saveCredentials: (host, username, secret) =>
    ipcRenderer.invoke('creds:save', host, username, secret),
  clearCredentials: (host) => ipcRenderer.invoke('creds:clear', host),
  listCredentials: () => ipcRenderer.invoke('creds:list'),
  getProfile: () => ipcRenderer.invoke('profile:get'),
  setProfile: (name, email) => ipcRenderer.invoke('profile:set', name, email),
  onRepoChanged: (cb) => {
    const listener = (): void => cb()
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
