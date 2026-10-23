// Web sitesi analiz motoru: siteyi masaüstü ve mobil görünümde açar, sayfa içi ölçümleri toplar,
// ekran görüntülerini kaydeder, site düzeyi kontrolleri (HTTPS, robots.txt, site haritası, bozuk
// bağlantılar) ve isteğe bağlı PageSpeed ölçümünü yapar, ardından kurallarla bulgu ve puan üretir.
// robots.txt'nin izin vermediği sayfalar ziyaret edilmez. Form doldurulmaz, tıklama yapılmaz.

import { join } from 'node:path'
import { statSync } from 'node:fs'
import type { BrowserContext, Page } from 'playwright-core'
import { acquireBrowser, releaseBrowser } from './browser'
import { COLLECT_SCRIPT } from './collect-script'
import { evaluate, findPageLinks, type PageData, type PsiResult, type SiteChecks } from './rules'
import { assertPublicHost } from '../http/url-safety'
import { USER_AGENT, type PoliteFetcher } from '../http/fetcher'
import type { PageSpeedClient } from '../integrations/pagespeed'
import type { FindingDraft, TestRecord, CategoryScore } from '@shared/types'
import type { FindingCategory } from '@shared/constants'
import { domainOf, emailKey, phoneKey } from '@shared/text'

export interface ShotRecord {
  key: string
  pageUrl: string
  pageKind: string
  viewport: 'desktop' | 'mobile'
  width: number
  height: number
  file: string
  bytes: number
  findingCode?: string
}

export interface ExtractedContact {
  type: 'email' | 'phone' | 'whatsapp' | 'social'
  value: string
  sourceUrl: string
}

export interface AnalysisOutput {
  status: 'done' | 'unreachable' | 'blocked' | 'failed'
  url: string
  finalUrl: string | null
  error?: string
  findings: FindingDraft[]
  scores: Record<FindingCategory, CategoryScore> | null
  overall: number | null
  tests: TestRecord[]
  shots: ShotRecord[]
  contacts: ExtractedContact[]
  metrics: Record<string, unknown>
  psi: PsiResult | null
  pages: { kind: string; url: string }[]
}

export interface AnalyzerOptions {
  dir: string
  maxPages: number
  respectRobots: boolean
  timeoutSec: number
  pagespeed: PageSpeedClient | null
  signal?: AbortSignal
  onStep?: (msg: string) => void
}

