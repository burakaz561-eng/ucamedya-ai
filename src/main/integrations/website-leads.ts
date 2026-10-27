// Web sitesi talepleri: UcaMedya Bağlantı WordPress eklentisinden teklif / ön analiz taleplerini çeker.
//
// Masaüstü uygulamasının internetten erişilebilir bir adresi olmadığı için talepler uygulama tarafından
// HTTPS ile çekilir. Eklenti bağlantı anahtarı olmadan veri vermez; anahtar işletim sisteminin güvenli
// deposunda (safeStorage) tutulur. Alınan talepler onaylanır (ack) ve sitede saklama süresi sonunda silinir.
//
// Her talep mevcut müşteri kayıtlarıyla eşleştirilir: kesin eşleşmede (alan adı, telefon, e-posta) talep o
// karta eklenir; yalnızca ad benzerliği varsa yeni kart açılır ve eşleşme onay kuyruğuna alınır.

import type { Db } from '../database/db'
import type { CompanyService } from '../services/companies'
import type { SettingsService } from '../services/settings'
import type { SecretStore } from '../security/secrets'
import { emailKey, FREE_MAIL } from '@shared/text'

export interface LeadItem {
  id: number
  /** plugin: eklentinin kendi formu/ön analiz · theme: temanın "Gelen Mesajlar"ı */
  source?: 'plugin' | 'theme'
  kind: string
  created_at?: string
  submitted_at?: string
  service?: string
  service_label?: string
  answers?: Record<string, string>
  person_name?: string
  company_name?: string
  email?: string
  phone?: string
  website?: string
  message?: string
  contact_pref?: string
  page_url?: string
  consent?: Record<string, unknown>
}

export interface ImportResult {
  inboundId: number | null
  companyId: number | null
  created: boolean
  matchReason: string | null
  duplicate: boolean
}

const KEY_NAME = 'website_leads_key'

/** Site adresini doğrular; yerel test dışında yalnızca HTTPS kabul edilir (anahtar açık metin gitmesin). */
export function normalizeSiteUrl(raw: string): string {
  let u = raw.trim()
  if (!u) throw new Error('Site adresi boş')
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`
  const url = new URL(u)
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(url.hostname)
  if (url.protocol !== 'https:' && !local) throw new Error('Bağlantı anahtarının güvenliği için site adresi https:// ile başlamalıdır.')
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}/`
}

export class WebsiteLeads {
  claimer: { active: () => boolean; claim: (key: string) => Promise<{ ok: boolean; done: boolean; by: string | null }> } | null = null

  constructor(
    private db: Db,
    private companies: CompanyService,
    private settings: SettingsService,
    private secrets: SecretStore
  ) {}

  config() {
    const w = this.settings.get().website
    return {
      ...w,
      hasKey: this.secrets.has(KEY_NAME),
      lastSync: this.settings.getValue('website_leads_last_sync') ?? null,
      lastError: this.settings.getValue('website_leads_last_error') || null,
      newCount: this.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM inbound_requests WHERE status = 'new'")!.n
    }
  }

  saveConfig(c: { siteUrl?: string; enabled?: boolean; syncMinutes?: number; key?: string | null }) {
    const cur = this.settings.get().website
    const siteUrl = c.siteUrl != null ? (c.siteUrl.trim() ? normalizeSiteUrl(c.siteUrl) : '') : cur.siteUrl
    this.settings.update({ website: { siteUrl, enabled: c.enabled ?? cur.enabled, syncMinutes: Math.max(2, Math.min(240, Math.round(c.syncMinutes ?? cur.syncMinutes))) } })
    if (c.key) {
      const k = c.key.trim()
      if (!/^[A-Za-z0-9_]{20,80}$/.test(k)) throw new Error('Bağlantı anahtarı biçimi geçersiz. WordPress → Ayarlar → UcaMedya Bağlantı sayfasındaki anahtarı olduğu gibi kopyalayın.')
      this.secrets.set(KEY_NAME, k)
    }
    return this.config()
  }

