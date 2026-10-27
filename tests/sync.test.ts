// Ekip eşitleme motoru: iki ayrı veritabanı (iki bilgisayar) + bellek içi sahte sunucu (eklentiyle aynı birleştirme kuralı).
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Db } from '../src/main/database/db'
import { CompanyService } from '../src/main/services/companies'
import { FileStore } from '../src/main/files/folders'
import { SyncEngine, type TeamTransport, type RemoteChange } from '../src/main/sync/sync-engine'

class FakeServer {
  seq = 0
  recs = new Map<string, RemoteChange>()
  files = new Map<string, Buffer>()
  transport(): TeamTransport {
    return {
      push: async (changes) => {
        const applied: RemoteChange[] = []
        for (const c of changes) {
          const k = `${c.entity}:${c.uid}`
          const cur = this.recs.get(k)
          const data = c.deleted ? (cur?.data ?? {}) : { ...(cur?.data ?? {}), ...(c.patch ?? {}) }
          const rec: RemoteChange = { entity: c.entity, uid: c.uid, seq: ++this.seq, data, deleted: !!c.deleted }
          this.recs.set(k, rec)
          applied.push(rec)
        }
        return { applied: JSON.parse(JSON.stringify(applied)) }
      },
      changes: async (since, limit) => {
        const out = [...this.recs.values()].filter((r) => r.seq > since).sort((a, b) => a.seq - b.seq).slice(0, limit)
        return { changes: JSON.parse(JSON.stringify(out)), more: out.length === limit, last_seq: out.length ? out[out.length - 1].seq : since }
      },
      hasFiles: async (uids) => uids.filter((u) => this.files.has(u)),
      uploadFile: async (uid, path) => void this.files.set(uid, readFileSync(path)),
      downloadFile: async (uid, dest) => {
        const b = this.files.get(uid)
        if (!b) return false
        writeFileSync(dest, b)
        return true
      }
    }
  }
}

interface Pc { db: Db; cs: CompanyService; eng: SyncEngine; data: string }
const opened: Db[] = []
let root: string
let server: FakeServer
const pc = (name: string): Pc => {
  const db = new Db(join(root, `${name}.sqlite`))
  opened.push(db)
  db.migrate()
  const data = join(root, `${name}-veri`)
  mkdirSync(data, { recursive: true })
  const cs = new CompanyService(db, new FileStore(db, () => data))
  const eng = new SyncEngine(db, { dataDir: () => data, transport: () => server.transport() })
  eng.setEnabled(true)
  return { db, cs, eng, data }
}
const sync = async (...pcs: Pc[]) => {
  for (let i = 0; i < 2; i++) for (const p of pcs) await p.eng.cycle()
}
const count = (p: Pc, sql: string, ...args: (string | number)[]) => p.db.get<{ n: number }>(sql, ...args)!.n

