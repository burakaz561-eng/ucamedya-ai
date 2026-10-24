// SQLite bağlantısı (Node.js yerleşik node:sqlite — yerel derleme gerektirmez, Windows/macOS aynı).

import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { MIGRATIONS } from './migrations'
import { DEFAULT_SERVICES, DEFAULT_STAGES } from '@shared/constants'
import { DEFAULT_PROFILES } from '../research/profiles'

export type Param = SQLInputValue | boolean | undefined
export type Row = Record<string, unknown>

export const INTEGRATION_KEYS = [
  'google_browser', 'gmail_web', 'whatsapp_web', 'google_places', 'serpapi', 'brave', 'pagespeed', 'browser', 'ai', 'email', 'whatsapp', 'gmail_oauth', 'm365_oauth', 'crm', 'cloud_storage'
] as const

export class Db {
  readonly raw: DatabaseSync

  constructor(readonly path: string) {
    this.raw = new DatabaseSync(path)
    this.raw.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;')
  }

  private norm(params: Param[]): SQLInputValue[] {
    return params.map((p) => (p === undefined ? null : typeof p === 'boolean' ? (p ? 1 : 0) : p))
  }

  all<T = Row>(sql: string, ...params: Param[]): T[] {
    return this.raw.prepare(sql).all(...this.norm(params)) as T[]
  }

  get<T = Row>(sql: string, ...params: Param[]): T | undefined {
    return this.raw.prepare(sql).get(...this.norm(params)) as T | undefined
  }

  run(sql: string, ...params: Param[]): { changes: number; lastInsertRowid: number } {
    const r = this.raw.prepare(sql).run(...this.norm(params))
    return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) }
  }

  exec(sql: string) {
    this.raw.exec(sql)
  }

  private depth = 0
  /** İç içe çağrılabilir işlem (iç çağrılar SAVEPOINT kullanır). */
  tx<T>(fn: () => T): T {
    const sp = `sp${this.depth}`
    this.raw.exec(this.depth === 0 ? 'BEGIN' : `SAVEPOINT ${sp}`)
    this.depth++
    try {
      const r = fn()
      this.depth--
      this.raw.exec(this.depth === 0 ? 'COMMIT' : `RELEASE ${sp}`)
      return r
    } catch (e) {
      this.depth--
      this.raw.exec(this.depth === 0 ? 'ROLLBACK' : `ROLLBACK TO ${sp}; RELEASE ${sp}`)
      throw e
    }
  }

  schemaVersion(): number {
    return (this.get<{ user_version: number }>('PRAGMA user_version')?.user_version ?? 0) as number
  }

  latestVersion(): number {
    return Math.max(...MIGRATIONS.map((m) => m.version))
  }

  migrate(): number {
    const current = this.schemaVersion()
    if (current > this.latestVersion()) {
      throw new Error(`Veritabanı bu uygulama sürümünden daha yeni (şema ${current}). Lütfen uygulamanın güncel sürümünü kurun.`)
    }
    for (const m of MIGRATIONS.filter((x) => x.version > current).sort((a, b) => a.version - b.version)) {
      this.tx(() => {
        this.raw.exec(m.sql)
        this.raw.exec(`PRAGMA user_version = ${m.version}`)
      })
    }
    this.seed()
    return this.schemaVersion()
  }

  private seed() {
    this.tx(() => {
      if (!this.get('SELECT 1 FROM stages LIMIT 1')) {
        DEFAULT_STAGES.forEach((s, i) => this.run('INSERT INTO stages(key,label,color,position,terminal,system) VALUES (?,?,?,?,?,1)', s.key, s.label, s.color, i, !!s.terminal))
      }
      if (!this.get('SELECT 1 FROM services LIMIT 1')) {
        DEFAULT_SERVICES.forEach((s, i) => this.run('INSERT INTO services(key,name,description,unit,position) VALUES (?,?,?,?,?)', s.key, s.name, s.description, s.unit, i))
      }
      if (!this.get('SELECT 1 FROM automation_profiles LIMIT 1')) {
        for (const p of DEFAULT_PROFILES) this.run('INSERT INTO automation_profiles(name,description,config) VALUES (?,?,?)', p.name, p.description, JSON.stringify(p.config))
      }
      for (const k of INTEGRATION_KEYS) this.run('INSERT OR IGNORE INTO integrations(key) VALUES (?)', k)
    })
  }

  integrityOk(): { ok: boolean; message: string } {
    const r = this.all<{ integrity_check: string }>('PRAGMA integrity_check')
    const msg = r.map((x) => x.integrity_check).join('; ')
    return { ok: msg === 'ok', message: msg }
  }

  /** Tutarlı bir anlık yedek dosyası üretir (VACUUM INTO — yazma sürerken bile bozulmaz). */
  backupTo(file: string) {
    this.raw.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`)
  }

  close() {
    try {
      this.raw.close()
    } catch {
      /* zaten kapalı */
    }
  }
}

export function j<T>(s: unknown, fallback: T): T {
  if (typeof s !== 'string' || !s) return fallback
  try {
    return JSON.parse(s) as T
  } catch {
    return fallback
  }
}

export const nowIso = () => new Date().toISOString()
