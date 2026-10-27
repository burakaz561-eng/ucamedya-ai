import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Db } from '../src/main/database/db'
import { CompanyService } from '../src/main/services/companies'
import { FileStore } from '../src/main/files/folders'
import { SecretStore } from '../src/main/security/secrets'
import { SettingsService, DEFAULT_SETTINGS } from '../src/main/services/settings'
import { JobEngine } from '../src/main/jobs/engine'
import { BackupService, verifyBackupFile } from '../src/main/services/backup'
import { evaluate, findPageLinks, ruleSummary } from '../src/main/analysis/rules'
import { computeOpportunity } from '../src/main/research/scoring'
import { checkEligibility, idempotencyKey, isOptOutReply } from '../src/main/outreach/compliance'
import { templateDraft } from '../src/main/outreach/drafting'
import { rankContacts, type ContactRow } from '../src/main/outreach/contact-rank'
import { DEFAULT_TEMPLATES, renderTemplate, shortCompanyName } from '../src/shared/message-templates'
import { computeTotals } from '../src/shared/offer-math'
import { buildQueries } from '../src/main/research/pipeline'
import { csvToHits } from '../src/main/integrations/search/providers'
import { parseRobots, isPathAllowed } from '../src/main/http/robots'
import { companyNameKey, emailKey, isOfficialWebsite, phoneKey, safeFolderName, fold } from '../src/shared/text'
import { isSafeExternalUrl } from '../src/main/http/url-safety'

// ---------- Yardımcılar ----------
let dir: string
let db: Db
const fakeCipher = { available: () => true, encrypt: (s: string) => Buffer.from(`enc:${s}`), decrypt: (b: Buffer) => b.toString().replace(/^enc:/, '') }

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'uca-test-'))
  db = new Db(join(dir, 'test.sqlite'))
  db.migrate()
})
afterEach(() => {
  db.close()
  rmSync(dir, { recursive: true, force: true })
})

function page(over: Record<string, any> = {}): any { // eslint-disable-line @typescript-eslint/no-explicit-any
  return {
    url: 'https://ornek.com.tr/', title: 'Örnek İnşaat | Kocaeli konut projeleri', lang: 'tr',
    viewport: { w: 390, h: 844, meta: 'width=device-width, initial-scale=1', scrollWidth: 390, pageHeight: 3000 },
    text: { elements: 100, small: 2, tiny: 0, smallSamples: [], lowContrast: 1, contrastChecked: 100, lowContrastSamples: [], families: [['outfit', 1000], ['inter', 500]], sizes: 6, colors: 6, aboveFoldWords: 80, totalWords: 900 },
    overflow: [], targets: { total: 40, small: 2, samples: [] },
    images: { total: 10, missingAlt: 0, upscaled: 0, upscaledSamples: [], oversized: 0, lazy: 5, broken: 0 },
    links: [
      { href: 'https://ornek.com.tr/hakkimizda', text: 'Hakkımızda', inNav: true },
      { href: 'https://ornek.com.tr/projeler', text: 'Projelerimiz', inNav: true },
      { href: 'https://ornek.com.tr/hizmetler', text: 'Hizmetler', inNav: true },
      { href: 'https://ornek.com.tr/iletisim', text: 'İletişim', inNav: true },
      { href: 'https://ornek.com.tr/kvkk', text: 'KVKK Aydınlatma Metni', inNav: false }
    ],
    navLinks: 6, hamburger: true, buttonStyleVariants: 3,
    contacts: { mailtos: ['info@ornek.com.tr'], tels: ['+902621112233'], whatsappLinks: [], emailsInText: [], phonesInText: [], socials: ['https://instagram.com/ornek'] },
    cta: { total: 3, aboveFold: [{ text: 'Teklif Al', sel: 'a.btn', w: 140, h: 44 }] },
    forms: [{ inputs: 4, unlabeled: 0, smallFont: 0, hasSubmit: true }],
    seo: { description: 'Kocaeli’de konut ve ticari yapı projeleri geliştiren, 25 yıllık deneyime sahip inşaat firması. Projelerimizi inceleyin.', robots: null, canonical: 'https://ornek.com.tr/', ogTitle: 'x', ogImage: 'y', h1: ['Güvenle yükselen yapılar'], headings: [], headingSkips: 0, ldTypes: ['Organization'] },
    legacy: { copyrightYear: 2026, jquery: null, layoutTables: 0, font: false, flash: false, generator: null, frames: 0 },
    timing: { ttfb: 300, dcl: 900, load: 1500, transfer: 50 },
    resources: { count: 40, kb: 1500, imageKb: 900, big: [] },
    ...over
  }
}
const site = { https: true, httpRedirectsToHttps: true, robotsTxt: { status: 200, disallowAll: false }, sitemap: { found: true }, brokenLinks: { checked: 10, broken: [] }, consoleErrors: 0, failedRequests: [], mixedContent: 0 }

// ---------- Analiz kuralları ----------
describe('analiz kuralları', () => {
  it('iyi bir sitede ciddi bulgu üretmez ve yüksek puan verir', () => {
    const r = evaluate({ desktop: page(), mobile: page(), pages: [{ kind: 'home', url: 'https://ornek.com.tr/', desktop: page() }, { kind: 'contact', url: 'https://ornek.com.tr/iletisim', desktop: page() }], site, psi: null, siteDomain: 'ornek.com.tr' })
    expect(r.findings.filter((f) => f.severity === 'high')).toHaveLength(0)
    expect(r.overall).toBeGreaterThanOrEqual(85)
    expect(r.tests.find((t) => t.key === 'pagespeed')?.status).toBe('skipped')
  })

  it('mobil taşma, viewport eksikliği, CTA yokluğu ve HTTPS eksikliğini ölçümle raporlar', () => {
    const m = page({ viewport: { w: 390, h: 844, meta: null, scrollWidth: 980, pageHeight: 3000 }, overflow: [{ sel: 'div.container', right: 980, width: 960, top: 0 }] })
    const d = page({ cta: { total: 0, aboveFold: [] }, contacts: { mailtos: [], tels: [], whatsappLinks: [], emailsInText: [], phonesInText: [], socials: [] } })
    const r = evaluate({ desktop: d, mobile: m, pages: [{ kind: 'home', url: 'http://ornek.com.tr/', desktop: d }], site: { ...site, https: false }, psi: null, siteDomain: 'ornek.com.tr' })
    const codes = r.findings.map((f) => f.code)
    expect(codes).toEqual(expect.arrayContaining(['mobile_no_viewport', 'mobile_overflow', 'ux_no_cta_fold', 'perf_no_https']))
    const overflow = r.findings.find((f) => f.code === 'mobile_overflow')!
    expect(overflow.evidence).toContain('980px')
    expect(overflow.certainty).toBe('measured')
    expect(r.scores.mobile.score!).toBeLessThan(60)
  })

  it('ölçülemeyen kategori için puan uydurmaz', () => {
    const r = evaluate({ desktop: null, mobile: null, pages: [], site: { ...site, robotsTxt: null, sitemap: null, brokenLinks: null }, psi: null, siteDomain: 'x.com' })
    expect(r.scores.design.score).toBeNull()
    expect(r.scores.design.confidence).toBe('none')
    expect(r.scores.mobile.score).toBeNull()
  })

  it('PageSpeed varsa performans puanına dahil eder', () => {
    const psi = { strategy: 'mobile' as const, performance: 20, accessibility: 90, seo: 90, bestPractices: 90, lab: { lcp: 9000, cls: 0.3, tbt: 1200 }, field: null, fetchedAt: new Date().toISOString() }
    const r = evaluate({ desktop: page(), mobile: page(), pages: [], site, psi, siteDomain: 'ornek.com.tr' })
    expect(r.findings.some((f) => f.code === 'perf_lighthouse_low' && f.severity === 'high')).toBe(true)
    expect(r.scores.performance.score!).toBeLessThan(50)
  })

  it('Türkçe büyük İ harfli menü bağlantılarını bulur', () => {
    const links = findPageLinks(page({ links: [{ href: 'https://ornek.com.tr/contact-us', text: 'İLETİŞİM', inNav: true }, { href: 'https://ornek.com.tr/kurumsal', text: 'KURUMSAL', inNav: true }] }), 'ornek.com.tr')
    expect(links.contact).toBe('https://ornek.com.tr/contact-us')
    expect(links.about).toBe('https://ornek.com.tr/kurumsal')
  })

  it('özet yalnızca bulgulardan üretilir', () => {
    expect(ruleSummary([], 90)).toContain('belirgin bir sorun tespit edilmedi')
  })
})

