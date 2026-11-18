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
  fetch: () => ipcRenderer.invoke('git:fetch'),
  pull: () => ipcRenderer.invoke('git:pull'),
  push: () => ipcRenderer.invoke('git:push'),
  onRepoChanged: (cb) => {
    const listener = (): void => cb()
    ipcRenderer.on('repo:changed', listener)
    return () => ipcRenderer.off('repo:changed', listener)
  }
}

if (process.contextIsolated) {
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
