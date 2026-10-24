// Uygulama servis kapsayıcısı: tüm servisleri oluşturur ve birbirine bağlar.

import { join } from 'node:path'
import { existsSync, mkdirSync } from 'node:fs'
import { Db } from '../database/db'
import { SecretStore, type Cipher } from '../security/secrets'
import { AppLock } from '../security/app-lock'
import { SettingsService } from './settings'
import { FileStore } from '../files/folders'
import { CompanyService } from './companies'
import { PoliteFetcher } from '../http/fetcher'
import { SiteAnalyzer } from '../analysis/analyzer'
import { browserCheck } from '../analysis/browser'
import { PageSpeedClient } from '../integrations/pagespeed'
import { AnthropicProvider, OllamaProvider, OpenAiProvider, type AiProvider } from '../integrations/ai/ai-client'
import { AgentBrowser, detectBrowsers, type AgentEvent } from '../automation/agent-browser'
import { GoogleBrowserSearch } from '../automation/google-browser'
import { WhatsAppWeb } from '../automation/whatsapp-web'
import { GmailWeb } from '../automation/gmail-web'
import { crawlContacts } from '../research/contact-crawler'
import { log } from '../logger'
import { GooglePlacesProvider, SerpApiProvider, BraveProvider, type SearchProvider } from '../integrations/search/providers'
import { AnalysisService } from './analysis-service'
import { JobEngine } from '../jobs/engine'
import { ResearchPipeline } from '../research/pipeline'
import { OutreachService } from '../outreach/outreach-service'
import { OfferService } from './offers'
import { StatsService } from './stats'
import { BackupService } from './backup'
import { researchReportHtml } from '../reports/templates'
import { brandForPdf, htmlToPdf } from '../reports/pdf'
import { verifyEmail, whatsappHealth, whatsappTemplates, type EmailAccount } from '../outreach/channels'
import type { CheckResult, JobEvent } from '@shared/types'

export interface Paths {
  userData: string
  documents: string
}

export class AppServices {
  readonly db: Db
  readonly settings: SettingsService
  readonly secrets: SecretStore
  readonly lock: AppLock
  readonly files: FileStore
  readonly companies: CompanyService
  readonly http: PoliteFetcher
  readonly analysis: AnalysisService
  readonly jobs: JobEngine
  readonly research: ResearchPipeline
  readonly outreach: OutreachService
  readonly offers: OfferService
  readonly stats: StatsService
  readonly backups: BackupService
  readonly agent: AgentBrowser
  readonly google: GoogleBrowserSearch
  readonly wa: WhatsAppWeb
  readonly gmail: GmailWeb
  private aiCache: { key: string; p: AiProvider } | null = null

  constructor(
    readonly paths: Paths,
    cipher: Cipher,
    readonly emit: (event: string, payload: unknown) => void
  ) {
    mkdirSync(paths.userData, { recursive: true })
    this.db = new Db(join(paths.userData, 'ucamedya-ai.sqlite'))
    this.db.migrate()
    this.settings = new SettingsService(this.db)
    this.secrets = new SecretStore(this.db, cipher)
    this.lock = new AppLock(this.settings)
    this.files = new FileStore(this.db, () => this.settings.get().dataDir || join(paths.documents, 'UcaMedya AI Data'))
    this.companies = new CompanyService(this.db, this.files)
    this.http = new PoliteFetcher(fetch, 1500)
    const change = (scope: string, id?: number) => this.emit('data-changed', { scope, id })
    this.agent = new AgentBrowser(paths.userData, (ev: AgentEvent) => this.emit('agent', ev), (m) => log('info', m))
    this.google = new GoogleBrowserSearch(this.agent)
    this.wa = new WhatsAppWeb(this.agent)
    this.gmail = new GmailWeb(this.agent)
    this.analysis = new AnalysisService(this.db, this.files, this.companies, this.settings, new SiteAnalyzer(this.http), () => this.pagespeed(), () => this.ai(), change)
    this.jobs = new JobEngine(this.db, () => this.settings.get().analysis.concurrency + 1, (ev: JobEvent) => this.emit('job', ev))
    this.outreach = new OutreachService(this.db, this.companies, this.settings, this.secrets, this.files, () => this.ai(), change)
    this.offers = new OfferService(this.db, this.files, this.companies, this.settings, change)
    this.stats = new StatsService(this.db)
    this.backups = new BackupService(this.db, () => this.settings.get().backup.dir || join(paths.userData, 'Yedekler'))
    this.research = new ResearchPipeline(
      this.db, this.companies, this.analysis, this.settings,
      (k) => this.searchProvider(k),
      (cid, ch, tone) => this.outreach.createDrafts(cid, ch, tone),
      (rid) => this.researchReport(rid),
      change,
      async (companyId, signal) => {
        const site = this.db.get<{ website: string | null }>('SELECT website FROM companies WHERE id = ?', companyId)?.website
        if (!site) return 0
        const found = await crawlContacts(this.http, site, signal)
        for (const c of found) this.companies.addContact(companyId, { type: c.type, value: c.value, sourceUrl: c.sourceUrl, sourceType: 'website', verified: false })
        if (found.length) this.companies.log(companyId, 'İletişim bilgileri bulundu', `${found.length} kayıt (kaynak: şirketin web sitesi)`, 'system')
        return found.length
      }
    )
    this.outreach.attachWeb(
      { agent: this.agent, wa: this.wa, gmail: this.gmail, ensureStarted: () => this.ensureAgent(), available: () => detectBrowsers().length > 0 },
      (r) => this.emit('outreach-confirm', r)
    )
    this.registerJobs()
  }

