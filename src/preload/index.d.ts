import { ElectronAPI } from '@electron-toolkit/preload'
import type { GitApi } from '../shared/types'

declare global {
  interface Window {
    electron: ElectronAPI
    api: GitApi
  }
}
