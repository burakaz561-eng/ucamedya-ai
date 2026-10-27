// Ekip eşitleme motoru: yerel SQLite ↔ ekip sunucusu (UcaMedya Bağlantı eklentisi 2.0).
//
// Push: sync_outbox'taki değişiklikler → yalnızca değişen alanlar (gölge kopyaya göre fark) sunucuya.
// Pull: seq > son görülen değişiklikler → yerel tabloya uygulanır (uygularken tetikleyiciler susturulur).
// Tablolar arası bağlantılar gönderilirken uid'ye, alınırken yerel kimliğe çevrilir; ebeveyni henüz gelmemiş
// kayıtlar sync_pending'de bekler. Veri klasörü yolları {{data}} ile göreli taşınır (her bilgisayarda klasör farklı olabilir).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Db } from '../database/db'
import { SYNC_TABLES } from './sync-schema'

export interface RemoteChange {
  entity: string
  uid: string
  seq: number
  data: Record<string, unknown> | null
  deleted: boolean
  by?: string | null
}

export interface PushChange {
  entity: string
  uid: string
  patch?: Record<string, unknown>
  deleted?: boolean
}

/** Sunucu ile konuşan katman (gerçek HTTP ya da testte sahte sunucu). */
export interface TeamTransport {
  push(changes: PushChange[]): Promise<{ applied: { entity: string; uid: string; seq: number; data: Record<string, unknown>; deleted: boolean }[] }>
  changes(since: number, limit: number): Promise<{ changes: RemoteChange[]; more: boolean; last_seq: number }>
  hasFiles(uids: string[]): Promise<string[]>
  uploadFile(uid: string, path: string): Promise<void>
  downloadFile(uid: string, dest: string): Promise<boolean>
}

interface TableMeta {
  cols: Map<string, { notnull: boolean; pk: boolean; type: string }>
  intPk: boolean
  fks: Map<string, { table: string; to: string }>
  uniques: string[][]
}

const DATA = '{{data}}'
/** Kimlik sayılmayan benzersiz alanlar: bunlarda birleştirme yapılmaz (ör. iki bilgisayarın ayrı verdiği teklif numarası). */
const NOT_IDENTITY: Record<string, string[]> = { offers: ['number'] }
const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '')

export class SyncEngine {
  private meta = new Map<string, TableMeta>()
  lastError: string | null = null
  lastSync: string | null = null

  constructor(
    private db: Db,
    private opts: {
      dataDir: () => string
      transport: () => TeamTransport | null
      onSettings?: (data: Record<string, unknown>) => void
      onApplied?: (tables: Set<string>) => void
    }
  ) {}

  // ---------------- şema bilgisi ----------------
  private tableMeta(t: string): TableMeta {
    const hit = this.meta.get(t)
    if (hit) return hit
    const cols = new Map<string, { notnull: boolean; pk: boolean; type: string }>()
    for (const c of this.db.all<{ name: string; notnull: number; pk: number; type: string }>(`PRAGMA table_info(${t})`)) cols.set(c.name, { notnull: !!c.notnull, pk: c.pk > 0, type: (c.type || '').toUpperCase() })
    const intPk = cols.get('id')?.pk === true && /INT/.test(cols.get('id')!.type)
    const fks = new Map<string, { table: string; to: string }>()
    for (const f of this.db.all<{ from: string; table: string; to: string | null }>(`PRAGMA foreign_key_list(${t})`)) fks.set(f.from, { table: f.table, to: f.to ?? 'id' })
    const uniques: string[][] = []
    for (const ix of this.db.all<{ name: string; unique: number; origin: string }>(`PRAGMA index_list(${t})`)) {
      if (!ix.unique) continue
      const cs = this.db.all<{ name: string }>(`PRAGMA index_info(${ix.name})`).map((x) => x.name)
      if (cs.includes('uid') || (intPk && cs.length === 1 && cs[0] === 'id')) continue
      if (NOT_IDENTITY[t] && cs.length === 1 && NOT_IDENTITY[t].includes(cs[0])) continue
      uniques.push(cs)
    }
    const m = { cols, intPk, fks, uniques }
    this.meta.set(t, m)
    return m
  }

