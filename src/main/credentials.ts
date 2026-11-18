import { app, safeStorage } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, chmodSync, mkdirSync } from 'fs'

interface Entry {
  username: string
  secret: string
}

/** extract hostname from https/ssh/scp-style git remote URLs */
export function hostOf(url: string): string | null {
  const m =
    url.match(/^(?:https?|ssh|git):\/\/(?:[^@/]+@)?([^/:]+)/) ??
    url.match(/^[^@/\s]+@([^:]+):/)
  return m?.[1] ?? null
}

export function isAuthError(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e)
  return /could not read (Username|Password)|Authentication failed|terminal prompts disabled|authentication required|Authorization failed/i.test(
    m
  )
}

/**
 * Answers git's interactive credential prompts via a GIT_ASKPASS script, and
 * persists credentials per-host encrypted with Electron safeStorage when the
 * OS keychain is available (session-only otherwise).
 */
export class CredentialStore {
  private creds = new Map<string, Entry>()
  private file: string
  private readonly persistable: boolean
  readonly askpassPath: string

  constructor() {
    const dir = app.getPath('userData')
    mkdirSync(dir, { recursive: true })
    this.file = join(dir, 'credentials.json')
    this.askpassPath = join(dir, 'askpass.sh')
    this.persistable = safeStorage.isEncryptionAvailable()
    writeFileSync(
      this.askpassPath,
      '#!/bin/sh\ncase "$1" in\n  *sername*) printf \'%s\' "$GIT_CLIENT_USER" ;;\n  *) printf \'%s\' "$GIT_CLIENT_PASS" ;;\nesac\n',
      { mode: 0o700 }
    )
    chmodSync(this.askpassPath, 0o700)
    this.load()
  }

  get(host: string): Entry | undefined {
    return this.creds.get(host)
  }

  save(host: string, username: string, secret: string): void {
    this.creds.set(host, { username, secret })
    this.persist()
  }

  clear(host: string): void {
    this.creds.delete(host)
    this.persist()
  }

  has(host: string): boolean {
    return this.creds.has(host)
  }

  /** hosts + usernames only — secrets never leave the main process */
  list(): { host: string; username: string }[] {
    return [...this.creds.entries()].map(([host, v]) => ({ host, username: v.username }))
  }

  private load(): void {
    if (!existsSync(this.file) || !this.persistable) return
    try {
      const raw = JSON.parse(readFileSync(this.file, 'utf8')) as Record<
        string,
        { u: string; s: string }
      >
      for (const [host, v] of Object.entries(raw)) {
        this.creds.set(host, {
          username: v.u,
          secret: safeStorage.decryptString(Buffer.from(v.s, 'base64'))
        })
      }
    } catch {
      // corrupt file — start fresh
    }
  }

  private persist(): void {
    if (!this.persistable) return
    const raw: Record<string, { u: string; s: string }> = {}
    for (const [host, v] of this.creds) {
      raw[host] = { u: v.username, s: safeStorage.encryptString(v.secret).toString('base64') }
    }
    writeFileSync(this.file, JSON.stringify(raw), { mode: 0o600 })
  }
}
