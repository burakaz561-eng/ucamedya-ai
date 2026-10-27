// Canlı: iki "bilgisayar" (iki veritabanı) gerçek ekip sunucusu (eklenti 2.0) üzerinden eşitlenir.
// Çalıştırma: WP_URL=http://127.0.0.1:9420/ TEAM_EMAIL=... TEAM_PASS=... [WP_PLAYGROUND=1] npx vitest run tests/live-team-sync.test.ts
import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Db } from '../src/main/database/db'
import { CompanyService } from '../src/main/services/companies'
import { FileStore } from '../src/main/files/folders'
import { SyncEngine } from '../src/main/sync/sync-engine'
import { TeamClient } from '../src/main/sync/team-service'

const URL_ = process.env.WP_URL
const EMAIL = process.env.TEAM_EMAIL
const PASS = process.env.TEAM_PASS

describe.skipIf(!URL_ || !EMAIL || !PASS)('canlı: ekip eşitlemesi (gerçek sunucu)', () => {
  if (process.env.WP_PLAYGROUND) {
    const f = globalThis.fetch
    globalThis.fetch = ((u: string | URL | Request, init: RequestInit = {}) => f(u, { ...init, headers: { ...(init.headers as Record<string, string>), Cookie: 'playground_auto_login_already_happened=1' } })) as typeof fetch
  }
  it('A ekler → B görür; B değiştirir → A görür; dosya iner; gönderim kilidi çalışır', async () => {
    const root = mkdtempSync(join(tmpdir(), 'uca-live-team-'))
    const login = async (device: string) => {
      const c = new TeamClient(URL_!, () => undefined)
      const r = await c.req<{ token: string }>('login', { body: { email: EMAIL, password: PASS, device } })
      return new TeamClient(URL_!, () => r.token)
    }
    const mk = async (name: string) => {
      const db = new Db(join(root, `${name}.sqlite`))
      db.migrate()
      const data = join(root, `${name}-veri`)
      mkdirSync(data, { recursive: true })
      const client = await login(name)
      const eng = new SyncEngine(db, { dataDir: () => data, transport: () => client })
      eng.setEnabled(true)
      return { db, data, eng, client, cs: new CompanyService(db, new FileStore(db, () => data)) }
    }
    const a = await mk('A')
    const stamp = Date.now().toString(36)
    const name = `Canlı Test ${stamp} Lojistik`
    const cid = a.cs.create({ name, city: 'İstanbul', source: 'manual' } as never)
    a.cs.addContact(cid, { type: 'email', value: `info@${stamp}.com.tr`, sourceType: 'website' })
    mkdirSync(join(a.data, 'test'), { recursive: true })
    writeFileSync(join(a.data, 'test', `${stamp}.txt`), 'dosya içeriği ğüşıöç')
    a.db.run("INSERT INTO files(company_id, path, name, kind, bytes) VALUES (?, ?, ?, 'report_pdf', 20)", cid, join(a.data, 'test', `${stamp}.txt`), `${stamp}.txt`)
    a.eng.queueEverything()
    const ra = await a.eng.cycle()
    await a.eng.cycle()
    console.log('A:', JSON.stringify(ra), JSON.stringify(a.eng.status()))

    const b = await mk('B')
    await b.eng.cycle()
    await b.eng.cycle()
    console.log('B:', JSON.stringify(b.eng.status()))
    const bc = b.db.get<{ id: number }>('SELECT id FROM companies WHERE name = ?', name)
    expect(bc).toBeTruthy()
    expect(b.db.get<{ value: string }>('SELECT value FROM company_contacts WHERE company_id = ?', bc!.id)?.value).toBe(`info@${stamp}.com.tr`)
    const bf = b.db.get<{ path: string }>('SELECT path FROM files WHERE name = ?', `${stamp}.txt`)!.path
    expect(existsSync(bf) && readFileSync(bf, 'utf8')).toBe('dosya içeriği ğüşıöç')

    b.db.run("UPDATE companies SET stage_key = 'meeting', internal_notes = 'B görüştü' WHERE id = ?", bc!.id)
    await b.eng.cycle()
    await a.eng.cycle()
    expect({ ...a.db.get('SELECT stage_key, internal_notes FROM companies WHERE id = ?', cid) }).toEqual({ stage_key: 'meeting', internal_notes: 'B görüştü' })

    const k = `msg:test-${stamp}`
    const la = await a.client.req<{ ok: boolean }>('claim', { body: { key: k, device: 'A' } })
    const lb = await b.client.req<{ ok: boolean; by: string }>('claim', { body: { key: k, device: 'B' } })
    expect(la.ok).toBe(true)
    expect(lb.ok).toBe(false)
    for (const p of [a, b]) (p.db.raw as unknown as { close: () => void }).close()
    rmSync(root, { recursive: true, force: true })
  }, 180_000)
})
