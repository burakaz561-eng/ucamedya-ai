// Google PageSpeed Insights API v5 (Lighthouse). Ölçüm yapılamazsa null döner; tahmin üretilmez.

import type { PsiResult } from '../analysis/rules'

export class PageSpeedClient {
  constructor(private apiKey: string | undefined) {}

  async run(url: string, strategy: 'mobile' | 'desktop' = 'mobile', signal?: AbortSignal): Promise<PsiResult> {
    const q = new URLSearchParams({ url, strategy, locale: 'tr' })
    for (const c of ['performance', 'accessibility', 'seo', 'best-practices']) q.append('category', c)
    if (this.apiKey) q.set('key', this.apiKey)
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 120000)
    signal?.addEventListener('abort', () => ctrl.abort())
    try {
      const res = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${q}`, { signal: ctrl.signal })
      const data = (await res.json()) as any // eslint-disable-line @typescript-eslint/no-explicit-any
      if (!res.ok) {
        const msg: string = data?.error?.message ?? `HTTP ${res.status}`
        if (res.status === 429 || /quota/i.test(msg)) throw new Error(`PageSpeed API kotası doldu: ${msg}`)
        if (res.status === 400 && /API key/i.test(msg)) throw new Error('PageSpeed API anahtarı geçersiz.')
        throw new Error(`PageSpeed ölçümü başarısız: ${msg.slice(0, 200)}`)
      }
      const lh = data.lighthouseResult
      const cat = (k: string) => (lh?.categories?.[k]?.score != null ? Math.round(lh.categories[k].score * 100) : null)
      const au = (k: string) => lh?.audits?.[k]?.numericValue as number | undefined
      const fm = data.loadingExperience?.metrics
      const field = fm
        ? {
            lcp: fm.LARGEST_CONTENTFUL_PAINT_MS?.percentile,
            cls: fm.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile != null ? fm.CUMULATIVE_LAYOUT_SHIFT_SCORE.percentile / 100 : undefined,
            inp: fm.INTERACTION_TO_NEXT_PAINT?.percentile,
            category: data.loadingExperience?.overall_category
          }
        : null
      return {
        strategy,
        performance: cat('performance'),
        accessibility: cat('accessibility'),
        seo: cat('seo'),
        bestPractices: cat('best-practices'),
        lab: { lcp: au('largest-contentful-paint'), cls: au('cumulative-layout-shift'), tbt: au('total-blocking-time'), fcp: au('first-contentful-paint'), si: au('speed-index'), tti: au('interactive') },
        field,
        fetchedAt: new Date().toISOString()
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw new Error('PageSpeed ölçümü zaman aşımına uğradı (120 sn).')
      throw e
    } finally {
      clearTimeout(t)
    }
  }
}
