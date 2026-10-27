// Ekip servisi: giriş / ilk kurulum / çıkış, kullanıcı yönetimi, eşitleme döngüsü, paylaşılan ayarlar ve gönderim kilidi.
// Oturum anahtarı işletim sisteminin güvenli deposunda (safeStorage) tutulur; şifre hiçbir yerde saklanmaz.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, basename } from 'node:path'
import { hostname } from 'node:os'
import { randomBytes } from 'node:crypto'
import type { Db } from '../database/db'
import type { SettingsService } from '../services/settings'
import type { SecretStore } from '../security/secrets'
import type { AppSettings } from '@shared/types'
import { SyncEngine, type TeamTransport, type PushChange, type RemoteChange } from './sync-engine'
import { SYNC_TABLES } from './sync-schema'
import { normalizeSiteUrl } from '../integrations/website-leads'

export interface TeamUser {
  id: number
  email: string
  name: string
  role: 'admin' | 'member'
  active: boolean
  created_at?: string
  last_login?: string | null
  last_seen?: string | null
  sessions?: number
}

const TOKEN = 'team_token'
const SHARED_UID = 'shared-settings'

/** Ekip genelinde ortak olan ayarlar (cihaza özgü olanlar hariç). */
export function sharedSettings(s: AppSettings) {
  const { logoPath: _logo, ...brand } = s.brand as AppSettings['brand'] & { logoPath?: string }
  void _logo
  return {
    brand,
    outreach: {
      templates: s.outreach.templates,
      includeOptOutLine: s.outreach.includeOptOutLine,
      optOutText: s.outreach.optOutText,
      requireApproval: s.outreach.requireApproval,
      allowPersonalContacts: s.outreach.allowPersonalContacts
    },
    scoring: s.scoring,
    offers: s.offers
  }
}

export class TeamClient implements TeamTransport {
  constructor(
    private base: string,
    private token: () => string | undefined
  ) {}

  private url(path: string) {
    return new URL(`wp-json/ucamedya/v1/team/${path}`, this.base).toString()
  }

  async req<T>(path: string, init: { method?: string; body?: unknown; key?: string; form?: FormData; timeoutMs?: number } = {}): Promise<T> {
    const h: Record<string, string> = { Accept: 'application/json' }
    const t = this.token()
    if (t) h['X-UcaMedya-Token'] = t
    if (init.key) h['X-UcaMedya-Key'] = init.key
    if (init.body !== undefined) h['Content-Type'] = 'application/json'
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 30_000)
    try {
      const r = await fetch(this.url(path), { method: init.method ?? (init.body !== undefined || init.form ? 'POST' : 'GET'), headers: h, body: init.form ?? (init.body !== undefined ? JSON.stringify(init.body) : undefined), redirect: 'error', signal: ctrl.signal })
      const text = await r.text()
      let j: unknown = null
      try {
        j = JSON.parse(text)
      } catch {
        /* JSON değil */
      }
      if (!r.ok) {
        const msg = (j as { message?: string } | null)?.message
        const err = new Error(msg || (r.status === 404 ? 'Ekip sunucusu bulunamadı (sitede UcaMedya Bağlantı 2.0 eklentisi kurulu mu?)' : `Sunucu hatası (HTTP ${r.status})`)) as Error & { status?: number }
        err.status = r.status
        throw err
      }
      if (j == null) throw new Error('Sunucu beklenmeyen yanıt verdi.')
      return j as T
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw new Error('Ekip sunucusu zamanında yanıt vermedi (internet bağlantısını kontrol edin).')
      if (/fetch failed|ENOTFOUND|ECONNREFUSED|EAI_AGAIN/i.test(`${(e as Error).message} ${String(((e as Error).cause as Error | undefined)?.message ?? '')}`)) throw new Error('Ekip sunucusuna ulaşılamadı (çevrimdışı).')
      throw e
    } finally {
      clearTimeout(timer)
    }
  }

  status() {
    return this.req<{ ok: boolean; plugin: string; site: string; initialized: boolean }>('status')
  }
  push(changes: PushChange[]) {
    return this.req<{ applied: RemoteChange[] }>('push', { body: { changes }, timeoutMs: 120_000 }) as Promise<{ applied: { entity: string; uid: string; seq: number; data: Record<string, unknown>; deleted: boolean }[] }>
  }
  changes(since: number, limit: number) {
    return this.req<{ changes: RemoteChange[]; more: boolean; last_seq: number }>(`changes?since=${since}&limit=${limit}`, { timeoutMs: 120_000 })
  }
  async hasFiles(uids: string[]) {
    return (await this.req<{ have: string[] }>('files/check', { body: { uids } })).have
  }
  async uploadFile(uid: string, path: string) {
    const form = new FormData()
    form.append('uid', uid)
    form.append('file', new Blob([new Uint8Array(readFileSync(path))]), basename(path))
    await this.req('files', { form, timeoutMs: 300_000 })
  }
  async downloadFile(uid: string, dest: string) {
    const h: Record<string, string> = {}
    const t = this.token()
    if (t) h['X-UcaMedya-Token'] = t
    const r = await fetch(this.url(`files/${uid}`), { headers: h, redirect: 'error' })
    if (r.status === 404) return false
    if (!r.ok) throw new Error(`Dosya indirilemedi (HTTP ${r.status})`)
    mkdirSync(dirname(dest), { recursive: true })
    writeFileSync(dest, Buffer.from(await r.arrayBuffer()))
    return true
  }
}