  private async call<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    const { siteUrl } = this.settings.get().website
    const key = this.secrets.get(KEY_NAME)
    if (!siteUrl || !key) throw new Error('Web sitesi bağlantısı ayarlanmamış (site adresi ve bağlantı anahtarı gerekli).')
    const url = new URL(`wp-json/ucamedya/v1/${path}`, normalizeSiteUrl(siteUrl))
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 20_000)
    try {
      const r = await fetch(url, {
        method: init.method ?? 'GET',
        headers: { 'X-UcaMedya-Key': key, Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
        body: init.body ? JSON.stringify(init.body) : undefined,
        redirect: 'error',
        signal: ctrl.signal
      })
      const text = await r.text()
      let json: unknown = null
      try {
        json = JSON.parse(text)
      } catch {
        /* JSON değil */
      }
      if (r.status === 401) throw new Error('Bağlantı anahtarı geçersiz. WordPress\'teki anahtarı yeniden kopyalayın.')
      if (r.status === 404) throw new Error('Sitede UcaMedya Bağlantı eklentisi bulunamadı (eklenti kurulu ve etkin mi? kalıcı bağlantılar açık mı?).')
      if (!r.ok || json == null) throw new Error(`Site beklenmeyen yanıt verdi (HTTP ${r.status}).`)
      return json as T
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw new Error('Site 20 saniye içinde yanıt vermedi.')
      if (/redirect/i.test(`${(e as Error).message} ${String(((e as Error).cause as Error | undefined)?.message ?? '')}`)) throw new Error('Site adresi yönlendiriyor. Adresi tarayıcıda açılan son hâliyle (www / https dahil) girin.')
      throw e
    } finally {
      clearTimeout(t)
    }
  }

  async test() {
    return this.call<{ ok: boolean; site: string; url: string; plugin: string; pending: number }>('ping')
  }

  /** Yeni talepleri çeker, içe aktarır, sitede onaylar. */
  async sync(): Promise<{ fetched: number; imported: number; created: number; matched: number; items: { companyId: number | null; title: string }[] }> {
    const site = normalizeSiteUrl(this.settings.get().website.siteUrl)
    let fetched = 0, imported = 0, created = 0, matched = 0
    const items: { companyId: number | null; title: string }[] = []
    try {
      for (let page = 0; page < 10; page++) {
        const r = await this.call<{ items: LeadItem[] }>('requests?limit=50')
        if (!r.items?.length) break
        fetched += r.items.length
        const ack: number[] = []
        const themeAck: number[] = []
        for (const it of r.items) {
          // Ekip modunda talebi yalnızca bir bilgisayar içeri alır (diğeri kaydı eşitlemeyle görür)
          if (this.claimer?.active()) {
            const lock = await this.claimer.claim(`lead:${site}#${it.source === 'theme' ? 'theme-' : ''}${it.id}`).catch(() => null)
            if (!lock) continue
            if (!lock.ok) {
              ;(it.source === 'theme' ? themeAck : ack).push(it.id)
              continue
            }
          }
          const res = this.db.tx(() => this.importItem(site, it))
          ;(it.source === 'theme' ? themeAck : ack).push(it.id)
          if (res.duplicate) continue
          imported++
          if (res.created) created++
          else matched++
          items.push({ companyId: res.companyId, title: `${it.service_label ?? 'Talep'} — ${it.company_name || it.person_name || ''}` })
        }
        await this.call('requests/ack', { method: 'POST', body: { ids: ack, theme_ids: themeAck } })
        if (r.items.length < 50) break
      }
      this.settings.setValue('website_leads_last_sync', new Date().toISOString())
      this.settings.setValue('website_leads_last_error', '')
    } catch (e) {
      this.settings.setValue('website_leads_last_error', (e as Error).message)
      throw e
    }
    return { fetched, imported, created, matched, items }
  }

  /** Tek bir talebi kaydeder ve müşteri kartıyla eşleştirir (aynı talep ikinci kez gelirse yok sayılır). */
  importItem(site: string, it: LeadItem): ImportResult {
    const extId = it.source === 'theme' ? `theme-${it.id}` : String(it.id)
    if (this.db.get('SELECT 1 FROM inbound_requests WHERE site = ? AND external_id = ?', site, extId)) return { inboundId: null, companyId: null, created: false, matchReason: null, duplicate: true }
    const s = (v: unknown, n = 500) => (typeof v === 'string' ? v.trim().slice(0, n) : '')
    const person = s(it.person_name, 120)
    const companyName = s(it.company_name, 160)
    const email = s(it.email, 160)
    const phone = s(it.phone, 40)
    const website = s(it.website, 300)
    const kind = it.source === 'theme' ? 'contact' : it.kind === 'audit' ? 'audit' : 'quote'
    const answers = it.answers && typeof it.answers === 'object' ? Object.fromEntries(Object.entries(it.answers).slice(0, 40).map(([k, v]) => [s(k, 120), s(v, 600)])) : {}
    const ins = this.db.run(
      `INSERT INTO inbound_requests(site, external_id, kind, person_name, company_name, email, phone, website, service, answers, message, contact_pref, page_url, consent, submitted_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      site, extId, kind, person || null, companyName || null, email || null, phone || null, website || null, s(it.service_label, 80) || s(it.service, 40) || null,
      JSON.stringify(answers), s(it.message, 5000) || null, s(it.contact_pref, 20) || null, s(it.page_url, 500) || null, JSON.stringify(it.consent ?? {}), s(it.submitted_at, 40) || s(it.created_at, 40) || null
    )
    const inboundId = ins.lastInsertRowid

    // 1) Kesin eşleşme: e-posta ya da telefon birebir aynı (ücretsiz e-posta dahil: kişi aynı adresi yazmış)
    let companyId: number | null = null
    let reason: string | null = null
    const ek = email ? emailKey(email) : ''
    if (ek) {
      const r = this.db.get<{ company_id: number }>("SELECT cc.company_id FROM company_contacts cc JOIN companies c ON c.id = cc.company_id WHERE cc.type = 'email' AND cc.value_key = ? AND c.merged_into IS NULL LIMIT 1", ek)
      if (r) (companyId = r.company_id), (reason = 'aynı e-posta adresi')
    }
    const name = companyName || person || email || 'Web sitesi talebi'
    let uncertain: { id: number; reason: string } | null = null
    if (!companyId) {
      const dup = this.companies.findDuplicate({ name, website: website || null, phone: phone || null, email: email || null })
      if (dup?.certain) (companyId = dup.id), (reason = dup.reason)
      else if (dup) uncertain = dup
    }
    let created = false
    if (!companyId) {
      companyId = this.companies.create({ name, website: website || undefined, source: 'website', description: companyName ? undefined : 'Bireysel başvuru (şirket adı belirtilmedi)' } as Parameters<CompanyService['create']>[0])
      created = true
      this.db.run("UPDATE companies SET stage_key = 'review' WHERE id = ? AND EXISTS (SELECT 1 FROM stages WHERE key = 'review')", companyId)
      if (uncertain) this.companies.addMatchCandidate(companyId, uncertain.id, `${uncertain.reason} (web sitesi talebi)`)
    } else if (website) {
      this.db.run('UPDATE companies SET website = COALESCE(website, ?) WHERE id = ?', website, companyId)
    }
    // İletişim bilgileri: ziyaretçinin kendi yazdığı bilgiler
    if (email) this.companies.addContact(companyId, { type: 'email', value: email, sourceType: 'form', sourceUrl: s(it.page_url, 500) || null, verified: true, kind: FREE_MAIL.test(ek) ? 'personal' : 'corporate' })
    if (phone) this.companies.addContact(companyId, { type: it.contact_pref === 'whatsapp' ? 'whatsapp' : 'phone', value: phone, sourceType: 'form', sourceUrl: s(it.page_url, 500) || null, verified: true })
    if (it.contact_pref) this.db.run('UPDATE companies SET contact_preference = COALESCE(contact_preference, ?) WHERE id = ?', s(it.contact_pref, 20), companyId)
    // İzin kaydı: ziyaretçi talebinin yanıtlanması için açık onay verdi (KVKK kutusu zorunlu). Pazarlama izni ayrı tutulur.
    const consent = (it.consent ?? {}) as { kvkk?: boolean; marketing?: boolean; at?: string; privacy_url?: string }
    if (it.source === 'theme' && email) {
      // Sitedeki iletişim formu: kişi iletişim talebini kendisi gönderdi; ayrı onay kutusu yok → yalnızca talebe yanıt
      this.db.run(
        `INSERT INTO outreach_permissions(company_id, channel, status, legal_basis, purpose, evidence, recorded_by) VALUES (?, 'email', 'opt_in', ?, ?, ?, 'web formu')
         ON CONFLICT(company_id, channel) DO NOTHING`,
        companyId, 'Kişinin kendi iletişim talebi (sitedeki iletişim formu)', 'Yalnızca talebe yanıt — pazarlama izni yok', JSON.stringify({ kaynak: 'tema iletişim formu', sayfa: s(it.page_url, 300), tarih: s(it.submitted_at, 40) })
      )
    }
    if (consent.kvkk) {
      const evidence = JSON.stringify({ kaynak: 'web formu', sayfa: s(it.page_url, 300), tarih: consent.at, aydinlatma: consent.privacy_url, pazarlama_izni: !!consent.marketing })
      for (const ch of ['email', 'whatsapp'] as const) {
        if (ch === 'email' && !email) continue
        if (ch === 'whatsapp' && !(phone && it.contact_pref === 'whatsapp')) continue
        this.db.run(
          `INSERT INTO outreach_permissions(company_id, channel, status, legal_basis, purpose, evidence, recorded_by) VALUES (?,?, 'opt_in', ?, ?, ?, 'web formu')
           ON CONFLICT(company_id, channel) DO UPDATE SET status = CASE WHEN status = 'opted_out' THEN status ELSE 'opt_in' END, legal_basis = excluded.legal_basis, purpose = excluded.purpose, evidence = excluded.evidence, recorded_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
          companyId, ch, consent.marketing ? 'Açık rıza (web formu, pazarlama izni dahil)' : 'Talebin yanıtlanması için ziyaretçinin başvurusu (web formu)',
          consent.marketing ? 'Teklif talebine yanıt ve bilgilendirme' : 'Yalnızca teklif talebine yanıt', evidence
        )
      }
    }
    this.db.run('UPDATE inbound_requests SET company_id = ?, match_reason = ? WHERE id = ?', companyId, created ? (uncertain ? `yeni kayıt — olası eşleşme onay bekliyor (${uncertain.reason})` : 'yeni kayıt') : reason, inboundId)
    const label = kind === 'contact' ? `İletişim formu mesajı${s(it.service_label, 80) && it.service_label !== 'İletişim formu' ? `: ${s(it.service_label, 80)}` : ''}` : kind === 'audit' ? 'Ücretsiz ön analiz sonrası iletişim talebi' : `Teklif talebi: ${s(it.service_label, 80) || 'hizmet belirtilmedi'}`
    this.db.run("INSERT OR IGNORE INTO communication_events(company_id, channel, direction, kind, summary, body, external_id) VALUES (?, 'website', 'in', 'inbound_request', ?, ?, ?)", companyId, label, s(it.message, 5000) || null, `${site}#${extId}`)
    this.db.run("INSERT INTO tasks(title, description, company_id, due_at, priority, status, kind) VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'), 'high', 'open', 'inbound')", `Web sitesi talebini incele: ${s(it.service_label, 80) || 'talep'}`, `${person || ''} ${email || ''} ${phone || ''}`.trim(), companyId)
    this.companies.log(companyId, 'Web sitesinden talep geldi', label, 'system')
    return { inboundId, companyId, created, matchReason: reason, duplicate: false }
  }

  list(f: { status?: string }) {
    const rows = this.db.all(
      `SELECT r.*, c.name AS company, c.stage_key FROM inbound_requests r LEFT JOIN companies c ON c.id = r.company_id ${f.status ? 'WHERE r.status = ?' : ''} ORDER BY r.id DESC LIMIT 500`,
      ...(f.status ? [f.status] : [])
    )
    return rows.map((r) => ({ ...r, answers: safeJson(r.answers), consent: safeJson(r.consent) }))
  }

  setStatus(id: number, status: 'new' | 'reviewed' | 'converted' | 'spam') {
    this.db.run('UPDATE inbound_requests SET status = ? WHERE id = ?', status, id)
  }
}

function safeJson(v: unknown) {
  try {
    return JSON.parse(String(v ?? '{}'))
  } catch {
    return {}
  }
}

