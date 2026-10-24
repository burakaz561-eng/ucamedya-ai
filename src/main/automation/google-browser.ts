// Google'da tarayıcı üzerinden şirket arama (API anahtarı gerektirmez).
// Kullanıcının ajan tarayıcısında: google.com açılır → arama kutusuna sorgu yazılır → Enter → "Daha fazla
// işletme" (yerel işletme listesi) açılır → ad, kategori, ilçe/il, telefon ve web sitesi okunur → gerekirse
// sonraki sayfaya geçilir (sorgu başına en fazla birkaç sayfa). Sayfa geçişleri arasında sabit bekleme vardır.
// CAPTCHA / "olağan dışı trafik" ekranı çıkarsa işlem durur ve kullanıcının tarayıcıda çözmesi beklenir.

import type { Page } from 'playwright-core'
import type { AgentBrowser } from './agent-browser'
import type { SearchHit } from '@shared/types'
import { fold, isOfficialWebsite, normalizeWebsite } from '@shared/text'

const LOCAL_SCRIPT = String.raw`(() => [...document.querySelectorAll('.rllt__details')].map((d) => {
  let c = d
  for (let i = 0; i < 8 && c.parentElement; i++) {
    c = c.parentElement
    if (c.querySelectorAll('.rllt__details').length > 1) { c = d.parentElement || d; break }
    if ([...c.querySelectorAll('a')].some((a) => /web sitesi|website/i.test(a.textContent || ''))) break
  }
  const w = [...c.querySelectorAll('a')].find((a) => /web sitesi|website/i.test(a.textContent || ''))
  const h = d.querySelector('[role=heading]')
  return { name: (h ? h.textContent : '').trim(), lines: (d.innerText || '').split('\n').map((s) => s.trim()).filter(Boolean), web: w ? w.href : null }
}))()`

const ORGANIC_SCRIPT = String.raw`(() => [...document.querySelectorAll('#search a:has(h3)')].map((a) => {
  const blk = a.closest('[data-hveid]') || a.parentElement
  const cite = blk ? blk.querySelector('cite') : null
  return { title: (a.querySelector('h3') || a).textContent.trim(), cite: cite ? cite.textContent.trim() : '', href: a.href }
}))()`

export interface LocalRow {
  name: string
  lines: string[]
  web: string | null
}

const PHONE_RE = /(\+90[\s\d()-]{10,16}|\(?0\s?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}|\b444\s?\d\s?\d{3}\b)/

/** Yerel işletme satırlarından telefon, ilçe/il, kategori ve puanı ayıklar (saf fonksiyon, birim testli). */
export function parseLocalRow(r: LocalRow): Omit<SearchHit, 'website'> & { category?: string } {
  const text = r.lines.join(' · ')
  const phone = text.match(PHONE_RE)?.[1]?.trim()
  const loc = text.match(/([A-ZÇĞİÖŞÜa-zçğıöşü.\s]+)\/([A-ZÇĞİÖŞÜa-zçğıöşü\s]+?)(?=\s*(?:·|\||$|\d))/)
  const rating = text.match(/(\d[.,]\d)\s*\((\d[\d.]*)\)/)
  const category = r.lines.map((l) => l.replace(/^[·\s]+/, '')).find((l) => /^[A-ZÇĞİÖŞÜ][^\d]{3,60}$/.test(l) && l !== r.name && !/açık|kapalı|saat|yıldan|olanaklar|hizmet·/i.test(l))
  const closed = /kalıcı olarak kapandı|permanently closed/i.test(text)
  return {
    name: r.name,
    phone,
    district: loc?.[1]?.split('·').pop()?.trim(),
    city: loc?.[2]?.trim(),
    rating: rating ? Number(rating[1].replace(',', '.')) : undefined,
    ratingCount: rating ? Number(rating[2].replace(/\./g, '')) : undefined,
    businessStatus: closed ? 'CLOSED_PERMANENTLY' : 'OPERATIONAL',
    category
  }
}

/** Organik sonuçtan resmî site ve şirket adı çıkarır; rehber/sosyal ağ sonuçlarını eler. */
export function parseOrganic(o: { title: string; cite: string }): SearchHit | null {
  const site = normalizeWebsite(o.cite.split('›')[0].trim())
  if (!site || !isOfficialWebsite(site)) return null
  const host = new URL(site).hostname.replace(/^www\./, '')
  if (/(^|\.)(scribd|slideshare|issuu|wikipedia|academia|dergipark|gov|edu|bel)\./.test(`.${host}.`) || /\.(gov|edu|bel|k12)\.tr$/.test(host)) return null
  if (/(en iyi \d*|listesi|rehberi|\bpdf\b)/i.test(fold(o.title))) return null
  let name = o.title.split(/\s[|–\-:]\s|\s\|/)[0].trim()
  // Başlık şirket adı yerine genel bir arama ifadesiyse ("Kocaeli inşaat firmaları") alan adı kullanılır
  if (/(firmalari|firmasi|sirketleri|sirketi|hizmetleri|yakinimda)/.test(fold(name)) || name.length < 2) name = host
  return { name: name.slice(0, 120), website: new URL(site).origin }
}