  private registerJobs() {
    this.jobs.register('research', (ctx) => this.research.run(ctx))
    this.jobs.register('analysis', async (ctx) => {
      const ids = (ctx.payload.companyIds as number[]) ?? []
      const url = ctx.payload.url as string | undefined
      if (url) {
        ctx.progress(0, 1, `Analiz: ${url}`)
        const r = await this.analysis.analyzeUrl(url, { signal: ctx.signal, onStep: (m) => ctx.log(m) })
        ctx.progress(1, 1)
        if (r.status !== 'done') throw new Error(this.db.get<{ error: string }>('SELECT error FROM website_analyses WHERE id = ?', r.analysisId)?.error ?? 'Analiz başarısız')
        return r
      }
      const doneIds = new Set((ctx.payload.done as number[]) ?? [])
      let done = doneIds.size
      for (const id of ids) {
        if (doneIds.has(id)) continue
        await ctx.checkpoint()
        const name = this.db.get<{ name: string }>('SELECT name FROM companies WHERE id = ?', id)?.name ?? `#${id}`
        ctx.progress(done, ids.length, `${name} analiz ediliyor`)
        try {
          const r = await this.analysis.analyzeCompany(id, { signal: ctx.signal, onStep: (m) => ctx.log(`${name}: ${m}`) })
          if (r.status !== 'done' && r.status !== 'no_website') ctx.failItem()
        } catch (e) {
          ctx.failItem()
          ctx.log(`${name}: ${(e as Error).message}`)
        }
        done++
        doneIds.add(id)
        this.db.run('UPDATE automation_runs SET payload = ? WHERE id = ?', JSON.stringify({ ...ctx.payload, done: [...doneIds] }), ctx.runId)
        ctx.progress(done, ids.length)
      }
      return { analyzed: done }
    })
    this.jobs.register('drafts', async (ctx) => {
      const ids = (ctx.payload.companyIds as number[]) ?? []
      let i = 0
      for (const id of ids) {
        await ctx.checkpoint()
        try {
          await this.outreach.createDrafts(id, (ctx.payload.channels as ('email' | 'whatsapp')[]) ?? ['email'], String(ctx.payload.tone ?? 'professional'))
        } catch (e) {
          ctx.failItem()
          ctx.log((e as Error).message)
        }
        ctx.progress(++i, ids.length)
      }
      return { companies: ids.length }
    })
    this.jobs.register('reply_sync', async (ctx) => {
      ctx.progress(0, 1, 'Gelen kutusu kontrol ediliyor')
      const r = await this.outreach.syncReplies()
      ctx.progress(1, 1, `${r.checked} ileti tarandı, ${r.matched} yanıt eşleşti, ${r.optOuts} ret`)
      return r
    })
    this.jobs.register('backup', async (ctx) => {
      const s = this.settings.get().backup
      const r = this.backups.create((ctx.payload.kind as 'manual' | 'auto') ?? 'manual', s.dir || undefined)
      if (ctx.payload.kind === 'auto') this.backups.prune(s.keep, s.dir || undefined)
      ctx.addFile(r.file)
      return r
    })
    this.jobs.register('research_report', async (ctx) => {
      const p = await this.researchReport(Number(ctx.payload.researchId))
      ctx.addFile(p)
      return { path: p }
    })
  }