const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1 UcaMedyaAI/0.1'
const DESKTOP_UA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 ${USER_AGENT}`

export class SiteAnalyzer {
  constructor(private http: PoliteFetcher) {}

  private async robotsAllowed(url: string, respect: boolean) {
    if (!respect) return true
    return this.http.robots.isAllowed(url).catch(() => true)
  }

  private async open(ctx: BrowserContext, url: string, timeoutSec: number) {
    const page = await ctx.newPage()
    const consoleErrors: string[] = []
    const failed: { url: string; status: number }[] = []
    let mixed = 0
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200))
    })
    page.on('response', (r) => {
      if (r.status() >= 400 && r.request().resourceType() !== 'document') failed.push({ url: r.url(), status: r.status() })
    })
    page.on('request', (r) => {
      if (url.startsWith('https:') && r.url().startsWith('http:')) mixed++
    })
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutSec * 1000 })
    await page.waitForLoadState('load', { timeout: 15000 }).catch(() => undefined)
    await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => undefined)
    // Tembel yüklenen görselleri tetiklemek için sayfayı kademeli kaydırıp başa döner
    await page
      .evaluate(`(async () => { const h = Math.min(document.body.scrollHeight, 12000); for (let y = 0; y < h; y += 700) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 120)) } window.scrollTo(0, 0); await new Promise(r => setTimeout(r, 400)) })()`)
      .catch(() => undefined)
    return { page, resp, consoleErrors, failed, mixed: () => mixed }
  }

  private async shot(page: Page, opts: { dir: string; key: string; pageUrl: string; pageKind: string; viewport: 'desktop' | 'mobile'; maxHeight: number; clipTop?: number; findingCode?: string; full?: boolean }): Promise<ShotRecord | null> {
    try {
      const jpeg = !!opts.full && opts.maxHeight > 1200
      const file = join(opts.dir, 'screenshots', `${opts.key}.${jpeg ? 'jpg' : 'png'}`)
      const vp = page.viewportSize() ?? { width: 1440, height: 900 }
      const dims = (await page.evaluate('({ w: Math.max(document.documentElement.scrollWidth, window.innerWidth), h: Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0) })')) as { w: number; h: number }
      const top = Math.max(0, opts.clipTop ?? 0)
      const height = opts.full ? Math.min(dims.h - top, opts.maxHeight) : Math.min(vp.height, dims.h - top)
      const width = opts.viewport === 'mobile' ? Math.min(dims.w, vp.width * 2) : vp.width
      await page.screenshot({ path: file, fullPage: true, clip: { x: 0, y: top, width, height: Math.max(200, height) }, scale: 'css', ...(jpeg ? { type: 'jpeg' as const, quality: 82 } : { type: 'png' as const }), animations: 'disabled', timeout: 30000 })
      return { key: opts.key, pageUrl: opts.pageUrl, pageKind: opts.pageKind, viewport: opts.viewport, width, height: Math.max(200, height), file, bytes: statSync(file).size, findingCode: opts.findingCode }
    } catch {
      return null
    }
  }

  private async siteLevel(finalUrl: string, signal?: AbortSignal): Promise<Pick<SiteChecks, 'robotsTxt' | 'sitemap' | 'httpRedirectsToHttps'>> {
    const origin = new URL(finalUrl).origin
    let robotsTxt: SiteChecks['robotsTxt'] = null
    let sitemapFromRobots: string | undefined
    try {
      const r = await this.http.fetch(`${origin}/robots.txt`, { respectRobots: false, retries: 0, timeoutMs: 10000, maxBytes: 500000, signal })
      const disallowAll = /user-agent:\s*\*[\s\S]*?disallow:\s*\/\s*(\r?\n|$)/i.test(r.text) && !/allow:\s*\/\S/i.test(r.text)
      robotsTxt = { status: r.status, disallowAll: r.status === 200 && disallowAll }
      sitemapFromRobots = r.status === 200 ? r.text.match(/^\s*sitemap:\s*(\S+)/im)?.[1] : undefined
    } catch {
      robotsTxt = { status: null, disallowAll: false }
    }
    let sitemap: SiteChecks['sitemap'] = { found: false }
    for (const u of [sitemapFromRobots, `${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`, `${origin}/wp-sitemap.xml`].filter(Boolean) as string[]) {
      try {
        const r = await this.http.fetch(u, { respectRobots: false, retries: 0, timeoutMs: 10000, maxBytes: 5_000_000, signal })
        if (r.status === 200 && /<(urlset|sitemapindex)/i.test(r.text)) {
          sitemap = { found: true, url: u, urls: (r.text.match(/<loc>/gi) ?? []).length }
          break
        }
      } catch {
        /* sonraki aday */
      }
    }
    let httpRedirectsToHttps: boolean | null = null
    if (finalUrl.startsWith('https:')) {
      try {
        const ctrl = new AbortController()
        const t = setTimeout(() => ctrl.abort(), 8000)
        const r = await fetch(finalUrl.replace(/^https:/, 'http:'), { redirect: 'manual', signal: ctrl.signal, headers: { 'User-Agent': USER_AGENT } })
        clearTimeout(t)
        httpRedirectsToHttps = r.status >= 300 && r.status < 400 && (r.headers.get('location') ?? '').startsWith('https:')
      } catch {
        httpRedirectsToHttps = null
      }
    }
    return { robotsTxt, sitemap, httpRedirectsToHttps }
  }

  private async brokenLinks(home: PageData, siteDomain: string, respect: boolean, signal?: AbortSignal): Promise<SiteChecks['brokenLinks']> {
    const seen = new Set<string>()
    const internal: string[] = []
    for (const l of (home?.links ?? []) as { href: string }[]) {
      const u = l.href.split('#')[0]
      if (domainOf(u) !== siteDomain || seen.has(u) || /\.(pdf|jpe?g|png|zip|docx?)$/i.test(u)) continue
      seen.add(u)
      internal.push(u)
      if (internal.length >= 15) break
    }
    const broken: { url: string; status: number | string }[] = []
    let checked = 0
    for (const u of internal) {
      if (signal?.aborted) break
      if (!(await this.robotsAllowed(u, respect))) continue
      checked++
      try {
        const ctrl = new AbortController()
        const t = setTimeout(() => ctrl.abort(), 10000)
        let r = await fetch(u, { method: 'HEAD', redirect: 'follow', signal: ctrl.signal, headers: { 'User-Agent': USER_AGENT } })
        if (r.status === 405 || r.status === 501) r = await fetch(u, { method: 'GET', redirect: 'follow', signal: ctrl.signal, headers: { 'User-Agent': USER_AGENT } })
        clearTimeout(t)
        if (r.status >= 400 && r.status !== 401 && r.status !== 403 && r.status !== 429) broken.push({ url: u, status: r.status })
      } catch (e) {
        broken.push({ url: u, status: (e as Error).name === 'AbortError' ? 'zaman aşımı' : 'bağlantı hatası' })
      }
      await new Promise((r) => setTimeout(r, 400))
    }
    return { checked, broken }
  }

  private extractContacts(data: PageData, sourceUrl: string, siteDomain: string): ExtractedContact[] {
    if (!data) return []
    const out: ExtractedContact[] = []
    const c = data.contacts
    for (const e of [...c.mailtos, ...c.emailsInText]) {
      const k = emailKey(e)
      // Görsel/dosya adlarına benzeyen sahte eşleşmeleri ele
      if (k && !/\.(png|jpe?g|gif|webp|svg)$/i.test(k) && !/(sentry|wixpress|example|domain\.com)/i.test(k)) out.push({ type: 'email', value: k, sourceUrl })
    }
    for (const p of [...c.tels, ...c.phonesInText]) {
      const k = phoneKey(p)
      if (k) out.push({ type: 'phone', value: k, sourceUrl })
    }
    for (const w of c.whatsappLinks) {
      const num = w.match(/(?:wa\.me\/|phone=)(\+?\d{10,15})/)?.[1]
      const k = num ? phoneKey(num) : ''
      if (k) out.push({ type: 'whatsapp', value: k, sourceUrl })
    }
    for (const s of c.socials) out.push({ type: 'social', value: s, sourceUrl })
    void siteDomain
    return out
  }

  async analyze(url: string, opts: AnalyzerOptions): Promise<AnalysisOutput> {
    const step = (m: string) => opts.onStep?.(m)
    const base: AnalysisOutput = { status: 'failed', url, finalUrl: null, findings: [], scores: null, overall: null, tests: [], shots: [], contacts: [], metrics: {}, psi: null, pages: [] }
    try {
      await assertPublicHost(url)
    } catch (e) {
      return { ...base, status: 'unreachable', error: (e as Error).message }
    }
    if (!(await this.robotsAllowed(url, opts.respectRobots))) {
      return { ...base, status: 'blocked', error: 'Sitenin robots.txt dosyası otomatik ziyarete izin vermiyor; analiz yapılmadı. Bu durum sitenin kötü olduğu anlamına gelmez.', tests: [{ key: 'robots', label: 'robots.txt izni', status: 'skipped', note: 'Ziyaret izni yok' }] }
    }

    const browser = await acquireBrowser()
    let desktopCtx: BrowserContext | null = null
    let mobileCtx: BrowserContext | null = null
    try {
      // ---- Masaüstü ----
      step('Web sitesi açılıyor (masaüstü)')
      desktopCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, userAgent: DESKTOP_UA, locale: 'tr-TR', ignoreHTTPSErrors: false, acceptDownloads: false, serviceWorkers: 'block' })
      let certificateError: string | undefined
      let d: Awaited<ReturnType<SiteAnalyzer['open']>>
      try {
        d = await this.open(desktopCtx, url, opts.timeoutSec)
      } catch (e) {
        const msg = (e as Error).message
        if (/ERR_CERT|SSL|certificate/i.test(msg)) {
          certificateError = msg.match(/net::(ERR_[A-Z_]+)/)?.[1] ?? 'sertifika hatası'
          await desktopCtx.close()
          desktopCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, userAgent: DESKTOP_UA, locale: 'tr-TR', ignoreHTTPSErrors: true, acceptDownloads: false })
          d = await this.open(desktopCtx, url, opts.timeoutSec)
        } else {
          const short = msg.match(/net::(ERR_[A-Z_]+)/)?.[1]
          const friendly = short === 'ERR_NAME_NOT_RESOLVED' ? 'Alan adı çözümlenemedi (site yayında değil olabilir).' : short === 'ERR_CONNECTION_REFUSED' ? 'Sunucu bağlantıyı reddetti.' : /Timeout/i.test(msg) ? `Site ${opts.timeoutSec} saniye içinde yanıt vermedi.` : `Site açılamadı: ${short ?? msg.split('\n')[0].slice(0, 160)}`
          return { ...base, status: 'unreachable', error: friendly, tests: [{ key: 'desktop_render', label: 'Masaüstü görünüm', status: 'failed', note: friendly }] }
        }
      }
      const status = d.resp?.status() ?? 0
      if (status >= 400) {
        return { ...base, status: 'unreachable', error: `Site HTTP ${status} hatası döndürdü.`, finalUrl: d.page.url(), tests: [{ key: 'desktop_render', label: 'Masaüstü görünüm', status: 'failed', note: `HTTP ${status}` }] }
      }
      const finalUrl = d.page.url()
      const siteDomain = domainOf(finalUrl)
      step('Sayfa ölçümleri alınıyor')
      const desktop = (await d.page.evaluate(COLLECT_SCRIPT)) as PageData
      step('Ekran görüntüleri alınıyor')
      const shots: ShotRecord[] = []
      const push = (s: ShotRecord | null) => s && shots.push(s)
      push(await this.shot(d.page, { dir: opts.dir, key: 'home-desktop', pageUrl: finalUrl, pageKind: 'home', viewport: 'desktop', maxHeight: 900 }))
      push(await this.shot(d.page, { dir: opts.dir, key: 'home-desktop-full', pageUrl: finalUrl, pageKind: 'home', viewport: 'desktop', maxHeight: 5000, full: true }))
      const up = desktop?.images?.upscaledSamples?.[0]
      if (up) push(await this.shot(d.page, { dir: opts.dir, key: 'issue-image', pageUrl: finalUrl, pageKind: 'issue', viewport: 'desktop', maxHeight: 700, clipTop: Math.max(0, up.top - 100), full: true, findingCode: 'design_upscaled_images' }))

      // ---- Alt sayfalar ----
      const kinds = findPageLinks(desktop, siteDomain)
      const pages: { kind: string; url: string; desktop: PageData | null }[] = [{ kind: 'home', url: finalUrl, desktop }]
      for (const kind of ['services', 'about', 'contact']) {
        if (pages.length >= opts.maxPages) break
        const u = kinds[kind]
        if (!u || pages.some((p) => p.url === u) || opts.signal?.aborted) continue
        if (!(await this.robotsAllowed(u, opts.respectRobots))) continue
        step(`Alt sayfa inceleniyor: ${kind === 'services' ? 'Hizmetler' : kind === 'about' ? 'Hakkımızda' : 'İletişim'}`)
        try {
          const sp = await this.open(desktopCtx, u, Math.min(opts.timeoutSec, 25))
          const data = (await sp.page.evaluate(COLLECT_SCRIPT)) as PageData
          pages.push({ kind, url: sp.page.url(), desktop: data })
          push(await this.shot(sp.page, { dir: opts.dir, key: `${kind}-desktop`, pageUrl: sp.page.url(), pageKind: kind, viewport: 'desktop', maxHeight: 900 }))
          await sp.page.close()
        } catch {
          pages.push({ kind, url: u, desktop: null })
        }
      }

      // ---- Mobil ----
      step('Mobil görünüm inceleniyor')
      let mobile: PageData | null = null
      mobileCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: MOBILE_UA, locale: 'tr-TR', ignoreHTTPSErrors: !!certificateError, acceptDownloads: false, serviceWorkers: 'block' })
      try {
        const mp = await this.open(mobileCtx, finalUrl, opts.timeoutSec)
        mobile = (await mp.page.evaluate(COLLECT_SCRIPT)) as PageData
        push(await this.shot(mp.page, { dir: opts.dir, key: 'home-mobile', pageUrl: finalUrl, pageKind: 'home', viewport: 'mobile', maxHeight: 844 }))
        push(await this.shot(mp.page, { dir: opts.dir, key: 'home-mobile-full', pageUrl: finalUrl, pageKind: 'home', viewport: 'mobile', maxHeight: 3500, full: true }))
        if (mobile && mobile.viewport.scrollWidth > mobile.viewport.w + 4) {
          const top = mobile.overflow?.[0]?.top ?? 0
          push(await this.shot(mp.page, { dir: opts.dir, key: 'issue-overflow', pageUrl: finalUrl, pageKind: 'issue', viewport: 'mobile', maxHeight: 1000, clipTop: Math.max(0, top - 150), full: true, findingCode: 'mobile_overflow' }))
        }
        await mp.page.close()
      } catch {
        mobile = null
      }

      // ---- Site düzeyi ----
      step('Teknik kontroller (robots.txt, site haritası, bağlantılar)')
      const lvl = await this.siteLevel(finalUrl, opts.signal)
      const brokenLinks = await this.brokenLinks(desktop, siteDomain, opts.respectRobots, opts.signal)
      let psi: PsiResult | null = null
      const tests: TestRecord[] = []
      if (opts.pagespeed) {
        step('PageSpeed Insights ölçümü (30–90 sn sürebilir)')
        try {
          psi = await opts.pagespeed.run(finalUrl, 'mobile', opts.signal)
        } catch (e) {
          tests.push({ key: 'pagespeed_error', label: 'PageSpeed Insights', status: 'failed', note: (e as Error).message })
        }
      }
      const site: SiteChecks = {
        https: finalUrl.startsWith('https:') && !certificateError,
        httpRedirectsToHttps: lvl.httpRedirectsToHttps,
        robotsTxt: lvl.robotsTxt,
        sitemap: lvl.sitemap,
        brokenLinks,
        consoleErrors: d.consoleErrors.length,
        failedRequests: d.failed.slice(0, 20),
        mixedContent: d.mixed(),
        certificateError
      }
      const ev = evaluate({ desktop, mobile, pages, site, psi, siteDomain })
      const contacts: ExtractedContact[] = []
      for (const p of pages) contacts.push(...this.extractContacts(p.desktop, p.url, siteDomain))
      const uniq = new Map(contacts.map((c) => [`${c.type}:${c.value}`, c]))
      return {
        status: 'done',
        url,
        finalUrl,
        findings: ev.findings,
        scores: ev.scores,
        overall: ev.overall,
        tests: [...ev.tests, ...tests, { key: 'robots', label: 'robots.txt izni', status: 'done', note: opts.respectRobots ? 'Ziyaret edilen sayfalara izin veriliyor' : 'Kontrol kapalı' }],
        shots,
        contacts: [...uniq.values()],
        metrics: {
          desktop: desktop && { title: desktop.title, viewport: desktop.viewport, text: { ...desktop.text, smallSamples: undefined }, images: { ...desktop.images, upscaledSamples: desktop.images.upscaledSamples }, timing: desktop.timing, resources: desktop.resources, seo: desktop.seo, legacy: desktop.legacy, cta: desktop.cta, forms: desktop.forms, navLinks: desktop.navLinks },
          mobile: mobile && { viewport: mobile.viewport, text: { small: mobile.text.small, elements: mobile.text.elements }, overflow: mobile.overflow, targets: mobile.targets, hamburger: mobile.hamburger },
          site
        },
        psi,
        pages: pages.map((p) => ({ kind: p.kind, url: p.url }))
      }
    } catch (e) {
      return { ...base, status: 'failed', error: `Analiz sırasında beklenmeyen hata: ${(e as Error).message.split('\n')[0].slice(0, 300)}` }
    } finally {
      await desktopCtx?.close().catch(() => undefined)
      await mobileCtx?.close().catch(() => undefined)
      releaseBrowser()
    }
  }
}
