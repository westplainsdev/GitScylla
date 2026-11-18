import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { watch, type FSWatcher } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { simpleGit } from 'simple-git'
import { GitService } from './git-service'
import { CredentialStore } from './credentials'

let git: GitService
let creds: CredentialStore
let watcher: FSWatcher | null = null
let watchTimer: NodeJS.Timeout | null = null

function watchRepo(win: BrowserWindow): void {
  watcher?.close()
  watcher = null
  if (!git?.repoPath) return
  watcher = watch(git.repoPath, { recursive: true }, () => {
    if (watchTimer) clearTimeout(watchTimer)
    watchTimer = setTimeout(() => {
      if (!win.isDestroyed()) win.webContents.send('repo:changed')
    }, 400)
  })
  watcher.on('error', () => {})
}

function registerIpc(win: BrowserWindow): void {
  ipcMain.handle('dialog:pick-directory', async (_e, title?: string) => {
    const r = await dialog.showOpenDialog(win, {
      title: title ?? 'Select folder',
      properties: ['openDirectory', 'createDirectory']
    })
    return r.canceled ? null : r.filePaths[0]
  })

  const afterMutation = (): void => watchRepo(win)

  ipcMain.handle('git:open', async (_e, path: string) => {
    const info = await git.open(path)
    afterMutation()
    return info
  })
  ipcMain.handle('git:init', async (_e, path: string) => {
    const info = await git.init(path)
    afterMutation()
    return info
  })
  ipcMain.handle('git:clone', async (_e, url: string, dir: string) => {
    const info = await git.clone(url, dir)
    afterMutation()
    return info
  })

  ipcMain.handle('git:status', () => git.status())
  ipcMain.handle('git:log', (_e, limit?: number) => git.log(limit))
  ipcMain.handle('git:branches', () => git.branches())
  ipcMain.handle('git:checkout', (_e, name: string) => git.checkout(name))
  ipcMain.handle('git:create-branch', (_e, name: string) => git.createBranch(name))
  ipcMain.handle('git:stage', (_e, paths: string[]) => git.stage(paths))
  ipcMain.handle('git:unstage', (_e, paths: string[]) => git.unstage(paths))
  ipcMain.handle('git:commit', (_e, msg: string) => git.commit(msg))
  ipcMain.handle('git:fetch', () => git.fetch())
  ipcMain.handle('git:pull', () => git.pull())
  ipcMain.handle('git:push', () => git.push())

  ipcMain.handle('creds:save', (_e, host: string, username: string, secret: string) =>
    creds.save(host, username, secret)
  )
  ipcMain.handle('creds:clear', (_e, host: string) => creds.clear(host))
  ipcMain.handle('creds:list', () => creds.list())

  ipcMain.handle('profile:get', async () => {
    const g = simpleGit()
    const get = async (k: string): Promise<string> =>
      (await g.raw(['config', '--global', '--get', k]).catch(() => '')).trim()
    return { name: await get('user.name'), email: await get('user.email') }
  })
  ipcMain.handle('profile:set', async (_e, name: string, email: string) => {
    const g = simpleGit()
    await g.raw(['config', '--global', 'user.name', name])
    await g.raw(['config', '--global', 'user.email', email])
  })
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'Git Client',
    backgroundColor: '#0d1117',
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  registerIpc(mainWindow)

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.gitclient')
  creds = new CredentialStore()
  git = new GitService(creds)

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