describe('ekip eşitlemesi (iki bilgisayar)', () => {
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'uca-sync-'))
    server = new FakeServer()
  })
  afterEach(() => {
    for (const d of opened.splice(0)) (d.raw as unknown as { close: () => void }).close()
    rmSync(root, { recursive: true, force: true })
  })

  it('ilk yükleme + yeni bilgisayar: tohum aşama/hizmetler çift olmaz, şirket ve bağlı kayıtlar gelir', async () => {
    const a = pc('A')
    const c = a.cs.create({ name: 'EmlaXo Türkiye', city: 'Kocaeli', website: 'https://emlaxo.com', source: 'manual' } as never)
    a.cs.addContact(c, { type: 'email', value: 'info@emlaxo.com', sourceType: 'website' })
    a.db.run("INSERT INTO outreach_drafts(company_id, channel, subject, body, generator) VALUES (?, 'email', 'Konu', 'Metin', 'template')", c)
    a.eng.queueEverything()
    await a.eng.cycle()
    const b = pc('B')
    await b.eng.cycle()
    expect(count(b, 'SELECT COUNT(*) AS n FROM stages')).toBe(count(a, 'SELECT COUNT(*) AS n FROM stages'))
    expect(count(b, 'SELECT COUNT(*) AS n FROM services')).toBe(12)
    expect(count(b, 'SELECT COUNT(*) AS n FROM automation_profiles')).toBe(count(a, 'SELECT COUNT(*) AS n FROM automation_profiles'))
    const bc = b.db.get<{ id: number }>("SELECT id FROM companies WHERE name = 'EmlaXo Türkiye'")!
    expect(b.db.get<{ value: string }>('SELECT value FROM company_contacts WHERE company_id = ?', bc.id)!.value).toBe('info@emlaxo.com')
    expect(b.db.get<{ body: string }>('SELECT body FROM outreach_drafts WHERE company_id = ?', bc.id)!.body).toBe('Metin')
    // yankı yok: sonraki turlarda gönderilecek bir şey kalmaz
    await b.eng.cycle()
    await a.eng.cycle()
    expect((await b.eng.cycle()).pushed).toBe(0)
    expect((await a.eng.cycle()).pushed).toBe(0)
  })

  it('aynı anda farklı alanlar: ikisi de korunur; silme yayılır', async () => {
    const a = pc('A'), b = pc('B')
    const c = a.cs.create({ name: 'Mavi Yapı', source: 'manual' } as never)
    a.cs.addContact(c, { type: 'phone', value: '0532 111 22 33', sourceType: 'website' })
    await sync(a, b)
    const bid = b.db.get<{ id: number }>("SELECT id FROM companies WHERE name = 'Mavi Yapı'")!.id
    a.db.run("UPDATE companies SET internal_notes = 'A notu' WHERE id = ?", c)
    b.db.run("UPDATE companies SET stage_key = 'review' WHERE id = ?", bid)
    await sync(a, b)
    for (const p of [a, b]) expect({ ...p.db.get("SELECT internal_notes, stage_key FROM companies WHERE name = 'Mavi Yapı'") }).toEqual({ internal_notes: 'A notu', stage_key: 'review' })
    a.db.run('DELETE FROM company_contacts WHERE company_id = ?', c)
    await sync(a, b)
    expect(count(b, 'SELECT COUNT(*) AS n FROM company_contacts WHERE company_id = ?', bid)).toBe(0)
  })

  it('iki kişi aynı iletişim bilgisini ayrı ayrı ekler → tek kayıt', async () => {
    const a = pc('A'), b = pc('B')
    const c = a.cs.create({ name: 'Gama Lojistik', source: 'manual' } as never)
    await sync(a, b)
    const bid = b.db.get<{ id: number }>("SELECT id FROM companies WHERE name = 'Gama Lojistik'")!.id
    a.cs.addContact(c, { type: 'email', value: 'info@gama.com.tr', sourceType: 'website' })
    b.cs.addContact(bid, { type: 'email', value: 'info@gama.com.tr', sourceType: 'manual' })
    await sync(a, b)
    await sync(a, b)
    for (const p of [a, b]) expect(count(p, "SELECT COUNT(*) AS n FROM company_contacts WHERE value_key = 'info@gama.com.tr'")).toBe(1)
    expect([...server.recs.values()].filter((r) => r.entity === 'company_contacts' && !r.deleted).length).toBe(1)
  })

  it('dosyalar veri klasörüne göre göreli taşınır ve diğer bilgisayara iner', async () => {
    const a = pc('A'), b = pc('B')
    const c = a.cs.create({ name: 'Delta İnşaat', source: 'manual' } as never)
    mkdirSync(join(a.data, '2026', 'Delta'), { recursive: true })
    const f = join(a.data, '2026', 'Delta', 'rapor.pdf')
    writeFileSync(f, 'PDF içerik — ğüşıöç')
    a.db.run("INSERT INTO files(company_id, path, name, kind, bytes) VALUES (?, ?, 'rapor.pdf', 'report_pdf', 10)", c, f)
    await sync(a, b)
    await sync(a, b)
    const bf = b.db.get<{ path: string }>("SELECT path FROM files WHERE name = 'rapor.pdf'")!.path
    expect(bf).toBe(join(b.data, '2026', 'Delta', 'rapor.pdf'))
    expect(existsSync(bf) && readFileSync(bf, 'utf8')).toBe('PDF içerik — ğüşıöç')
  })

  it('iki bilgisayarın aynı teklif numarası birleştirilmez', async () => {
    const a = pc('A'), b = pc('B')
    const c = a.cs.create({ name: 'Epsilon', source: 'manual' } as never)
    await sync(a, b)
    const bid = b.db.get<{ id: number }>("SELECT id FROM companies WHERE name = 'Epsilon'")!.id
    a.db.run("INSERT INTO offers(number, company_id, title) VALUES ('UCA-2026-0001', ?, 'A teklifi')", c)
    b.db.run("INSERT INTO offers(number, company_id, title) VALUES ('UCA-2026-0001', ?, 'B teklifi')", bid)
    await sync(a, b)
    await sync(a, b)
    for (const p of [a, b]) {
      const rows = p.db.all<{ number: string; title: string }>('SELECT number, title FROM offers ORDER BY title')
      expect(rows.map((r) => r.title)).toEqual(['A teklifi', 'B teklifi'])
      expect(new Set(rows.map((r) => r.number)).size).toBe(2)
    }
  })

  it('ekip modu kapalıyken giden kutusu birikmez, uid yine atanır', () => {
    const a = pc('A')
    a.eng.setEnabled(false)
    a.cs.create({ name: 'Zeta', source: 'manual' } as never)
    expect(count(a, 'SELECT COUNT(*) AS n FROM sync_outbox')).toBe(0)
    expect(a.db.get<{ uid: string }>("SELECT uid FROM companies WHERE name = 'Zeta'")!.uid).toMatch(/^[0-9a-f]{24}$/)
  })
})