// ---------- Puanlama ----------
describe('fırsat puanı', () => {
  const s = DEFAULT_SETTINGS.scoring
  const base = { websiteStatus: 'ok', overall: 90, findings: [], businessStatus: 'OPERATIONAL', ratingCount: 10, copyrightYear: 2026, contacts: [{ type: 'email', kind: 'corporate', sourceType: 'website' }], customerTypes: [], stageKey: 'review', suppressed: false, contactedBefore: false, isCustomer: false }
  it('sitesi olmayan şirket yüksek ihtiyaç puanı alır ve gerekçe yazılır', () => {
    const r = computeOpportunity({ ...base, websiteStatus: 'none', overall: null, customerTypes: ['no_website'] }, s)
    expect(r.score).toBeGreaterThan(70)
    expect(r.services).toContain('corporate_web')
    expect(r.reasons.every((x) => x.note.length > 0)).toBe(true)
  })
  it('ret listesindeki şirket "iletişim istemiyor" grubuna girer', () => {
    expect(computeOpportunity({ ...base, suppressed: true }, s).group).toBe('opted_out')
  })
  it('iletişim kanalı yoksa "ek araştırma gerekiyor"', () => {
    expect(computeOpportunity({ ...base, overall: 40, contacts: [] }, s).group).toBe('needs_research')
  })
  it('kötü site + hedef fırsat eşleşmesi daha yüksek puan', () => {
    const low = computeOpportunity({ ...base, overall: 90 }, s).score
    const high = computeOpportunity({ ...base, overall: 35, customerTypes: ['mobile'], findings: [{ category: 'mobile', severity: 'high', serviceKey: 'redesign', code: 'mobile_overflow' }, { category: 'ux', severity: 'high', serviceKey: 'redesign', code: 'ux_no_cta_fold' }] }, s).score
    expect(high).toBeGreaterThan(low + 20)
  })
})

// ---------- Uygunluk ----------
describe('gönderim uygunluğu', () => {
  const ok = { channel: 'email' as const, recipientKey: 'info@ornek.com.tr', contactKind: 'corporate', draftStatus: 'approved', requireApproval: true, suppressedCompany: false, suppressedRecipient: false, permissionStatus: 'b2b_legitimate_interest', allowPersonalContacts: false, alreadySentToRecipient: false, accountReady: true, dailySent: 0, dailyLimit: 50, testMode: false, testRecipientReady: false }
  it('tüm koşullar sağlanınca uygun', () => expect(checkEligibility(ok).ok).toBe(true))
  it('onaysız, ret listesinde, kişisel, tekrar, limit dolu → engellenir', () => {
    expect(checkEligibility({ ...ok, draftStatus: 'draft' }).ok).toBe(false)
    expect(checkEligibility({ ...ok, suppressedRecipient: true }).ok).toBe(false)
    expect(checkEligibility({ ...ok, contactKind: 'personal' }).ok).toBe(false)
    expect(checkEligibility({ ...ok, alreadySentToRecipient: true }).ok).toBe(false)
    expect(checkEligibility({ ...ok, dailySent: 50 }).ok).toBe(false)
    expect(checkEligibility({ ...ok, testMode: true }).ok).toBe(false)
  })
  it('WhatsApp resmî API şablonsuz ilk temasa izin vermez', () => {
    expect(checkEligibility({ ...ok, channel: 'whatsapp', recipientKey: '905321112233', whatsappMode: 'cloud_api', whatsappTemplateReady: false }).ok).toBe(false)
  })
  it('izin kaydı yoksa uyarı verir', () => expect(checkEligibility({ ...ok, permissionStatus: null }).warnings.length).toBeGreaterThan(0))
  it('ret yanıtlarını tanır', () => {
    expect(isOptOutReply('Lütfen bir daha mail atmayın')).toBe(true)
    expect(isOptOutReply('İSTEMİYORUM')).toBe(true)
    expect(isOptOutReply('STOP')).toBe(true)
    expect(isOptOutReply('Teklifinizi iptal etmek yerine görüşelim')).toBe(false)
  })
  it('idempotency anahtarı kararlı', () => expect(idempotencyKey('email', 3, 'a@b.com', null)).toBe('email:3:a@b.com:ilk-temas'))
})

describe('şablon taslak', () => {
  it('yalnızca kayıtlı bulgulardan söz eder ve ret satırı ekler', () => {
    const d = templateDraft({ company: { name: 'Örnek İnşaat', sector: 'İnşaat', city: 'Kocaeli', website: 'https://ornek.com.tr', websiteStatus: 'ok' }, findings: [{ code: 'mobile_overflow', category: 'mobile', title: 'Mobilde içerik ekran dışına taşıyor', evidence: '980px', severity: 'high', recommendation: null, certainty: 'measured' }], services: [], brand: { name: 'UcaMedya', website: 'https://ucamedya.com.tr/', email: '', phone: '', signature: 'UcaMedya', senderName: 'UcaMedya' }, channel: 'email', tone: 'professional', optOutLine: 'İstemiyorsanız yanıtlayın.' })
    expect(d.body).toContain('mobilde içerik ekran dışına taşıyor')
    expect(d.body).toContain('İstemiyorsanız yanıtlayın.')
    expect(d.usedFindings).toEqual(['mobile_overflow'])
  })
})

