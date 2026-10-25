// Canlı test: UcaMedya Bağlantı eklentisi kurulu bir WordPress'ten talep çekme.
// Çalıştırma: WP_URL=http://127.0.0.1:9420/ WP_KEY=uca_... npx vitest run tests/live-website-leads.test.ts
import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Db } from '../src/main/database/db'
import { CompanyService } from '../src/main/services/companies'
import { FileStore } from '../src/main/files/folders'
import { SettingsService } from '../src/main/services/settings'
import { WebsiteLeads } from '../src/main/integrations/website-leads'

const URL_ = process.env.WP_URL
const KEY = process.env.WP_KEY

describe.skipIf(!URL_ || !KEY)('canlı: web sitesi talepleri', () => {
  // WordPress Playground çerezsiz her isteği otomatik oturum açmaya yönlendirir (gerçek sitede olmaz)
  if (process.env.WP_PLAYGROUND) {
    const f = globalThis.fetch
    globalThis.fetch = ((u: string | URL | Request, init: RequestInit = {}) => f(u, { ...init, headers: { ...(init.headers as Record<string, string>), Cookie: 'playground_auto_login_already_happened=1' } })) as typeof fetch
  }
  it('talepleri çeker, eşleştirir, onaylar; ikinci çekişte tekrar gelmez', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'uca-live-leads-'))
    const db = new Db(join(dir, 'l.sqlite'))
    db.migrate()
    const cs = new CompanyService(db, new FileStore(db, () => join(dir, 'data')))
    const existing = cs.create({ name: 'EmlaXo Türkiye - Kocaeli Emlak Ofisi', website: 'https://www.emlaxo.com', source: 'google_browser' } as never)
    const settings = new SettingsService(db)
    const store = new Map<string, string>()
    const secrets = { has: (n: string) => store.has(n), get: (n: string) => store.get(n), set: (n: string, v: string) => void store.set(n, v) }
    const leads = new WebsiteLeads(db, cs, settings, secrets as never)
    leads.saveConfig({ siteUrl: URL_!, key: KEY!, enabled: true })
    const ping = await leads.test()
    expect(ping.ok).toBe(true)
    const r = await leads.sync()
    console.log('sync:', JSON.stringify(r))
    expect(r.imported).toBeGreaterThan(0)
    const quote = db.get<{ company_id: number; match_reason: string }>("SELECT company_id, match_reason FROM inbound_requests WHERE kind = 'quote' ORDER BY id LIMIT 1")
    expect(quote?.company_id).toBe(existing)
    const again = await leads.sync()
    expect(again.fetched).toBe(0)
    expect((await leads.test()).pending).toBe(0)
    ;(db.raw as unknown as { close?: () => void }).close?.()
    rmSync(dir, { recursive: true, force: true })
  }, 60_000)
})