/** Google yönlendirme bağlantısını (/goto?url=…) gerçek adrese çözer. */
export async function resolveGoogleLink(href: string): Promise<string | null> {
  try {
    const u = new URL(href)
    if (!/google\./.test(u.hostname)) return normalizeWebsite(href)
    const direct = u.searchParams.get('q') ?? u.searchParams.get('url')
    if (direct && /^https?:/.test(direct)) return normalizeWebsite(direct)
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 8000)
    const r = await fetch(href, { redirect: 'manual', signal: ctrl.signal })
    clearTimeout(t)
    const loc = r.headers.get('location')
    return loc && /^https?:/.test(loc) && !/google\./.test(new URL(loc).hostname) ? normalizeWebsite(loc) : null
  } catch {
    return null
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function isBlocked(page: Page) {
  if (/\/sorry\/|consent\.google|accounts\.google/.test(page.url())) return true
  return (await page.locator('#captcha-form, iframe[title*="reCAPTCHA"], form[action*="sorry"]').count()) > 0
}

export class GoogleBrowserSearch {
  key = 'google_browser' as const
  label = 'Google (tarayıcı üzerinden)'

  constructor(
    private agent: AgentBrowser,
    private betweenPagesMs = 3500
  ) {}

  private async guard(page: Page, company?: string | null) {
    if (/consent\.google/.test(page.url())) {
      // Çerez onayı: gizliliği en çok koruyan seçenek ("Tümünü reddet") seçilir
      const reject = page.locator('button:has-text("Tümünü reddet"), button:has-text("Reject all")').first()
      if (await reject.count()) {
        await reject.click().catch(() => undefined)
        await page.waitForLoadState('domcontentloaded').catch(() => undefined)
      }
    }
    if (await isBlocked(page)) {
      await this.agent.waitForUser(page, 'Google doğrulama istiyor (CAPTCHA / olağan dışı trafik). Lütfen tarayıcıda doğrulamayı siz tamamlayın; tamamlanınca devam edeceğim.', async () => !(await isBlocked(page)), 10 * 60 * 1000, company)
    }
  }

  async search(query: string, opts: { limit: number; signal?: AbortSignal; maxPages?: number }): Promise<SearchHit[]> {
    return this.agent.run(async () => {
      const page = await this.agent.page('google')
      this.agent.touch(page)
      await page.bringToFront().catch(() => undefined)
      this.agent.report({ state: 'busy', step: 'Google açılıyor' })
      await page.goto('https://www.google.com/?hl=tr', { waitUntil: 'domcontentloaded', timeout: 30000 })
      await this.guard(page)
      const box = page.locator('textarea[name="q"], input[name="q"]').first()
      await box.waitFor({ timeout: 15000 })
      this.agent.report({ state: 'busy', step: `Arama yapılıyor: "${query}"` })
      await box.fill('')
      await box.pressSequentially(query, { delay: 25 })
      await box.press('Enter')
      await page.waitForLoadState('domcontentloaded', { timeout: 30000 })
      await sleep(1500)
      await this.guard(page)
      this.agent.report({ state: 'busy', step: 'Arama sonuçları inceleniyor' })

      const hits: SearchHit[] = []
      const seen = new Set<string>()
      const push = (h: SearchHit) => {
        const k = (h.website ? new URL(h.website).hostname.replace(/^www\./, '') : '') || h.name.toLocaleLowerCase('tr-TR')
        if (seen.has(k) || seen.has(h.name.toLocaleLowerCase('tr-TR'))) return
        seen.add(k)
        seen.add(h.name.toLocaleLowerCase('tr-TR'))
        hits.push(h)
      }
      const organic = ((await page.evaluate(ORGANIC_SCRIPT)) as { title: string; cite: string }[]).map(parseOrganic).filter(Boolean) as SearchHit[]

      const more = page.locator('a:has-text("Daha fazla işletme"), a:has-text("Diğer işletmeler"), a:has-text("Daha fazla yer"), a:has-text("More businesses"), a:has-text("More places")').first()
      if (await more.count()) {
        await more.click()
        await page.waitForLoadState('domcontentloaded', { timeout: 30000 })
        await sleep(1500)
        await this.guard(page)
        const maxPages = opts.maxPages ?? 3
        for (let p = 0; p < maxPages && hits.length < opts.limit; p++) {
          if (opts.signal?.aborted) break
          this.agent.report({ state: 'busy', step: `İşletme listesi okunuyor (sayfa ${p + 1})` })
          const rows = (await page.evaluate(LOCAL_SCRIPT)) as LocalRow[]
          for (const r of rows) {
            if (!r.name || hits.length >= opts.limit) continue
            const base = parseLocalRow(r)
            const website = r.web ? await resolveGoogleLink(r.web) : null
            push({ ...base, website: website && isOfficialWebsite(website) ? website : undefined, types: base.category ? [base.category] : undefined, sourceRef: `gl:${r.name}|${base.phone ?? ''}` })
          }
          if (hits.length >= opts.limit || p + 1 >= maxPages) break
          const nextHref = await page.locator('a#pnnext').first().getAttribute('href').catch(() => null)
          if (!nextHref) break
          await sleep(this.betweenPagesMs)
          this.agent.report({ state: 'busy', step: 'Sonraki sonuç sayfasına geçiliyor' })
          await page.goto(new URL(nextHref, page.url()).toString(), { waitUntil: 'domcontentloaded', timeout: 30000 })
          await sleep(1200)
          await this.guard(page)
        }
      }
      for (const o of organic) if (hits.length < opts.limit) push(o)
      this.agent.report({ state: 'ready', step: `"${query}": ${hits.length} şirket bulundu` })
      return hits
    })
  }

  async test(): Promise<string> {
    const r = await this.search('mimarlık ofisi Kocaeli', { limit: 5, maxPages: 1 })
    return `Tarayıcı üzerinden Google araması çalışıyor: ${r.length} şirket okundu.`
  }
}