// ---------- Metin ve URL ----------
describe('metin yardımcıları', () => {
  it('şirket adı anahtarı', () => expect(companyNameKey('ABC İnşaat Taahhüt Ltd. Şti.')).toBe(companyNameKey('Abc insaat taahhut LTD STI')))
  it('telefon anahtarı', () => {
    expect(phoneKey('0 (532) 111 22 33')).toBe('905321112233')
    expect(phoneKey('+90 262 111 22 33')).toBe('902621112233')
    expect(phoneKey('123')).toBe('')
  })
  it('e-posta anahtarı', () => expect(emailKey('mailto:Info@Ornek.COM.tr?subject=x')).toBe('info@ornek.com.tr'))
  it('resmî site ayrımı', () => {
    expect(isOfficialWebsite('https://www.instagram.com/ornek')).toBe(false)
    expect(isOfficialWebsite('https://ornek.com.tr')).toBe(true)
  })
  it('güvenli klasör adı', () => {
    expect(safeFolderName('A/B:C*?')).toBe('A B C')
    expect(safeFolderName('CON')).toBe('_CON')
  })
  it('Türkçe katlama', () => expect(fold('İLETİŞİM Şirket')).toBe('iletisim sirket'))
  it('SSRF: yerel adresler reddedilir', () => {
    expect(isSafeExternalUrl('http://192.168.1.1/')).toBe(false)
    expect(isSafeExternalUrl('http://localhost:3000')).toBe(false)
    expect(isSafeExternalUrl('file:///C:/x')).toBe(false)
    expect(isSafeExternalUrl('https://ornek.com.tr')).toBe(true)
  })
  it('robots.txt', () => {
    const r = parseRobots('User-agent: *\nDisallow: /admin\nAllow: /admin/public', 'UcaMedyaAI')
    expect(isPathAllowed(r, '/admin/x')).toBe(false)
    expect(isPathAllowed(r, '/admin/public/x')).toBe(true)
    expect(isPathAllowed(r, '/')).toBe(true)
  })
  it('CSV içe aktarma (noktalı virgül, Türkçe başlıklar)', () => {
    const hits = csvToHits('\uFEFFFirma Adı;İl;Web Sitesi;Telefon;E-posta\n"Örnek; İnşaat";Kocaeli;ornek.com.tr;0262 111 22 33;info@ornek.com.tr\n')
    expect(hits[0]).toMatchObject({ name: 'Örnek; İnşaat', city: 'Kocaeli', website: 'https://ornek.com.tr', email: 'info@ornek.com.tr' })
  })
  it('arama sorguları', () => {
    const q = buildQueries(['İnşaat'], [{ city: 'Kocaeli' }, { city: 'Sakarya', district: 'Serdivan' }], [], 10)
    expect(q).toContain('inşaat firması Kocaeli')
    expect(q).toContain('inşaat firması Serdivan Sakarya')
  })
})

describe('teklif hesabı', () => {
  it('yüzde indirim KDV öncesi uygulanır', () => {
    expect(computeTotals([{ quantity: 1, unitPrice: 50000, vatRate: 20 }], 'percent', 10, false)).toEqual({ subtotal: 45000, discount: 5000, vatTotal: 9000, total: 54000 })
  })
  it('KDV dahil fiyat', () => {
    const t = computeTotals([{ quantity: 2, unitPrice: 1200, vatRate: 20 }], 'none', 0, true)
    expect(t.total).toBe(2400)
    expect(t.vatTotal).toBe(400)
  })
})