  private isSynced(t: string): boolean {
    return (SYNC_TABLES as readonly string[]).includes(t)
  }

  // ---------------- açma / kapama ----------------
  setEnabled(on: boolean) {
    this.db.run('UPDATE sync_flag SET enabled = ?, applying = 0 WHERE id = 1', on ? 1 : 0)
  }

  enabled(): boolean {
    return !!this.db.get<{ enabled: number }>('SELECT enabled FROM sync_flag WHERE id = 1')?.enabled
  }

  lastSeq(): number {
    return Number(this.db.get<{ value: string }>("SELECT value FROM app_settings WHERE key = 'kv:team_last_seq'")?.value ?? 0)
  }

  private setLastSeq(n: number) {
    this.db.run("INSERT INTO app_settings(key, value) VALUES ('kv:team_last_seq', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", String(n))
  }

  status() {
    return {
      enabled: this.enabled(),
      pendingChanges: this.db.get<{ n: number }>('SELECT COUNT(DISTINCT entity || COALESCE(uid, rid)) AS n FROM sync_outbox')!.n,
      waitingParents: this.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM sync_pending')!.n,
      pendingFiles: this.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM sync_blobs')!.n,
      lastSeq: this.lastSeq(),
      lastSync: this.lastSync,
      lastError: this.lastError
    }
  }

