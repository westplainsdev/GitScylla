import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join, relative } from 'path'
import { watch, stat, readFileSync, readdirSync, writeFileSync, type FSWatcher } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { simpleGit } from 'simple-git'
import icon from '../../resources/icon.png?asset'
import { GitService } from './git-service'
import { CredentialStore } from './credentials'
import type { Session } from '../shared/types'

let creds: CredentialStore
const repos = new Map<string, GitService>()
const watchers = new Map<string, RepoWatcher>()

/**
 * Watches every directory under the repo with one fs.watch each.
 * Node's built-in {recursive: true} crashes on Linux (fs/recursive_watch
 * derefs a deleted dirent), so we descend manually instead.
 */
class RepoWatcher {
  private watchers = new Map<string, FSWatcher>()
  private timer: NodeJS.Timeout | undefined

  constructor(
    private root: string,
    private notify: () => void
  ) {}

  start(): void {
    this.add(this.root)
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer)
    for (const w of this.watchers.values()) w.close()
    this.watchers.clear()
  }

  private bump(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => this.notify(), 400)
  }

  private skip(dir: string): boolean {
    // the object store is bulk churn that never affects status/commits UI
    return relative(this.root, dir) === join('.git', 'objects')
  }

  private add(dir: string): void {
    if (this.watchers.has(dir)) return
    let w: FSWatcher
    try {
      w = watch(dir, (_e, name) => {
        this.bump()
        if (!name) return
        const p = join(dir, name)
        // pick up directories created between events; stat may fail if it's gone already
        stat(p, (err, s) => {
          if (!err && s.isDirectory() && !this.skip(p)) this.add(p)
        })
      })
    } catch {
      return
    }
    w.on('error', () => {
      this.watchers.delete(dir)
      w.close()
    })
    this.watchers.set(dir, w)
    try {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory() && !this.skip(join(dir, e.name))) this.add(join(dir, e.name))
      }
    } catch {
      /* dir vanished mid-scan */
    }
  }
}

function svc(repo: string): GitService {
  const s = repos.get(repo)
  if (!s) throw new Error(`Repository not open: ${repo}`)
  return s
}

function watchRepo(win: BrowserWindow, path: string): void {
  if (watchers.has(path)) return
  const w = new RepoWatcher(path, () => {
    if (!win.isDestroyed()) win.webContents.send('repo:changed', path)
  })
  w.start()
  watchers.set(path, w)
}

function unwatchRepo(path: string): void {
  watchers.get(path)?.stop()
  watchers.delete(path)
}

function sessionFile(): string {
  return join(app.getPath('userData'), 'session.json')
}

function registerIpc(win: BrowserWindow): void {
  ipcMain.handle('dialog:pick-directory', async (_e, title?: string) => {
    const r = await dialog.showOpenDialog(win, {
      title: title ?? 'Select folder',
      properties: ['openDirectory', 'createDirectory']
    })
    return r.canceled ? null : r.filePaths[0]
  })

  ipcMain.handle('git:open', async (_e, path: string) => {
    let g = repos.get(path)
    if (!g) {
      g = new GitService(creds)
      repos.set(path, g)
    }
    const info = await g.open(path)
    // the returned path is canonical (repo toplevel) — key the map by it
    if (info.path !== path) {
      repos.delete(path)
      repos.set(info.path, g)
    }
    watchRepo(win, info.path)
    return info
  })
  ipcMain.handle('git:close', (_e, path: string) => {
    repos.delete(path)
    unwatchRepo(path)
  })
  ipcMain.handle('git:init', async (_e, path: string) => {
    const g = new GitService(creds)
    const info = await g.init(path)
    repos.set(info.path, g)
    watchRepo(win, info.path)
    return info
  })
  ipcMain.handle('git:clone', async (_e, url: string, dir: string) => {
    const g = new GitService(creds)
    const info = await g.clone(url, dir)
    repos.set(info.path, g)
    watchRepo(win, info.path)
    return info
  })

  ipcMain.handle('git:status', (_e, r: string) => svc(r).status())
  ipcMain.handle('git:log', (_e, r: string, limit?: number, skip?: number) =>
    svc(r).log(limit, skip)
  )
  ipcMain.handle('git:branches', (_e, r: string) => svc(r).branches())
  ipcMain.handle('git:checkout', (_e, r: string, name: string) => svc(r).checkout(name))
  ipcMain.handle('git:create-branch', (_e, r: string, name: string) =>
    svc(r).createBranch(name)
  )
  ipcMain.handle('git:stage', (_e, r: string, paths: string[]) => svc(r).stage(paths))
  ipcMain.handle('git:unstage', (_e, r: string, paths: string[]) => svc(r).unstage(paths))
  ipcMain.handle('git:discard', (_e, r: string, paths: string[]) => svc(r).discardChanges(paths))
  ipcMain.handle('git:delete-untracked', (_e, r: string, paths: string[]) =>
    svc(r).deleteUntracked(paths)
  )
  ipcMain.handle('git:commit', (_e, r: string, msg: string) => svc(r).commit(msg))
  ipcMain.handle('git:file-diff', (_e, r: string, path: string, staged: boolean) =>
    svc(r).fileDiff(path, staged)
  )
  ipcMain.handle('git:commit-files', (_e, r: string, hash: string, parent: string | null) =>
    svc(r).commitFiles(hash, parent)
  )
  ipcMain.handle(
    'git:commit-file-diff',
    (_e, r: string, hash: string, parent: string | null, path: string) =>
      svc(r).commitFileDiff(hash, parent, path)
  )
  ipcMain.handle('git:merge', (_e, r: string, name: string) => svc(r).mergeBranch(name))
  ipcMain.handle('git:abort-op', (_e, r: string) => svc(r).abortOperation())
  ipcMain.handle('git:resolve-side', (_e, r: string, path: string, side: 'ours' | 'theirs') =>
    svc(r).resolveSide(path, side)
  )
  ipcMain.handle('git:stash', (_e, r: string, message?: string) => svc(r).stash(message))
  ipcMain.handle('git:stash-list', (_e, r: string) => svc(r).stashList())
  ipcMain.handle('git:stash-apply', (_e, r: string, i: number) => svc(r).stashApply(i))
  ipcMain.handle('git:stash-pop', (_e, r: string, i: number) => svc(r).stashPop(i))
  ipcMain.handle('git:stash-drop', (_e, r: string, i: number) => svc(r).stashDrop(i))
  ipcMain.handle('git:stash-show', (_e, r: string, i: number) => svc(r).stashShow(i))
  ipcMain.handle('git:fetch', (_e, r: string) => svc(r).fetch())
  ipcMain.handle('git:pull', (_e, r: string) => svc(r).pull())
  ipcMain.handle('git:push', (_e, r: string) => svc(r).push())

  ipcMain.handle('session:load', () => {
    try {
      return JSON.parse(readFileSync(sessionFile(), 'utf8')) as Session
    } catch {
      return { open: [], active: null }
    }
  })
  ipcMain.handle('session:save', (_e, s: Session) => {
    writeFileSync(sessionFile(), JSON.stringify(s))
  })

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
    title: 'GitScylla',
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
  electronApp.setAppUserModelId('com.gitscylla.app')
  // keep the original config dir so stored credentials + session carry over
  app.setPath('userData', join(app.getPath('appData'), 'git-client'))
  creds = new CredentialStore()

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