  async researchReport(researchId: number) {
    const data = this.stats.researchReportData(researchId)
    const dir = this.files.researchDir(researchId, data.name)
    const out = join(dir, `arastirma-raporu-${new Date().toISOString().slice(0, 10)}.pdf`)
    await htmlToPdf(researchReportHtml(brandForPdf(this.settings.get().brand), data), out)
    this.files.register({ path: out, kind: 'research_report', researchId })
    return out
  }

  /** Ajan tarayıcısını ayarlardaki tarayıcıyla başlatır (zaten açıksa dokunmaz). */
  async ensureAgent() {
    if (this.agent.isRunning()) return
    const pref = this.settings.get().automation.browser
    const avail = detectBrowsers()
    const kind = avail.find((b) => b.kind === pref)?.kind ?? avail[0]?.kind
    if (!kind) throw new Error('Google Chrome veya Microsoft Edge bulunamadı. Tarayıcı üzerinden çalışmak için birini kurun.')
    await this.agent.start(kind)
  }

  // ---------- Entegrasyon istemcileri ----------
  ai(): AiProvider | null {
    const s = this.settings.get().ai
    if (!s.enabled || s.provider === 'none') return null
    if (s.provider === 'ollama') {
      const ck = `ollama:${s.ollamaUrl}:${s.ollamaModel}`
      if (this.aiCache?.key !== ck) this.aiCache = { key: ck, p: new OllamaProvider(s.ollamaUrl, s.ollamaModel) }
      return this.aiCache.p
    }
    const key = s.provider === 'openai' ? this.secrets.get('openai_key') : this.secrets.get('anthropic_key')
    if (!key) return null
    const model = s.provider === 'openai' ? s.openaiModel : s.model
    const cacheKey = `${s.provider}:${model}:${key.slice(-6)}`
    if (this.aiCache?.key === cacheKey) return this.aiCache.p
    const p = s.provider === 'openai' ? new OpenAiProvider(key, model) : new AnthropicProvider(key, model)
    this.aiCache = { key: cacheKey, p }
    return p
  }

  pagespeed(): PageSpeedClient | null {
    const k = this.secrets.get('pagespeed_key')
    return k ? new PageSpeedClient(k) : null
  }

  searchProvider(key?: string): SearchProvider | null {
    const k = key ?? this.settings.get().search.provider
    if (k === 'google_browser') {
      if (!detectBrowsers().length) return null
      const g = this.google
      return {
        key: 'google_browser',
        label: g.label,
        search: async (q, o) => {
          await this.ensureAgent()
          return g.search(q, o)
        },
        test: async () => {
          await this.ensureAgent()
          return g.test()
        }
      }
    }
    if (k === 'google_places') {
      const v = this.secrets.get('google_places_key')
      return v ? new GooglePlacesProvider(this.http, v) : null
    }
    if (k === 'serpapi') {
      const v = this.secrets.get('serpapi_key')
      return v ? new SerpApiProvider(this.http, v) : null
    }
    if (k === 'brave') {
      const v = this.secrets.get('brave_key')
      return v ? new BraveProvider(this.http, v) : null
    }
    return null
  }

  private setIntegration(key: string, status: string, error: string | null, details: Record<string, unknown> = {}) {
    this.db.run("UPDATE integrations SET status = ?, last_error = ?, details = ?, last_check_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE key = ?", status, error, JSON.stringify(details), key)
  }