  // ---------------- serileştirme ----------------
  /** Yerel satırı sunucu biçimine çevirir: id yok, bağlantılar uid, veri klasörü yolları göreli. */
  serialize(t: string, rowid: number): { uid: string; data: Record<string, unknown> } | null {
    const m = this.tableMeta(t)
    const row = this.db.get<Record<string, unknown>>(`SELECT rowid AS __rid__, * FROM ${t} WHERE rowid = ?`, rowid)
    if (!row || !row.uid) return null
    const dd = norm(this.opts.dataDir()).toLowerCase()
    const data: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(row)) {
      if (k === '__rid__' || k === 'uid' || (k === 'id' && m.intPk)) continue
      const fk = m.fks.get(k)
      if (fk && fk.to === 'id' && v != null) {
        data[k] = this.db.get<{ uid: string }>(`SELECT uid FROM ${fk.table} WHERE id = ?`, v as number)?.uid ?? null
        continue
      }
      if (typeof v === 'string' && dd && norm(v).toLowerCase().startsWith(dd + '/')) {
        data[k] = DATA + norm(v).slice(dd.length)
        continue
      }
      data[k] = v
    }
    return { uid: String(row.uid), data }
  }

  private expandPath(v: unknown): unknown {
    if (typeof v !== 'string' || !v.startsWith(DATA + '/')) return v
    return join(this.opts.dataDir(), ...v.slice(DATA.length + 1).split('/'))
  }

  /**
   * Sunucudan gelen kaydı yerelde uygular. Ebeveyni yoksa 'pending' döner.
   * Aynı doğal anahtara sahip yerel kayıt varsa (ör. aynı iletişim bilgisi) onunla birleştirilir.
   */
  applyRemote(entity: string, uid: string, data: Record<string, unknown> | null, deleted: boolean): 'ok' | 'pending' | 'skip' {
    if (!this.isSynced(entity)) return 'skip'
    const m = this.tableMeta(entity)
    if (deleted) {
      this.db.run(`DELETE FROM ${entity} WHERE uid = ?`, uid)
      this.db.run('DELETE FROM sync_shadow WHERE entity = ? AND uid = ?', entity, uid)
      return 'ok'
    }
    if (!data) return 'skip'
    const vals: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(data)) {
      if (!m.cols.has(k) || k === 'uid' || (k === 'id' && m.intPk)) continue
      const fk = m.fks.get(k)
      if (fk && fk.to === 'id' && v != null) {
        const ref = this.db.get<{ id: number }>(`SELECT id FROM ${fk.table} WHERE uid = ?`, String(v))
        if (!ref) {
          if (m.cols.get(k)!.notnull) return 'pending'
          vals[k] = null
          continue
        }
        vals[k] = ref.id
        continue
      }
      vals[k] = this.expandPath(v)
    }
    const existing = this.db.get<{ rid: number }>(`SELECT rowid AS rid FROM ${entity} WHERE uid = ?`, uid)
    let target = existing?.rid
    if (target == null) {
      // Doğal anahtar birleştirme: aynı benzersiz değerlere sahip yerel satır bu uid'yi devralır
      for (const cs of m.uniques) {
        if (!cs.every((c) => vals[c] != null)) continue
        const hit = this.db.get<{ rid: number; uid: string | null }>(`SELECT rowid AS rid, uid FROM ${entity} WHERE ${cs.map((c) => `${c} = ?`).join(' AND ')}`, ...cs.map((c) => vals[c] as string | number))
        if (hit) {
          // Her bilgisayar aynı kazananı seçer (küçük uid kalır); aksi hâlde iki taraf da diğerini silip kaydı kaybeder
          if (hit.uid && hit.uid < uid) {
            const ks = Object.keys(vals).filter((k) => !cs.includes(k))
            if (ks.length) this.db.run(`UPDATE ${entity} SET ${ks.map((k) => `${k} = ?`).join(', ')} WHERE rowid = ?`, ...ks.map((k) => vals[k] as string | number | null), hit.rid)
            this.db.run("INSERT INTO sync_outbox(entity, rid, uid, op) VALUES (?, NULL, ?, 'delete')", entity, uid)
            return 'ok'
          }
          target = hit.rid
          if (hit.uid && hit.uid !== uid && this.db.get('SELECT 1 FROM sync_shadow WHERE entity = ? AND uid = ?', entity, hit.uid)) {
            // Eski uid sunucuda da var: çift kaydı sunucuda kapat
            this.db.run("INSERT INTO sync_outbox(entity, rid, uid, op) VALUES (?, NULL, ?, 'delete')", entity, hit.uid)
            this.db.run('DELETE FROM sync_shadow WHERE entity = ? AND uid = ?', entity, hit.uid)
          }
          break
        }
      }
    }
    const keys = Object.keys(vals)
    if (target != null) {
      if (keys.length) this.db.run(`UPDATE ${entity} SET ${keys.map((k) => `${k} = ?`).join(', ')}, uid = ? WHERE rowid = ?`, ...keys.map((k) => vals[k] as string | number | null), uid, target)
      else this.db.run(`UPDATE ${entity} SET uid = ? WHERE rowid = ?`, uid, target)
    } else {
      this.db.run(`INSERT INTO ${entity}(${[...keys, 'uid'].join(', ')}) VALUES (${[...keys, 'uid'].map(() => '?').join(', ')})`, ...keys.map((k) => vals[k] as string | number | null), uid)
    }
    this.db.run('INSERT INTO sync_shadow(entity, uid, data) VALUES (?,?,?) ON CONFLICT(entity, uid) DO UPDATE SET data = excluded.data', entity, uid, JSON.stringify(data))
    if (entity === 'files') this.queueDownloadIfMissing(uid)
    return 'ok'
  }

  /** Tek kaydı kendi geri alma noktasında uygular; kısıt hatası tüm turu durdurmaz. */
  safeApply(entity: string, uid: string, data: Record<string, unknown> | null, deleted: boolean): 'ok' | 'pending' | 'skip' {
    try {
      return this.db.tx(() => this.applyRemote(entity, uid, data, deleted))
    } catch (e) {
      const msg = (e as Error).message
      // İki bilgisayar aynı teklif numarasını vermişse gelen teklife kısa ek eklenir
      if (data && entity === 'offers' && /UNIQUE constraint failed: offers\.number/.test(msg)) {
        try {
          return this.db.tx(() => this.applyRemote(entity, uid, { ...data, number: `${String(data.number)}-${uid.slice(0, 4).toUpperCase()}` }, deleted))
        } catch {
          /* aşağıda bekletilir */
        }
      }
      this.lastError = `${entity} kaydı uygulanamadı: ${msg.slice(0, 160)}`
      return 'pending'
    }
  }

  private queueDownloadIfMissing(uid: string) {
    const f = this.db.get<{ path: string }>('SELECT path FROM files WHERE uid = ?', uid)
    if (f?.path && !existsSync(f.path)) this.db.run("INSERT INTO sync_blobs(uid, direction) VALUES (?, 'down') ON CONFLICT(uid) DO UPDATE SET direction = 'down'", uid)
  }

  private applying<T>(fn: () => T): T {
    this.db.run('UPDATE sync_flag SET applying = 1 WHERE id = 1')
    try {
      return this.db.tx(fn)
    } finally {
      this.db.run('UPDATE sync_flag SET applying = 0 WHERE id = 1')
    }
  }

  // ---------------- push ----------------
  async push(): Promise<number> {
    const tr = this.opts.transport()
    if (!tr) return 0
    let total = 0
    for (let round = 0; round < 50; round++) {
      const rows = this.db.all<{ id: number; entity: string; rid: number | null; uid: string | null; op: string }>('SELECT id, entity, rid, uid, op FROM sync_outbox ORDER BY id LIMIT 300')
      if (!rows.length) break
      const maxId = rows[rows.length - 1].id
      // Aynı kayda ait ardışık değişiklikler tekilleştirilir (son durum gönderilir)
      const latest = new Map<string, (typeof rows)[number]>()
      for (const r of rows) {
        const uid = r.uid ?? (r.rid != null ? this.db.get<{ uid: string }>(`SELECT uid FROM ${r.entity} WHERE rowid = ?`, r.rid)?.uid : null)
        if (!uid) continue
        latest.delete(`${r.entity}:${uid}`)
        latest.set(`${r.entity}:${uid}`, { ...r, uid })
      }
      const changes: PushChange[] = []
      for (const r of latest.values()) {
        if (r.op === 'delete') {
          if (this.db.get(`SELECT 1 FROM ${r.entity} WHERE uid = ?`, r.uid!)) continue // yeniden oluşturulmuş
          changes.push({ entity: r.entity, uid: r.uid!, deleted: true })
          continue
        }
        const row = this.db.get<{ rid: number }>(`SELECT rowid AS rid FROM ${r.entity} WHERE uid = ?`, r.uid!)
        if (!row) continue
        const s = this.serialize(r.entity, row.rid)
        if (!s) continue
        const shadow = this.db.get<{ data: string }>('SELECT data FROM sync_shadow WHERE entity = ? AND uid = ?', r.entity, s.uid)
        const prev = shadow ? (JSON.parse(shadow.data) as Record<string, unknown>) : null
        const patch: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(s.data)) if (!prev || JSON.stringify(prev[k]) !== JSON.stringify(v)) patch[k] = v
        if (prev && !Object.keys(patch).length) continue
        changes.push({ entity: r.entity, uid: s.uid, patch })
        if (r.entity === 'files') this.db.run("INSERT INTO sync_blobs(uid, direction) VALUES (?, 'up') ON CONFLICT(uid) DO NOTHING", s.uid)
      }
      // Gövde boyutu sınırlı tutulur (paylaşımlı hostinglerde istek sınırı)
      for (let i = 0; i < changes.length; ) {
        const batch: PushChange[] = []
        let size = 0
        while (i < changes.length && batch.length < 150) {
          const sz = JSON.stringify(changes[i]).length
          if (batch.length && size + sz > 2_000_000) break
          batch.push(changes[i++])
          size += sz
        }
        const res = await tr.push(batch)
        this.applying(() => {
          for (const a of res.applied) {
            if (a.deleted) this.db.run('DELETE FROM sync_shadow WHERE entity = ? AND uid = ?', a.entity, a.uid)
            else {
              this.db.run('INSERT INTO sync_shadow(entity, uid, data) VALUES (?,?,?) ON CONFLICT(entity, uid) DO UPDATE SET data = excluded.data', a.entity, a.uid, JSON.stringify(a.data))
              // Sunucu birleştirmesi başkalarının alanlarını da içerebilir → yerelde de uygula
              this.safeApply(a.entity, a.uid, a.data, false)
            }
          }
        })
        total += res.applied.length
      }
      this.db.run('DELETE FROM sync_outbox WHERE id <= ?', maxId)
    }
    return total
  }

  // ---------------- pull ----------------
  async pull(): Promise<number> {
    const tr = this.opts.transport()
    if (!tr) return 0
    let applied = 0
    const touched = new Set<string>()
    for (let round = 0; round < 200; round++) {
      const since = this.lastSeq()
      const r = await tr.changes(since, 500)
      if (!r.changes.length) break
      this.applying(() => {
        for (const c of r.changes) {
          if (c.entity === 'settings') {
            if (c.data && !c.deleted) this.opts.onSettings?.(c.data)
            continue
          }
          // Henüz gönderilmemiş yerel değişikliği olan kayıt atlanır: yerel değişiklik gönderilince sunucu birleştirir
          if (this.hasLocalPending(c.entity, c.uid)) continue
          const res = this.safeApply(c.entity, c.uid, c.data, c.deleted)
          if (res === 'pending') this.db.run('INSERT INTO sync_pending(entity, uid, seq, data, deleted) VALUES (?,?,?,?,?) ON CONFLICT(entity, uid) DO UPDATE SET seq = excluded.seq, data = excluded.data, deleted = excluded.deleted', c.entity, c.uid, c.seq, JSON.stringify(c.data), c.deleted ? 1 : 0)
          else if (res === 'ok') {
            this.db.run('DELETE FROM sync_pending WHERE entity = ? AND uid = ?', c.entity, c.uid)
            applied++
            touched.add(c.entity)
          }
        }
        this.retryPending(touched)
      })
      this.setLastSeq(r.last_seq)
      if (!r.more) break
    }
    if (touched.size) this.opts.onApplied?.(touched)
    return applied
  }

  private hasLocalPending(entity: string, uid: string): boolean {
    if (this.db.get('SELECT 1 FROM sync_outbox WHERE entity = ? AND uid = ? LIMIT 1', entity, uid)) return true
    const row = this.db.get<{ rid: number }>(`SELECT rowid AS rid FROM ${entity} WHERE uid = ?`, uid)
    return !!row && !!this.db.get('SELECT 1 FROM sync_outbox WHERE entity = ? AND rid = ? AND uid IS NULL LIMIT 1', entity, row.rid)
  }

  private retryPending(touched: Set<string>) {
    for (let pass = 0; pass < 5; pass++) {
      const rows = this.db.all<{ entity: string; uid: string; data: string; deleted: number }>('SELECT entity, uid, data, deleted FROM sync_pending ORDER BY seq')
      let progress = false
      for (const p of rows) {
        const res = this.safeApply(p.entity, p.uid, JSON.parse(p.data), !!p.deleted)
        if (res !== 'pending') {
          this.db.run('DELETE FROM sync_pending WHERE entity = ? AND uid = ?', p.entity, p.uid)
          if (res === 'ok') touched.add(p.entity)
          progress = true
        }
      }
      if (!progress) break
    }
    this.db.run('UPDATE sync_pending SET tries = tries + 1')
    // Ebeveyni uzun süre gelmeyen (ör. sunucuda silinmiş) kayıtlar sonsuza dek beklemez
    this.db.run('DELETE FROM sync_pending WHERE tries > 200')
  }

  // ---------------- dosyalar ----------------
  async syncFiles(maxCount = 10): Promise<number> {
    const tr = this.opts.transport()
    if (!tr) return 0
    let n = 0
    const ups = this.db.all<{ uid: string }>("SELECT uid FROM sync_blobs WHERE direction = 'up' AND tries < 5 ORDER BY at LIMIT ?", maxCount)
    if (ups.length) {
      const have = new Set(await tr.hasFiles(ups.map((u) => u.uid)))
      for (const u of ups) {
        const f = this.db.get<{ path: string }>('SELECT path FROM files WHERE uid = ?', u.uid)
        try {
          if (!have.has(u.uid) && f?.path && existsSync(f.path)) await tr.uploadFile(u.uid, f.path)
          this.db.run('DELETE FROM sync_blobs WHERE uid = ?', u.uid)
          n++
        } catch (e) {
          this.db.run('UPDATE sync_blobs SET tries = tries + 1, last_error = ? WHERE uid = ?', (e as Error).message.slice(0, 300), u.uid)
        }
      }
    }
    const downs = this.db.all<{ uid: string }>("SELECT uid FROM sync_blobs WHERE direction = 'down' AND tries < 5 ORDER BY at LIMIT ?", maxCount)
    for (const d of downs) {
      const f = this.db.get<{ path: string }>('SELECT path FROM files WHERE uid = ?', d.uid)
      try {
        if (f?.path && !existsSync(f.path)) {
          mkdirSync(dirname(f.path), { recursive: true })
          const ok = await tr.downloadFile(d.uid, f.path)
          if (!ok) throw new Error('sunucuda dosya yok (henüz yüklenmemiş olabilir)')
        }
        this.db.run('DELETE FROM sync_blobs WHERE uid = ?', d.uid)
        n++
      } catch (e) {
        this.db.run('UPDATE sync_blobs SET tries = tries + 1, last_error = ? WHERE uid = ?', (e as Error).message.slice(0, 300), d.uid)
      }
    }
    return n
  }

  // ---------------- toplu işlemler ----------------
  /** Bu bilgisayardaki tüm kayıtları (ve dosyaları) sunucuya gönderilmek üzere sıraya alır. */
  queueEverything(): number {
    let n = 0
    this.db.tx(() => {
      for (const t of SYNC_TABLES) {
        n += this.db.run(`INSERT INTO sync_outbox(entity, rid, uid, op) SELECT '${t}', rowid, uid, 'upsert' FROM ${t}`).changes
      }
      this.db.run("INSERT INTO sync_blobs(uid, direction) SELECT uid, 'up' FROM files WHERE uid IS NOT NULL ON CONFLICT(uid) DO NOTHING")
    })
    return n
  }

  /** Eşitleme durumunu sıfırlar (çıkış ya da başka sunucuya geçiş). Yerel veriler silinmez. */
  resetState() {
    this.db.tx(() => {
      this.db.run('DELETE FROM sync_outbox')
      this.db.run('DELETE FROM sync_shadow')
      this.db.run('DELETE FROM sync_pending')
      this.db.run('DELETE FROM sync_blobs')
      this.setLastSeq(0)
    })
  }

  /** Bir eşitleme turu: önce gönder, sonra al, sonra dosyalar. */
  async cycle(): Promise<{ pushed: number; pulled: number; files: number }> {
    try {
      const pushed = await this.push()
      const pulled = await this.pull()
      const files = await this.syncFiles()
      this.lastSync = new Date().toISOString()
      this.lastError = null
      return { pushed, pulled, files }
    } catch (e) {
      this.lastError = (e as Error).message
      throw e
    }
  }
}

/** Testlerde ve hata ayıklamada: dosya kopyalayan basit yardımcı. */
export function copyFileBytes(src: string, dest: string) {
  mkdirSync(dirname(dest), { recursive: true })
  writeFileSync(dest, readFileSync(src))
}