export class TeamService {
  readonly engine: SyncEngine
  private timer: ReturnType<typeof setInterval> | null = null
  private nudgeTimer: ReturnType<typeof setTimeout> | null = null
  private running = false
  online = true
  private client: TeamClient | null = null

  constructor(
    private db: Db,
    private settings: SettingsService,
    private secrets: SecretStore,
    private dataDir: () => string,
    private emit: (scope: string) => void,
    private log: (m: string) => void
  ) {
    this.engine = new SyncEngine(db, {
      dataDir,
      transport: () => this.transport(),
      onSettings: (data) => this.applySharedSettings(data),
      onApplied: () => this.emit('*')
    })
  }

  private cfg() {
    return this.settings.get().team
  }

  deviceId(): string {
    let d = this.settings.getValue('device_id')
    if (!d) {
      d = `${hostname().slice(0, 40)}-${randomBytes(4).toString('hex')}`
      this.settings.setValue('device_id', d)
    }
    return d
  }

  private transport(): TeamClient | null {
    const c = this.cfg()
    if (!c.enabled || !c.server || !this.secrets.has(TOKEN)) return null
    if (!this.client) this.client = new TeamClient(normalizeSiteUrl(c.server), () => this.secrets.get(TOKEN))
    return this.client
  }

  /** Oturum açık mı (ekip modu açık ve oturum anahtarı var)? */
  active(): boolean {
    return !!this.transport()
  }

  user(): { id: number; name: string; email: string; role: 'admin' | 'member' } | null {
    const c = this.cfg()
    return c.enabled && c.userId ? { id: c.userId, name: c.name, email: c.email, role: c.role } : null
  }

  isAdmin(): boolean {
    return !this.active() || this.cfg().role === 'admin'
  }