  /** Tek bir entegrasyonu gerçekten test eder. Başarısızlık asla başarılı gösterilmez. */
  async testIntegration(key: string): Promise<{ ok: boolean; message: string }> {
    let res: { ok: boolean; message: string }
    try {
      switch (key) {
        case 'google_browser':
        case 'google_places':
        case 'serpapi':
        case 'brave': {
          const p = this.searchProvider(key)
          if (!p) {
            res = { ok: false, message: 'API anahtarı girilmemiş.' }
            break
          }
          res = { ok: true, message: await p.test() }
          break
        }
        case 'pagespeed': {
          const p = this.pagespeed()
          if (!p) {
            res = { ok: false, message: 'API anahtarı girilmemiş. (Anahtarsız kullanım kotası çok düşüktür ve genellikle doludur.)' }
            break
          }
          const r = await p.run('https://www.google.com/', 'mobile')
          res = { ok: true, message: `Ölçüm başarılı (test: google.com mobil performans ${r.performance ?? '—'}/100).` }
          break
        }
        case 'browser': {
          res = await browserCheck()
          break
        }
        case 'ai': {
          const p = this.ai()
          if (!p) {
            res = { ok: false, message: 'Yapay zekâ sağlayıcısı veya API anahtarı tanımlanmamış.' }
            break
          }
          res = { ok: true, message: await p.ping() }
          break
        }
        case 'email': {
          const acc = this.db.get<EmailAccount>('SELECT * FROM email_accounts ORDER BY id LIMIT 1')
          if (!acc) {
            res = { ok: false, message: 'E-posta hesabı eklenmemiş.' }
            break
          }
          res = await this.testEmailAccount(acc.id)
          break
        }
        case 'whatsapp': {
          res = await this.testWhatsapp()
          break
        }
        case 'gmail_web': {
          await this.ensureAgent()
          const st = await this.gmail.status()
          res = st.loggedIn ? { ok: true, message: `Gmail oturumu açık${st.account ? ` (${st.account})` : ''}. E-postalar bu hesaptan, tarayıcı üzerinden hazırlanır.` } : { ok: false, message: 'Gmail oturumu kapalı. Kontrol Merkezi’nden "Gmail’e giriş yap" ile otomasyon tarayıcısında giriş yapın.' }
          break
        }
        case 'whatsapp_web': {
          await this.ensureAgent()
          const st = await this.agent.run(() => this.wa.status())
          res = st === 'logged_in' ? { ok: true, message: 'WhatsApp Web oturumu açık.' } : { ok: false, message: st === 'qr' ? 'WhatsApp Web oturumu kapalı: QR kodu telefonunuzla taratın.' : 'WhatsApp Web yüklenemedi; tekrar deneyin.' }
          break
        }
        case 'gmail_oauth':
        case 'm365_oauth':
          res = { ok: false, message: 'OAuth ile hesap bağlama bu sürümde geliştirilmedi. Gmail / Microsoft 365 hesapları uygulama şifresiyle SMTP/IMAP üzerinden bağlanabilir.' }
          break
        default:
          res = { ok: false, message: 'Bu entegrasyon bu sürümde desteklenmiyor.' }
      }
    } catch (e) {
      res = { ok: false, message: (e as Error).message }
    }
    const notConfigured = /girilmemiş|tanımlanmamış|eklenmemiş|geliştirilmedi|desteklenmiyor/.test(res.message) && !res.ok
    this.setIntegration(key, res.ok ? 'ok' : notConfigured ? 'not_configured' : 'error', res.ok ? null : res.message, { message: res.message })
    this.emit('data-changed', { scope: 'integrations' })
    return res
  }

  async testEmailAccount(id: number) {
    const acc = this.db.get<EmailAccount>('SELECT * FROM email_accounts WHERE id = ?', id)
    if (!acc) throw new Error('Hesap bulunamadı')
    const pass = this.secrets.get(`email_pass:${id}`)
    if (!pass) return { ok: false, message: 'Hesap parolası kayıtlı değil.' }
    try {
      const r = await verifyEmail(acc, pass)
      this.db.run("UPDATE email_accounts SET status = 'ok', last_error = NULL, last_check_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?", id)
      return { ok: true, message: `${r.smtp} ${r.imap}` }
    } catch (e) {
      this.db.run("UPDATE email_accounts SET status = 'error', last_error = ?, last_check_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?", (e as Error).message, id)
      return { ok: false, message: (e as Error).message }
    }
  }

  async testWhatsapp() {
    const wa = this.db.get<{ id: number; mode: string; phone_number_id: string | null; waba_id: string | null; template_name: string | null; template_lang: string | null }>('SELECT * FROM whatsapp_accounts ORDER BY id LIMIT 1')
    if (!wa) return { ok: false, message: 'WhatsApp yapılandırması eklenmemiş.' }
    if (wa.mode === 'click_to_chat') {
      this.db.run("UPDATE whatsapp_accounts SET status = 'ok', last_error = NULL, last_check_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?", wa.id)
      return { ok: true, message: 'Manuel (tıkla-gönder) mod: mesajlar WhatsApp uygulamanızda hazır açılır, gönderme sizdedir. API bağlantısı gerekmez; teslim/okunma bilgisi alınamaz.' }
    }
    const token = this.secrets.get('whatsapp_token')
    if (!token || !wa.phone_number_id) return { ok: false, message: 'Telefon numarası kimliği veya erişim anahtarı girilmemiş.' }
    try {
      const h = await whatsappHealth(wa.phone_number_id, token)
      let tmpl = ''
      if (wa.waba_id && wa.template_name) {
        const list = await whatsappTemplates(wa.waba_id, token)
        const t = list.find((x) => x.name === wa.template_name && (!wa.template_lang || x.language === wa.template_lang))
        tmpl = t ? ` Şablon "${t.name}" durumu: ${t.status}.` : ` Şablon "${wa.template_name}" bulunamadı.`
        if (!t || t.status !== 'APPROVED') throw new Error(`Numara erişilebilir (${h.display_phone_number}) ancak şablon onaylı değil.${tmpl}`)
      }
      this.db.run("UPDATE whatsapp_accounts SET status = 'ok', display_phone = ?, last_error = NULL, last_check_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?", h.display_phone_number ?? null, wa.id)
      return { ok: true, message: `Bağlantı başarılı: ${h.display_phone_number ?? ''} (${h.verified_name ?? ''}), kalite: ${h.quality_rating ?? '—'}, limit: ${h.messaging_limit_tier ?? '—'}.${tmpl} Not: teslim/okunma bildirimleri ve gelen mesajlar için webhook aktarım sunucusu gerekir.` }
    } catch (e) {
      this.db.run("UPDATE whatsapp_accounts SET status = 'error', last_error = ?, last_check_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?", (e as Error).message, wa.id)
      return { ok: false, message: (e as Error).message }
    }
  }

