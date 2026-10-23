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
    expect(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM stages')!.n).toBe(16)
    expect(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM services')!.n).toBe(12)
    expect(db.migrate()).toBe(1)
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
    expect(verifyBackupFile(r.file, 1).ok).toBe(true)
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