  config() {
    const c = this.cfg()
    return { ...c, loggedIn: this.active(), deviceId: this.deviceId(), online: this.online, sync: this.engine.status(), localCompanies: this.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM companies')!.n }
  }

  private save(patch: Partial<AppSettings['team']>) {
    this.settings.update({ team: { ...this.cfg(), ...patch } })
    this.client = null
  }

  // ---------------- giriş / kurulum ----------------
  async serverStatus(server: string) {
    return new TeamClient(normalizeSiteUrl(server), () => undefined).status()
  }

  /** İlk kurulum: sitenin bağlantı anahtarıyla ilk admin hesabı; bu bilgisayardaki veriler isteğe bağlı yüklenir. */
  async bootstrap(p: { server: string; key: string; name: string; email: string; password: string; uploadExisting: boolean }) {
    const server = normalizeSiteUrl(p.server)
    const r = await new TeamClient(server, () => undefined).req<{ token: string; user: TeamUser }>('bootstrap', { key: p.key.trim(), body: { name: p.name, email: p.email, password: p.password, device: this.deviceId() } })
    this.afterLogin(server, r.token, r.user)
    if (p.uploadExisting) this.engine.queueEverything()
    this.pushSharedSettings()
    void this.syncNow()
    return this.config()
  }

  /**
   * Giriş. Bu bilgisayarda önceden veri varsa: merge → buradaki veriler de ekibe yüklenir;
   * replace → (yedek alınıp) buradaki eşitlenen veriler silinir, sunucudakiler indirilir.
   */
  async login(p: { server: string; email: string; password: string; mode?: 'merge' | 'replace' | 'keep' }) {
    const server = normalizeSiteUrl(p.server)
    const r = await new TeamClient(server, () => undefined).req<{ token: string; user: TeamUser }>('login', { body: { email: p.email, password: p.password, device: this.deviceId() } })
    const sameServer = this.cfg().server && normalizeSiteUrl(this.cfg().server) === server
    if (!sameServer) this.engine.resetState()
    if (p.mode === 'replace') this.wipeLocalSynced()
    this.afterLogin(server, r.token, r.user)
    if (p.mode === 'merge') this.engine.queueEverything()
    void this.syncNow()
    return this.config()
  }

  private afterLogin(server: string, token: string, user: TeamUser) {
    this.secrets.set(TOKEN, token)
    this.save({ enabled: true, server, userId: user.id, email: user.email, name: user.name || user.email, role: user.role })
    this.engine.setEnabled(true)
    this.start()
  }

  /** Çıkış: oturum kapanır; yerel veriler silinmez (çevrimdışı önbellek). */
  async logout() {
    try {
      await this.transport()?.req('logout', { body: {} })
    } catch {
      /* çevrimdışı olabilir */
    }
    this.secrets.delete(TOKEN)
    this.save({ userId: 0 })
    this.engine.setEnabled(false)
    this.stop()
    return this.config()
  }

  /** Ekip modunu kapat (yalnızca bu bilgisayar): eşitleme durur, veriler yerelde kalır. */
  async disable() {
    await this.logout()
    this.save({ enabled: false })
    this.engine.resetState()
    return this.config()
  }

  private wipeLocalSynced() {
    const dir = join(dirname(this.db.path), 'Yedekler')
    mkdirSync(dir, { recursive: true })
    const file = join(dir, `ucamedya-ai-ekibe-katilmadan-once-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`)
    this.db.raw.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`)
    this.engine.setEnabled(false)
    this.db.tx(() => {
      for (const t of [...SYNC_TABLES].reverse()) this.db.run(`DELETE FROM ${t}`)
    })
    this.engine.resetState()
    this.log(`Ekibe katılmadan önce yedek alındı ve yerel veriler temizlendi: ${file}`)
  }

  /** Sunucu oturumunu doğrular (açılışta); çevrimdışıysa mevcut oturumla devam edilir. */
  async check(): Promise<'ok' | 'offline' | 'expired' | 'off'> {
    const t = this.transport()
    if (!t) return 'off'
    try {
      const r = await t.req<{ user: TeamUser }>('me')
      this.online = true
      this.save({ name: r.user.name || r.user.email, role: r.user.role, email: r.user.email })
      return 'ok'
    } catch (e) {
      if ((e as Error & { status?: number }).status === 401) {
        this.secrets.delete(TOKEN)
        this.save({ userId: 0 })
        this.stop()
        return 'expired'
      }
      this.online = false
      return 'offline'
    }
  }

  // ---------------- eşitleme döngüsü ----------------
  start() {
    if (this.timer) return
    this.engine.setEnabled(true)
    this.timer = setInterval(() => void this.syncNow(), 10_000)
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  /** Yerel bir değişiklikten sonra kısa gecikmeyle eşitle. */
  nudge() {
    if (!this.active()) return
    if (this.nudgeTimer) clearTimeout(this.nudgeTimer)
    this.nudgeTimer = setTimeout(() => void this.syncNow(), 1500)
  }

  async syncNow() {
    if (this.running || !this.active()) return this.engine.status()
    this.running = true
    try {
      await this.engine.cycle()
      this.online = true
    } catch (e) {
      const st = (e as Error & { status?: number }).status
      if (st === 401) {
        this.secrets.delete(TOKEN)
        this.save({ userId: 0 })
        this.stop()
        this.emit('team')
      }
      this.online = !/ulaşılamadı|zamanında yanıt/.test((e as Error).message)
      this.log(`Ekip eşitlemesi: ${(e as Error).message}`)
    } finally {
      this.running = false
    }
    this.emit('team')
    return this.engine.status()
  }

  // ---------------- paylaşılan ayarlar ----------------
  pushSharedSettings() {
    const t = this.transport()
    if (!t || this.cfg().role !== 'admin') return
    void t.push([{ entity: 'settings', uid: SHARED_UID, patch: sharedSettings(this.settings.get()) }]).catch((e) => this.log(`Paylaşılan ayarlar gönderilemedi: ${(e as Error).message}`))
  }

  private applySharedSettings(data: Record<string, unknown>) {
    const cur = this.settings.get()
    const d = data as Partial<ReturnType<typeof sharedSettings>>
    this.settings.update({
      ...(d.brand ? { brand: { ...cur.brand, ...d.brand } } : {}),
      ...(d.outreach ? { outreach: { ...cur.outreach, ...d.outreach } } : {}),
      ...(d.scoring ? { scoring: d.scoring } : {}),
      ...(d.offers ? { offers: d.offers } : {})
    } as Partial<AppSettings>)
    this.emit('settings')
  }

  // ---------------- gönderim kilidi ----------------
  async claim(key: string): Promise<{ ok: boolean; done: boolean; by: string | null }> {
    const t = this.transport()
    if (!t) return { ok: true, done: false, by: null }
    return t.req('claim', { body: { key, device: this.deviceId(), ttl: 900 } })
  }

  async release(key: string, done: boolean) {
    const t = this.transport()
    if (!t) return
    await t.req('release', { body: { key, device: this.deviceId(), done } }).catch(() => undefined)
  }

  // ---------------- kullanıcı yönetimi ----------------
  private need() {
    const t = this.transport()
    if (!t) throw new Error('Ekip sunucusuna giriş yapılmamış.')
    return t
  }
  async users() {
    return (await this.need().req<{ users: TeamUser[] }>('users')).users
  }
  async createUser(u: { email: string; name: string; password: string; role: 'admin' | 'member' }) {
    return (await this.need().req<{ user: TeamUser }>('users', { body: u })).user
  }
  async updateUser(id: number, patch: { name?: string; role?: 'admin' | 'member'; active?: boolean; password?: string }) {
    return (await this.need().req<{ user: TeamUser }>(`users/${id}`, { body: patch })).user
  }
  async changePassword(current: string, next: string) {
    await this.need().req('password', { body: { current, new: next } })
  }
}