  /** Açılış ekranındaki gerçek sistem kontrolleri (hızlı; ağ testleri kısa zaman aşımıyla). */
  async startupChecks(): Promise<CheckResult[]> {
    const out: CheckResult[] = []
    const ic = this.db.integrityOk()
    out.push({ key: 'db', label: 'Yerel veritabanı kontrol ediliyor', ok: ic.ok, status: ic.ok ? 'ok' : 'error', message: ic.ok ? `Şema sürümü ${this.db.schemaVersion()}, bütünlük doğrulandı.` : `Bütünlük hatası: ${ic.message}` })
    const ai = this.ai()
    const aiOff = this.settings.get().ai.provider === 'none' || !this.settings.get().ai.enabled
    if (!ai) out.push({ key: 'ai', label: 'Yapay zekâ bağlantısı kontrol ediliyor', ok: aiOff, status: aiOff ? 'ok' : 'warn', message: aiOff ? 'Yapay zekâ isteğe bağlı ve kapalı; mesaj taslakları hazır şablonlarla, analiz bulgularına göre üretilecek.' : 'Seçilen yapay zekâ sağlayıcısının anahtarı yok; taslaklar şablonla üretilecek.' })
    else {
      try {
        await Promise.race([ai.ping(), new Promise((_, rej) => setTimeout(() => rej(new Error('8 sn içinde yanıt alınamadı')), 8000))])
        out.push({ key: 'ai', label: 'Yapay zekâ bağlantısı kontrol ediliyor', ok: true, status: 'ok', message: `${ai.name} (${ai.model}) yanıt verdi.` })
      } catch (e) {
        out.push({ key: 'ai', label: 'Yapay zekâ bağlantısı kontrol ediliyor', ok: false, status: 'error', message: (e as Error).message })
      }
    }
    const browsers = detectBrowsers()
    const ints = this.db.all<{ key: string; status: string; last_error: string | null }>('SELECT key, status, last_error FROM integrations')
    const configured = ints.filter((i) => i.status !== 'not_configured')
    const broken = configured.filter((i) => i.status === 'error')
    const sp = this.searchProvider()
    out.push({
      key: 'integrations',
      label: 'İzin verilen entegrasyonlar kontrol ediliyor',
      ok: broken.length === 0 && !!sp && browsers.length > 0,
      status: broken.length || !browsers.length ? 'error' : sp ? 'ok' : 'warn',
      message: [browsers.length ? `Tarayıcı bulundu: ${browsers.map((b) => b.label).join(', ')}. Google, Gmail ve WhatsApp oturumları Kontrol Merkezi’nden kontrol edilir.` : 'Chrome veya Edge bulunamadı; tarayıcı üzerinden arama ve gönderim yapılamaz.', sp && sp.key !== 'google_browser' ? `Arama: ${sp.label}.` : '', broken.length ? `Son testte hata veren: ${broken.map((b) => b.key).join(', ')}.` : ''].filter(Boolean).join(' ')
    })
    const interrupted = this.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM automation_runs WHERE status = 'interrupted'")?.n ?? 0
    const dataDir = this.files.root()
    out.push({ key: 'session', label: 'Son oturum verileri hazırlanıyor', ok: existsSync(dataDir), status: interrupted ? 'warn' : 'ok', message: `${this.stats.dashboard().companies} şirket kaydı.${interrupted ? ` ${interrupted} görev yarıda kalmış; Görevler ekranından devam ettirilebilir.` : ''}` })
    return out
  }

  close() {
    this.jobs.cancelAll()
    void this.agent.close()
    this.db.close()
  }
}