// ---------- Veritabanı ve CRM ----------
describe('veritabanı ve müşteri havuzu', () => {
  it('migration tüm tabloları oluşturur ve tohumlar', () => {
    const tables = db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table'").map((t) => t.name)
    for (const t of ['companies', 'company_contacts', 'research_projects', 'research_results', 'website_analyses', 'analysis_findings', 'screenshots', 'outreach_drafts', 'outreach_permissions', 'outreach_messages', 'communication_events', 'email_accounts', 'whatsapp_accounts', 'offers', 'offer_items', 'tasks', 'automation_runs', 'integrations', 'activity_logs', 'app_settings']) expect(tables).toContain(t)
    expect(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM stages')!.n).toBe(17)
    expect(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM services')!.n).toBe(12)
    expect(db.migrate()).toBe(db.latestVersion())
  })

  it('tekrar kontrolü: alan adı, telefon ve ad+şehir', () => {
    const cs = new CompanyService(db, new FileStore(db, () => join(dir, 'data')))
    const id = cs.create({ name: 'Örnek İnşaat Ltd. Şti.', city: 'Kocaeli', website: 'https://www.ornek.com.tr/', phone: '0262 111 22 33', source: 'manual' })
    expect(cs.findDuplicate({ name: 'Başka', website: 'http://ornek.com.tr/iletisim' })?.id).toBe(id)
    expect(cs.findDuplicate({ name: 'Başka', phone: '+90 262 111 2233' })?.id).toBe(id)
    expect(cs.findDuplicate({ name: 'ÖRNEK İNŞAAT', city: 'Kocaeli' })?.id).toBe(id)
    expect(cs.findDuplicate({ name: 'Örnek İnşaat', city: 'Bursa' })).toBeNull()
  })

  it('birleştirme ilişkili kayıtları taşır; ret listesi silmeden sonra da korunur', () => {
    const cs = new CompanyService(db, new FileStore(db, () => join(dir, 'data')))
    const a = cs.create({ name: 'A Firma', city: 'İzmir', email: 'info@a.com', source: 'manual' })
    const b = cs.create({ name: 'A Firma Yapı', city: 'İzmir', phone: '05321112233', source: 'manual' })
    cs.addNote(b, 'not')
    cs.merge(a, b)
    expect(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM notes WHERE company_id = ?', a)!.n).toBe(1)
    expect(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM company_contacts WHERE company_id = ?', a)!.n).toBe(2)
    cs.suppressCompany(a, 'test', 'user')
    expect(cs.isSuppressed(a)).toBe(true)
    cs.hardDelete(a)
    expect(cs.isRecipientSuppressed('email', 'info@a.com')).toBe(true)
  })

  it('teklifi olan şirket kalıcı silinemez', () => {
    const cs = new CompanyService(db, new FileStore(db, () => join(dir, 'data')))
    const a = cs.create({ name: 'Teklifli', source: 'manual' })
    db.run("INSERT INTO offers(number, company_id, title) VALUES ('UCA-1', ?, 't')", a)
    expect(() => cs.hardDelete(a)).toThrow(/teklif/)
  })

  it('sırlar şifreli saklanır ve düz metin yazılmaz', () => {
    const ss = new SecretStore(db, fakeCipher)
    ss.set('anthropic_key', 'sk-ant-gizli')
    const raw = db.get<{ value: string }>("SELECT value FROM app_settings WHERE key = 'secret:anthropic_key'")!.value
    expect(raw).not.toContain('sk-ant-gizli')
    expect(ss.get('anthropic_key')).toBe('sk-ant-gizli')
    expect(ss.status().anthropic_key).toBe(true)
  })

  it('ayarlar varsayılanlarla birleştirilir', () => {
    const st = new SettingsService(db)
    st.update({ outreach: { ...st.get().outreach, testMode: false } })
    expect(new SettingsService(db).get().outreach.testMode).toBe(false)
    expect(new SettingsService(db).get().analysis.concurrency).toBe(2)
  })

  it('yedek tutarlı alınır, doğrulanır; bozuk dosya reddedilir', () => {
    const bs = new BackupService(db, () => join(dir, 'yedek'))
    const r = bs.create('manual')
    expect(verifyBackupFile(r.file, db.latestVersion()).ok).toBe(true)
    expect(verifyBackupFile(join(dir, 'yok.sqlite')).ok).toBe(false)
  })
})

// ---------- Görev motoru ----------
describe('görev motoru', () => {
  it('duraklat / devam / iptal ve yarıda kalan görev kurtarma', async () => {
    const events: string[] = []
    const eng = new JobEngine(db, () => 1, (e) => events.push(e.status))
    let steps = 0
    eng.register('t', async (ctx) => {
      for (let i = 0; i < 5; i++) {
        await ctx.checkpoint()
        steps++
        ctx.progress(i + 1, 5)
        await new Promise((r) => setTimeout(r, 30))
      }
      return { steps }
    })
    const id = eng.enqueue('t', 'test', {})
    await new Promise((r) => setTimeout(r, 50))
    eng.pause(id)
    const at = steps
    await new Promise((r) => setTimeout(r, 150))
    expect(steps).toBeLessThanOrEqual(at + 1)
    eng.resume(id)
    await new Promise((r) => setTimeout(r, 400))
    expect(db.get<{ status: string }>('SELECT status FROM automation_runs WHERE id = ?', id)!.status).toBe('completed')

    const id2 = eng.enqueue('t', 'iptal', {})
    await new Promise((r) => setTimeout(r, 40))
    eng.cancel(id2)
    await new Promise((r) => setTimeout(r, 100))
    expect(db.get<{ status: string }>('SELECT status FROM automation_runs WHERE id = ?', id2)!.status).toBe('cancelled')

    db.run("INSERT INTO automation_runs(type, title, status) VALUES ('t', 'yarım', 'running')")
    expect(eng.recoverInterrupted()).toBe(1)
    expect(db.get<{ n: number }>("SELECT COUNT(*) AS n FROM automation_runs WHERE status = 'interrupted'")!.n).toBe(1)
  })

  it('başarısız görev başarılı raporlanmaz', async () => {
    const eng = new JobEngine(db, () => 1, () => undefined)
    eng.register('x', async () => {
      throw new Error('API kotası doldu')
    })
    const id = eng.enqueue('x', 'hata', {})
    await new Promise((r) => setTimeout(r, 80))
    const r = db.get<{ status: string; error: string }>('SELECT status, error FROM automation_runs WHERE id = ?', id)!
    expect(r.status).toBe('failed')
    expect(r.error).toContain('kota')
  })
})

// ---------- Tarayıcı otomasyonu ayrıştırıcıları ----------
import { parseLocalRow, parseOrganic } from '../src/main/automation/google-browser'
import { headerMatchesPhone } from '../src/main/automation/whatsapp-web'
import { extractContacts } from '../src/main/research/contact-crawler'

describe('Google sonuç ayrıştırma', () => {
  it('yerel işletme satırından telefon, ilçe/il, kategori ve puan çıkarır', () => {
    const r = parseLocalRow({ name: 'UG İNŞAAT', web: null, lines: ['UG İNŞAAT', '4,7(12)', '· İnşaat Şirketi', '10 yıldan daha uzun süre önce açıldı · İzmit/Kocaeli', 'Açık · Kapanış saati: 21:00 · 0541 300 14 41'] })
    expect(r).toMatchObject({ name: 'UG İNŞAAT', phone: '0541 300 14 41', district: 'İzmit', city: 'Kocaeli', rating: 4.7, ratingCount: 12, category: 'İnşaat Şirketi', businessStatus: 'OPERATIONAL' })
    const r2 = parseLocalRow({ name: 'Sefa Töle', web: null, lines: ['Sefa Töle', '4,9(87)', '35 yıldan daha uzun süre önce açıldı · İzmit/Kocaeli', 'Kapalı ⋅ Açılış zamanı: Pzt 09:00 · (0262) 255 56 76'] })
    expect(r2.phone).toBe('(0262) 255 56 76')
  })
  it('organik sonuçta rehber/belge sitelerini eler, genel başlıkta alan adını kullanır', () => {
    expect(parseOrganic({ title: 'Kocaeli Inşaat Firmaları', cite: 'https://www.scribd.com › document' })).toBeNull()
    expect(parseOrganic({ title: 'En İyi 40 Kocaeli Müteahhit Firma', cite: 'https://www.ornekrehber.com' })).toBeNull()
    expect(parseOrganic({ title: 'Kocaeli İnşaat Firması Villa Konut Yapımı', cite: 'https://goksallarinsaat.com' })).toEqual({ name: 'goksallarinsaat.com', website: 'https://goksallarinsaat.com' })
    expect(parseOrganic({ title: 'Türköz İnşaat | KOCAELİ', cite: 'https://www.turkozinsaat.com.tr › anasayfa' })).toEqual({ name: 'Türköz İnşaat', website: 'https://www.turkozinsaat.com.tr' })
    expect(parseOrganic({ title: 'X', cite: 'https://yandex.com.tr › Yandex Maps' })).toBeNull()
  })
})

describe('WhatsApp alıcı doğrulama', () => {
  it('sohbet başlığındaki numara alıcıyla eşleşmeli', () => {
    expect(headerMatchesPhone('+90 532 111 22 33 çevrimiçi', '905321112233')).toBe(true)
    expect(headerMatchesPhone('+90 532 111 22 34', '905321112233')).toBe(false)
    expect(headerMatchesPhone('Ahmet Yılmaz', '905321112233')).toBe(false)
  })
})

describe('iletişim bilgisi çıkarma', () => {
  it('kurumsal e-posta, tel: bağlantısı, metindeki telefon ve wa.me', () => {
    const html = '<a href="mailto:info@ornek.com.tr">x</a><a href="tel:+902621112233">Ara</a><p>Tel: 0532 111 22 33</p><a href="https://wa.me/905321112233">WA</a><img src="logo@2x.png"><script>var a="spam@x.com"</script>'
    const c = extractContacts(html, 'https://ornek.com.tr/iletisim')
    expect(c.map((x) => `${x.type}:${x.value}`).sort()).toEqual(['email:info@ornek.com.tr', 'phone:902621112233', 'phone:905321112233', 'whatsapp:905321112233'])
  })
})

import { cleanBusinessName } from '../src/shared/text'
describe('işletme adı temizleme', () => {
  it('emoji ve süs karakterlerini kaldırır', () => {
    expect(cleanBusinessName('🛠️ Maker Mimarlık Renovasyon ☀️ İç Mimari & Proje')).toBe('Maker Mimarlık Renovasyon İç Mimari & Proje')
    expect(cleanBusinessName('★ UG İNŞAAT ★')).toBe('UG İNŞAAT')
  })
})

describe('alıcı seçimi ve kurumsal şablon', () => {
  const row = (o: Partial<ContactRow>): ContactRow => ({ type: 'phone', value: '', value_key: '', kind: 'corporate', source_type: 'provider', source_url: null, label: null, ...o })
  it('WhatsApp: sitedeki wa.me > iletişim sayfasındaki cep > Google cep > sabit hat', () => {
    const rows = [
      row({ value_key: '902166068896', value: '0216 606 88 96' }),
      row({ value_key: '905321112233', value: '0532 111 22 33' }),
      row({ value_key: '905339998877', source_type: 'website', source_url: 'https://x.com/iletisim' }),
      row({ type: 'whatsapp', value_key: '905441234567', source_type: 'website', source_url: 'https://x.com/' })
    ]
    expect(rankContacts(rows, 'whatsapp', 'x.com').map((r) => r.value_key)).toEqual(['905441234567', '905339998877', '905321112233', '902166068896'])
  })
  it('WhatsApp: e-postalar elenir, "WhatsApp yok" işaretli numara sona düşer', () => {
    const rows = [row({ type: 'email', value_key: 'info@x.com' }), row({ value_key: '905321112233', label: 'WhatsApp yok' }), row({ value_key: '902121234567' })]
    expect(rankContacts(rows, 'whatsapp', null).map((r) => r.value_key)).toEqual(['902121234567', '905321112233'])
  })
  it('E-posta: şirketin kendi alan adındaki adres önce, ücretsiz adres sonra', () => {
    const rows = [row({ type: 'email', value_key: 'firma@gmail.com', kind: 'personal' }), row({ type: 'email', value_key: 'info@x.com.tr', source_type: 'website', source_url: 'https://x.com.tr/iletisim' }), row({ value_key: '905321112233' })]
    expect(rankContacts(rows, 'email', 'x.com.tr').map((r) => r.value_key)).toEqual(['info@x.com.tr', 'firma@gmail.com'])
  })
  it('şablon: kısa şirket adı, sektör ifadesi ve büyük harfli cümle başı', () => {
    expect(shortCompanyName('RAMADİ YAPI İNŞAAT | Gebze Fabrika Tadilatı')).toBe('RAMADİ YAPI İNŞAAT')
    const v = { company: 'RAMADİ YAPI İNŞAAT | Gebze', sector: 'İnşaat', city: null, website: null, findings: [], brandName: 'Uca Medya', brandWeb: 'ucamedya.com.tr' }
    const body = renderTemplate(DEFAULT_TEMPLATES.emailBody, v)
    expect(body).toContain('İnşaat sektöründeki markaların')
    expect(body).toContain('UCA Radar')
    expect(renderTemplate(DEFAULT_TEMPLATES.emailSubject, v)).toBe('RAMADİ YAPI İNŞAAT için ücretsiz UCA Radar dijital değerlendirmesi')
    expect(renderTemplate(DEFAULT_TEMPLATES.whatsappBody, { ...v, sector: null })).toMatch(/^Merhaba,\nFarklı sektörlerdeki/)
  })
  it('şablonlu templateDraft imza ve ret satırını ekler', () => {
    const out = templateDraft({ company: { name: 'Acme | Ana Sayfa', sector: null, city: null, website: null, websiteStatus: 'ok' }, findings: [], services: [], brand: { name: 'Uca Medya', website: 'ucamedya.com.tr', email: 'info@ucamedya.com.tr', phone: '', signature: 'Uca Medya Ekibi' } as any, channel: 'email', tone: 'professional', optOutLine: 'İstemiyorsanız RET yazın.', templates: DEFAULT_TEMPLATES })
    expect(out.subject).toBe('Acme için ücretsiz UCA Radar dijital değerlendirmesi')
    expect(out.body).toContain('RET yazın')
  })
})

describe('ücretsiz e-posta sınıflandırması', () => {
  it('sitede yayımlanan gmail kurumsal, CSV ile gelen gmail kişisel sayılır', () => {
    const dir = mkdtempSync(join(tmpdir(), 'uca-kind-'))
    const db = new Db(join(dir, 't.db'))
    db.migrate()
    const cs = new CompanyService(db, new FileStore(db, () => join(dir, 'data')))
    const id = cs.create({ name: 'EmlaXo Türkiye - Kocaeli Emlak Ofisi', source: 'manual' } as any)
    cs.addContact(id, { type: 'email', value: 'emlaxogayrimenkul@gmail.com', sourceType: 'website', sourceUrl: 'https://www.emlaxo.com/iletisim' })
    cs.addContact(id, { type: 'email', value: 'biri@hotmail.com', sourceType: 'import' })
    const kinds = Object.fromEntries(db.all<{ value_key: string; kind: string }>('SELECT value_key, kind FROM company_contacts WHERE company_id = ?', id).map((r) => [r.value_key, r.kind]))
    expect(kinds['emlaxogayrimenkul@gmail.com']).toBe('corporate')
    expect(kinds['biri@hotmail.com']).toBe('personal')
    ;(db as any).close?.()
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('0.3 CRM: eşleşme onayı, aşama geçmişi, migration yedeği', () => {
  let dir: string
  let db: Db
  let cs: CompanyService
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'uca-crm-'))
    db = new Db(join(dir, 'crm.sqlite'))
    db.migrate()
    cs = new CompanyService(db, new FileStore(db, () => join(dir, 'data')))
  })
  afterEach(() => {
    ;(db.raw as any).close?.()
    rmSync(dir, { recursive: true, force: true })
  })
  it('alan adı eşleşmesi kesin, yalnızca kısa ad benzerliği onay ister', () => {
    const a = cs.create({ name: 'EmlaXo Türkiye', city: 'Kocaeli', website: 'https://www.emlaxo.com', source: 'manual' } as any)
    expect(cs.findDuplicate({ name: 'Başka Ad', website: 'https://emlaxo.com/tr' })).toMatchObject({ id: a, certain: true })
    expect(cs.findDuplicate({ name: 'EmlaXo Türkiye - Kocaeli Emlak Ofisi', city: 'Kocaeli' })).toMatchObject({ id: a, certain: false })
    expect(cs.findDuplicate({ name: 'EmlaXo Türkiye', city: 'Kocaeli' })).toMatchObject({ id: a, certain: true })
    expect(cs.findDuplicate({ name: 'Tamamen Farklı Firma', city: 'Kocaeli' })).toBeNull()
  })
  it('onay kuyruğu: ayrı bırakılan çift tekrar önerilmez, birleştirme kuyruğu kapatır', () => {
    const a = cs.create({ name: 'Yıldız Yapı', source: 'manual' } as any)
    const b = cs.create({ name: 'Yıldız Yapı - Gebze', source: 'manual' } as any)
    const c = cs.create({ name: 'Yıldız Yapı İnşaat', source: 'manual' } as any)
    cs.addMatchCandidate(b, a, 'benzer şirket adı')
    cs.addMatchCandidate(c, a, 'benzer şirket adı')
    expect(cs.pendingMatchCount()).toBe(2)
    cs.keepSeparate(a, b)
    cs.merge(a, c)
    expect(cs.pendingMatchCount()).toBe(0)
    expect(cs.duplicates().some((d) => [d.a.id, d.b.id].includes(b))).toBe(false)
  })
  it('aşama değişikliği geçmişe yazılır (SQL ile değişse bile)', () => {
    const a = cs.create({ name: 'Acme Ltd', source: 'manual' } as any)
    cs.update(a, { stage_key: 'review' })
    db.run("UPDATE companies SET stage_key = 'replied' WHERE id = ?", a)
    const h = db.all<{ from_key: string; to_key: string }>('SELECT from_key, to_key FROM stage_history WHERE company_id = ? ORDER BY id', a)
    expect(h.map((x) => x.to_key)).toEqual(['review', 'replied'])
  })
  it('eski şemadan yükseltme: önce yedek alınır, "Yanıt geldi" doğru sıraya eklenir', async () => {
    const { MIGRATIONS } = await import('../src/main/database/migrations')
    const { DEFAULT_STAGES } = await import('../src/shared/constants')
    const file = join(dir, 'eski.sqlite')
    const old = new Db(file)
    old.raw.exec(MIGRATIONS[0].sql)
    old.raw.exec(MIGRATIONS[1].sql)
    old.raw.exec('PRAGMA user_version = 2')
    DEFAULT_STAGES.filter((s) => s.key !== 'replied').forEach((s, i) => old.run('INSERT INTO stages(key,label,color,position,terminal,system) VALUES (?,?,?,?,?,1)', s.key, s.label, s.color, i, !!s.terminal))
    expect(old.migrate()).toBe(old.latestVersion())
    expect(old.lastPreMigrationBackup).toBeTruthy()
    expect(verifyBackupFile(old.lastPreMigrationBackup!).version).toBe(2)
    const order = old.all<{ key: string }>('SELECT key FROM stages ORDER BY position').map((r) => r.key)
    expect(order.indexOf('replied')).toBe(order.indexOf('waiting_reply') + 1)
    expect(order.length).toBe(17)
    ;(old.raw as any).close?.()
  })
})

describe('0.3 web sitesi talepleri (eşleştirme ve içe aktarma)', () => {
  let dir: string
  let db: Db
  let cs: CompanyService
  let leads: any
  beforeEach(async () => {
    const { WebsiteLeads } = await import('../src/main/integrations/website-leads')
    dir = mkdtempSync(join(tmpdir(), 'uca-leads-'))
    db = new Db(join(dir, 'l.sqlite'))
    db.migrate()
    cs = new CompanyService(db, new FileStore(db, () => join(dir, 'data')))
    leads = new WebsiteLeads(db, cs, new SettingsService(db), { has: () => true, get: () => 'k', set: () => undefined } as any)
  })
  afterEach(() => {
    ;(db.raw as any).close?.()
    rmSync(dir, { recursive: true, force: true })
  })
  const item = (o: Record<string, unknown> = {}) => ({ id: 1, kind: 'quote', service: 'web_design', service_label: 'Web tasarımı', answers: { 'Kaç sayfa düşünüyorsunuz?': '6–10' }, person_name: 'Ayşe Yılmaz', company_name: 'EmlaXo Türkiye', email: 'ayse@emlaxo.com', phone: '0532 111 22 33', website: 'https://www.emlaxo.com', message: 'Site istiyoruz', contact_pref: 'whatsapp', page_url: 'https://ucamedya.com.tr/teklif/', consent: { kvkk: true, marketing: false, at: '2026-10-25T10:00:00Z' }, ...o })

  it('mevcut şirketle alan adından eşleşir, mükerrer kart açılmaz; aynı talep ikinci kez alınmaz', () => {
    const a = cs.create({ name: 'EmlaXo Türkiye - Kocaeli Emlak Ofisi', website: 'https://emlaxo.com', source: 'google_browser' } as any)
    const r = leads.importItem('https://ucamedya.com.tr/', item())
    expect(r).toMatchObject({ companyId: a, created: false, duplicate: false })
    expect(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM companies')!.n).toBe(1)
    expect(leads.importItem('https://ucamedya.com.tr/', item()).duplicate).toBe(true)
    expect(db.get<{ n: number }>("SELECT COUNT(*) AS n FROM tasks WHERE company_id = ? AND kind = 'inbound'", a)!.n).toBe(1)
    const perm = db.all<{ channel: string; status: string }>('SELECT channel, status FROM outreach_permissions WHERE company_id = ? ORDER BY channel', a)
    expect(perm).toEqual([{ channel: 'email', status: 'opt_in' }, { channel: 'whatsapp', status: 'opt_in' }])
    expect(db.get<{ type: string; source_type: string }>("SELECT type, source_type FROM company_contacts WHERE company_id = ? AND value_key = '905321112233'", a)).toMatchObject({ type: 'whatsapp', source_type: 'form' })
  })
  it('eşleşme yoksa yeni kart "İnceleme bekliyor" aşamasında açılır; yalnızca ad benzerliği onaya düşer', () => {
    const b = cs.create({ name: 'Mavi Yapı', source: 'manual' } as any)
    const r = leads.importItem('https://ucamedya.com.tr/', item({ id: 2, company_name: 'Mavi Yapı - Gebze Şubesi', email: 'info@maviyapi.com', phone: '', website: '' }))
    expect(r.created).toBe(true)
    expect(r.companyId).not.toBe(b)
    expect(db.get<{ stage_key: string; source: string }>('SELECT stage_key, source FROM companies WHERE id = ?', r.companyId)).toMatchObject({ stage_key: 'review', source: 'website' })
    expect(cs.pendingMatchCount()).toBe(1)
  })
  it('temanın Gelen Mesajlar kaydı: ayrı kimlikle, iletişim formu olarak, yalnızca talebe yanıt izniyle', () => {
    const r = leads.importItem('https://ucamedya.com.tr/', { id: 1, source: 'theme', kind: 'contact', service_label: 'Web Tasarım, SEO', person_name: 'Zeynep Kaya', email: 'zeynep@kayamimarlik.com', phone: '0533 444 55 66', message: 'Yeni site', consent: { kvkk: false, form: 'theme' } })
    expect(r.created).toBe(true)
    // eklentinin kendi formundaki #1 ile çakışmaz
    expect(leads.importItem('https://ucamedya.com.tr/', item({ id: 1 })).duplicate).toBe(false)
    const row = db.get<{ kind: string; external_id: string }>("SELECT kind, external_id FROM inbound_requests WHERE external_id LIKE 'theme-%'")
    expect(row).toEqual({ kind: 'contact', external_id: 'theme-1' })
    expect(db.get<{ status: string; purpose: string }>("SELECT status, purpose FROM outreach_permissions WHERE company_id = ? AND channel = 'email'", r.companyId)).toMatchObject({ status: 'opt_in', purpose: expect.stringMatching(/Yalnızca talebe yanıt/) })
  })
  it('ret listesindeki şirketin izni opt_in\'e çevrilmez', () => {
    const a = cs.create({ name: 'EmlaXo', website: 'https://emlaxo.com', source: 'manual' } as any)
    db.run("INSERT INTO outreach_permissions(company_id, channel, status) VALUES (?, 'email', 'opted_out')", a)
    leads.importItem('https://ucamedya.com.tr/', item({ id: 3 }))
    expect(db.get<{ status: string }>("SELECT status FROM outreach_permissions WHERE company_id = ? AND channel = 'email'", a)!.status).toBe('opted_out')
  })
})

describe('0.3 analizden teklif taslağı', () => {
  it('önerilen hizmetler katalogdan gelir, fiyatsız kalemle "gönderildi" yapılamaz', async () => {
    const { OfferService } = await import('../src/main/services/offers')
    const dir = mkdtempSync(join(tmpdir(), 'uca-offer-'))
    const db = new Db(join(dir, 'o.sqlite'))
    db.migrate()
    const files = new FileStore(db, () => join(dir, 'data'))
    const cs = new CompanyService(db, files)
    const offers = new OfferService(db, files, cs, new SettingsService(db), () => undefined)
    const a = cs.create({ name: 'EmlaXo Türkiye', source: 'manual' } as any)
    expect(() => offers.draftFromAnalysis(a)).toThrow(/önerilen bir hizmet yok/)
    db.run(`UPDATE companies SET potential_services = '["redesign","technical_seo"]', analysis_summary = 'Site mobilde zor okunuyor.' WHERE id = ?`, a)
    db.run("UPDATE services SET price = 40000 WHERE key = 'redesign'")
    const oid = offers.draftFromAnalysis(a)
    const o: any = offers.get(oid)
    expect(o.items.map((i: any) => [i.name, i.unit_price])).toEqual([['Web sitesi yenileme', 40000], ['Teknik SEO', 0]])
    expect(o.status).toBe('draft')
    expect(o.origin).toBe('analysis')
    expect(o.delivery_estimate).toBeNull()
    expect(o.analysis_summary).toContain('mobilde')
    const items = o.items.map((i: any) => ({ name: i.name, quantity: i.quantity, unitPrice: i.unit_price, vatRate: i.vat_rate }))
    expect(() => offers.save({ id: oid, companyId: a, title: o.title, status: 'sent', items })).toThrow(/Fiyatı girilmemiş/)
    items[1].unitPrice = 15000
    expect(offers.save({ id: oid, companyId: a, title: o.title, status: 'sent', items })).toBe(oid)
    expect(db.get<{ stage_key: string }>('SELECT stage_key FROM companies WHERE id = ?', a)!.stage_key).toBe('offer_sent')
    ;(db.raw as any).close?.()
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('0.3 satış analitiği', () => {
  it('SQL geçerli; verisi olmayan metrik 0 değil "veri yok" (null) döner', async () => {
    const { StatsService } = await import('../src/main/services/stats')
    const dir = mkdtempSync(join(tmpdir(), 'uca-stats-'))
    const db = new Db(join(dir, 's.sqlite'))
    db.migrate()
    const st = new (StatsService as any)(db)
    const r = st.salesMetrics()
    const by = Object.fromEntries(r.metrics.map((x: any) => [x.key, x.value]))
    expect(by.found).toBe(0)
    expect(by.verified).toBeNull()
    expect(by.replies).toBeNull()
    expect(by.web_leads).toBeNull()
    expect(r.revenue.estimated).toBeNull()
    expect(st.salesMetrics(30).metrics.length).toBe(r.metrics.length)
    ;(db.raw as any).close?.()
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('0.3 tasarım konsepti', () => {
  it('sitenin başlıklarını kart yapar, bilinmeyeni uydurmaz, mobil bulguları öneriye çevirir', async () => {
    const { buildConcept } = await import('../src/main/concepts/concept')
    const { conceptHtml } = await import('../src/main/concepts/concept-template')
    const d = buildConcept({
      company: { name: 'RAMADİ YAPI İNŞAAT | Gebze Fabrika Tadilatı', sector: 'İnşaat', city: 'Kocaeli', website: 'https://ramadi.com.tr' },
      title: 'Anasayfa', metaDescription: null, h1: [], headings: [{ level: 2, text: 'Fabrika Tadilatı' }, { level: 2, text: 'Kentsel Dönüşüm' }, { level: 2, text: 'İletişim' }, { level: 3, text: 'Çelik Konstrüksiyon' }],
      fontFamilies: 5, textColors: 11, hasViewport: false, hamburger: false,
      contacts: { phone: '0262 000 00 00', whatsapp: null, email: 'info@ramadi.com.tr' },
      findings: [{ code: 'mobile_no_viewport', title: 'Mobil ölçekleme etiketi eksik', severity: 'high', recommendation: 'viewport eklenmeli', category: 'mobile' }]
    })
    expect(d.brandName).toBe('RAMADİ YAPI İNŞAAT')
    expect(d.services.map((s) => s.title)).toEqual(['Fabrika Tadilatı', 'Kentsel Dönüşüm', 'Çelik Konstrüksiyon'])
    expect(d.services.every((s) => s.fromSite)).toBe(true)
    expect(d.hero.sublineFromSite).toBe(false)
    expect(d.hero.subline).toMatch(/^\[/)
    expect(d.ctas.find((c) => c.label.startsWith('WhatsApp'))!.available).toBe(false)
    expect(d.mobile[0]).toMatch(/viewport/)
    expect(d.palette.primary).toBe('#1F3A5F')
    expect(d.hero.headlines[1]).toBe("Kocaeli'de inşaat için doğru adres: RAMADİ YAPI İNŞAAT")
    const { locative } = await import('../src/main/concepts/concept')
    expect(['İstanbul', 'İzmir', 'Bursa', 'Tokat', 'Muş', 'Ankara', 'Rize'].map(locative)).toEqual(["İstanbul'da", "İzmir'de", "Bursa'da", "Tokat'ta", "Muş'ta", "Ankara'da", "Rize'de"])
    const other = buildConcept({ company: { name: 'UcaMedya', sector: 'Diğer', city: 'İstanbul', website: null }, title: null, metaDescription: null, h1: [], headings: [{ level: 2, text: 'Hacıoğlu' }, { level: 2, text: 'Kadıköy Belediyesi' }, { level: 2, text: 'Markalarla birlikte ürettiklerimiz.' }], fontFamilies: null, textColors: null, hasViewport: true, hamburger: true, contacts: { phone: null, whatsapp: null, email: null }, findings: [] })
    expect(other.hero.headlines[1]).toBe("İstanbul'da doğru adres: UcaMedya")
    expect(other.services.every((x) => !x.fromSite)).toBe(true)
    expect(JSON.stringify(d)).not.toMatch(/\d+ yıl|ödül|müşteri sayısı/i)
    const html = conceptHtml({ name: 'Uca Medya', website: 'ucamedya.com.tr', email: '', phone: '', address: '', logoDataUri: null, fontCss: '' } as any, d, { company: { name: 'RAMADİ', website: null }, date: '25 Ekim 2026', before: { desktop: null, mobile: null } })
    expect(html).toContain('Tasarım İyileştirme Konsepti')
    expect(html).not.toContain('<script')
  })
})

describe('0.3 asistan', () => {
  it('soruları kayıtlardan yanıtlar; gönderme/silme yapmaz; görev oluşturma tekrarsız', async () => {
    const { Assistant } = await import('../src/main/assistant/assistant')
    const dir = mkdtempSync(join(tmpdir(), 'uca-asst-'))
    const db = new Db(join(dir, 'a.sqlite'))
    db.migrate()
    const cs = new CompanyService(db, new FileStore(db, () => join(dir, 'data')))
    const a = cs.create({ name: 'EmlaXo Türkiye', city: 'Kocaeli', source: 'google_browser' } as any)
    const b = cs.create({ name: 'Mavi Yapı', source: 'google_browser' } as any)
    db.run(`UPDATE companies SET potential_services = '["redesign","technical_seo"]', opportunity_score = 78, stage_key = 'review' WHERE id = ?`, a)
    db.run(`UPDATE companies SET potential_services = '["technical_seo"]', opportunity_score = 50, stage_key = 'meeting' WHERE id = ?`, b)
    db.run("INSERT INTO tasks(title, company_id, due_at, status) VALUES ('Eski görev', ?, '2020-01-01T09:00:00Z', 'open')", a)
    const as = new Assistant(db, () => null)
    const ids = async (q: string) => ((await as.ask(q)).items ?? []).map((i) => i.companyId)
    expect(await ids('Bu hafta web tasarım hizmetiyle en çok eşleşen şirketleri göster')).toEqual([a])
    expect(await ids('SEO için uygun şirketler hangileri')).toEqual([a, b])
    expect(await ids('İncelenmemiş müşteri kayıtlarını listele')).toContain(a)
    const offer = await as.ask('Teklif hazırlamam gereken müşterileri göster')
    expect(offer.items?.map((i) => i.companyId)).toEqual([b])
    expect(offer.actions?.[0]).toMatchObject({ kind: 'create_tasks', companyIds: [b] })
    expect((await as.ask('Bugün neler yapmalıyım?')).text).toMatch(/1 geciken/)
    expect((await as.ask('Mavi Yapı firmasına mesaj gönder')).text).toMatch(/yapmıyorum/)
    expect((await as.ask('EmlaXo analiz raporunu aç')).text).toMatch(/tamamlanmış bir analiz yok/)
    expect((await as.ask('kuantum fiziği nedir')).source).toBe('help')
    expect(as.createTasks([b], 'Teklif hazırla')).toBe(1)
    expect(as.createTasks([b], 'Teklif hazırla')).toBe(0)
    expect(as.summary().items?.length).toBeGreaterThan(0)
    ;(db.raw as any).close?.()
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('mesaj görseli', () => {
  it('yalnızca PNG/JPG ve 5 MB altı; kanala göre açılıp kapanır', async () => {
    const { imageFor, validImage, imageDataUri } = await import('../src/main/outreach/message-image')
    const { writeFileSync } = await import('node:fs')
    const dir = mkdtempSync(join(tmpdir(), 'uca-img-'))
    const png = join(dir, 'a.png')
    writeFileSync(png, Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201a0d5c0a90000000049454e44ae426082', 'hex'))
    const gif = join(dir, 'a.gif')
    writeFileSync(gif, 'GIF89a')
    expect(validImage(png)).toBe(true)
    expect(validImage(gif)).toBe(false)
    expect(validImage(join(dir, 'yok.png'))).toBe(false)
    expect(imageFor('email', { path: png, email: true, whatsapp: false })).toBe(png)
    expect(imageFor('whatsapp', { path: png, email: true, whatsapp: false })).toBeNull()
    expect(imageFor('email', { path: '', email: true, whatsapp: true })).toBeNull()
    expect(imageDataUri(png)).toMatch(/^data:image\/png;base64,/)
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('ret satırını çıkarma', () => {
  it('yalnızca o satır silinir, metnin geri kalanı korunur', async () => {
    const { stripLine } = await import('../src/main/outreach/outreach-service')
    const line = 'Bu tür bilgilendirmeler almak istemiyorsanız bu mesaja "İSTEMİYORUM" yazarak yanıt vermeniz yeterlidir; kaydınız hemen listemizden çıkarılır.'
    const body = 'Merhaba,\nBenim düzenlediğim metin.\n\nİyi çalışmalar,\n\nUcaMedya\nhttps://ucamedya.com.tr/\n\n' + line
    expect(stripLine(body, line)).toBe('Merhaba,\nBenim düzenlediğim metin.\n\nİyi çalışmalar,\n\nUcaMedya\nhttps://ucamedya.com.tr/')
  })
})

describe('kuyruk: toplu ekleme, kuyruktan çıkarma, iptal sonrası yeniden ekleme, silme', () => {
  it('çalışır ve gönderilmiş/kuyruktaki taslak silinemez', async () => {
    const { OutreachService } = await import('../src/main/outreach/outreach-service')
    const dir = mkdtempSync(join(tmpdir(), 'uca-q-'))
    const db = new Db(join(dir, 'q.sqlite'))
    db.migrate()
    const files = new FileStore(db, () => join(dir, 'data'))
    const cs = new CompanyService(db, files)
    const settings = new SettingsService(db)
    settings.update({ outreach: { ...settings.get().outreach, emailChannel: 'smtp', testMode: true, testRecipientEmail: 'test@ucamedya.com.tr', includeOptOutLine: false } } as any)
    db.run("INSERT INTO email_accounts(label, provider, from_email, status) VALUES ('t', 'smtp', 'info@ucamedya.com.tr', 'ok')")
    const os = new OutreachService(db, cs, settings, { get: () => undefined, has: () => false } as any, files, () => null, () => undefined)
    const ids: number[] = []
    for (const [n, e] of [['Alfa Lojistik', 'info@alfa.com.tr'], ['Beta Lojistik', 'info@beta.com.tr'], ['Gama Lojistik', 'info@gama.com.tr']]) {
      const c = cs.create({ name: n, source: 'manual' } as any)
      cs.addContact(c, { type: 'email', value: e, sourceType: 'website' })
      ids.push((await os.createDraft(c, 'email', 'professional', false) as any).id)
    }
    os.setDraftStatus(ids, 'approved')
    expect(os.enqueue(ids).queued).toBe(3)
    expect(os.deleteDrafts(ids)).toEqual({ deleted: 0, skipped: 3 })
    const msgs = db.all<{ id: number }>("SELECT id FROM outreach_messages WHERE status = 'queued' ORDER BY id")
    expect(os.dequeue([msgs[0].id])).toBe(1)
    expect(db.get<{ status: string }>('SELECT status FROM outreach_drafts WHERE id = ?', ids[0])!.status).toBe('approved')
    os.cancelQueue('email')
    const again = os.enqueue(ids)
    expect(again.queued).toBe(3)
    expect(again.skipped).toEqual([])
    os.cancelQueue('email')
    expect(os.deleteDrafts([ids[2]])).toEqual({ deleted: 1, skipped: 0 })
    ;(db.raw as any).close?.()
    rmSync(dir, { recursive: true, force: true })
  })
})

import { isOk } from '../src/main/outreach/whatsapp-paste'
describe('WhatsApp yapıştırma sonucu', () => {
  it('OK satırını, arkasında PowerShell CLIXML olsa da tanır', () => {
    expect(isOk('OK')).toBe(true)
    expect(isOk('OK\r\n#< CLIXML\r\n<Objs Version="1.1.0.1"><Obj S="progress"/></Objs>')).toBe(true)
    expect(isOk('NOFOCUS')).toBe(false)
    expect(isOk('NOWINDOW')).toBe(false)
    expect(isOk('')).toBe(false)
  })
})
