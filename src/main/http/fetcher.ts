// Kurallara uygun HTTP istemcisi: robots.txt kontrolü, alan adı başına hız sınırı,
// zaman aşımı, boyut sınırı, kontrollü yeniden deneme ve kısa süreli önbellek.

import { hostOf, isSafeExternalUrl } from './url-safety'
import { RobotsCache } from './robots'

export const USER_AGENT = 'UcaMedyaAI/0.1 (+https://ucamedya.com.tr; web sitesi inceleme araci)'

export class FetchError extends Error {
  constructor(
    message: string,
    public status: number | null = null,
    public kind: 'network' | 'http' | 'robots' | 'blocked' | 'timeout' | 'too-large' | 'invalid-url' | 'rate-limit' = 'network'
  ) {
    super(message)
  }
}

export interface FetchOptions {
  method?: 'GET' | 'POST'
  headers?: Record<string, string>
  body?: string
  timeoutMs?: number
  maxBytes?: number
  respectRobots?: boolean
  retries?: number
  cacheTtlMs?: number
  /** Resmî API çağrılarında anahtar başlıkta gider; önbellek anahtarına dahil edilmez. */
  json?: boolean
  signal?: AbortSignal
  /** Bu istek için alan adı başına en az bekleme (genel sınırdan büyükse uygulanır). */
  minIntervalMs?: number
}

export interface FetchResult {
  url: string
  finalUrl: string
  status: number
  headers: Record<string, string>
  text: string
  fromCache: boolean
}

type FetchImpl = typeof fetch

/** Bot koruması / CAPTCHA sayfası işaretleri: görülürse site bir süre rahat bırakılır (aşılmaya çalışılmaz). */
const BOT_WALL = /px-captcha|captcha-delivery|cf-chl|challenge-platform|Access to this page has been denied|Attention Required|bot olmadığınızı/i
const BLOCK_PAUSE_MS = 30 * 60 * 1000

export class PoliteFetcher {
  private lastHit = new Map<string, number>()
  private cache = new Map<string, { at: number; res: FetchResult }>()
  /** Bot korumasıyla karşılaşılan alan adları → bu zamana kadar istek atılmaz */
  private blockedUntil = new Map<string, number>()
  readonly robots: RobotsCache

  constructor(
    private fetchImpl: FetchImpl = fetch,
    private minIntervalMs = 2500,
    private sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))
  ) {
    this.robots = new RobotsCache((url) => this.rawGet(url), USER_AGENT)
  }

  private async rawGet(url: string): Promise<{ status: number; text: string }> {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 10000)
    try {
      const r = await this.fetchImpl(url, { headers: { 'User-Agent': USER_AGENT }, signal: ctrl.signal, redirect: 'follow' })
      const text = r.ok ? await r.text() : ''
      return { status: r.status, text: text.slice(0, 500000) }
    } finally {
      clearTimeout(t)
    }
  }

  /** Alan adı şu an bot koruması nedeniyle beklemede mi? (kalan dakika) */
  pausedMinutes(url: string): number {
    const until = this.blockedUntil.get(hostOf(url)) ?? 0
    return until > Date.now() ? Math.ceil((until - Date.now()) / 60000) : 0
  }

  private async throttle(host: string, signal?: AbortSignal, intervalMs = this.minIntervalMs) {
    const interval = Math.max(intervalMs, this.minIntervalMs)
    const last = this.lastHit.get(host) ?? 0
    const wait = last + interval - Date.now()
    this.lastHit.set(host, Math.max(Date.now(), last + interval))
    if (wait > 0) {
      if (signal?.aborted) throw new FetchError('İptal edildi', null, 'network')
      await this.sleep(wait)
    }
  }

  async fetch(url: string, opts: FetchOptions = {}): Promise<FetchResult> {
    if (!isSafeExternalUrl(url)) throw new FetchError('Geçersiz veya güvenli olmayan adres', null, 'invalid-url')
    const method = opts.method ?? 'GET'
    const cacheKey = `${method} ${url} ${opts.body ?? ''}`
    if (opts.cacheTtlMs) {
      const c = this.cache.get(cacheKey)
      if (c && Date.now() - c.at < opts.cacheTtlMs) return { ...c.res, fromCache: true }
    }
    if (opts.respectRobots !== false) {
      const allowed = await this.robots.isAllowed(url)
      if (!allowed) throw new FetchError('Bu sayfanın otomatik okunmasına sitenin robots.txt dosyası izin vermiyor.', null, 'robots')
    }
    const host = hostOf(url)
    const paused = this.pausedMinutes(url)
    if (paused) throw new FetchError(`Site, bot korumasıyla erişimi geçici olarak kısıtladı; uygulama siteyi ${paused} dk rahat bırakacak.`, 403, 'blocked')
    const retries = opts.retries ?? 2
    let attempt = 0
    for (;;) {
      if (opts.signal?.aborted) throw new FetchError('İptal edildi', null, 'network')
      await this.throttle(host, opts.signal, opts.minIntervalMs)
      const ctrl = new AbortController()
      const onAbort = () => ctrl.abort()
      opts.signal?.addEventListener('abort', onAbort)
      const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 20000)
      try {
        const res = await this.fetchImpl(url, {
          method,
          body: opts.body,
          redirect: 'follow',
          signal: ctrl.signal,
          headers: {
            'User-Agent': USER_AGENT,
            'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.7',
            Accept: opts.json ? 'application/json' : 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
            ...(opts.headers ?? {})
          }
        })
        const headers: Record<string, string> = {}
        res.headers.forEach((v, k) => (headers[k] = v))
        if (res.status === 429 || res.status >= 500) {
          if (attempt < retries) {
            attempt++
            const ra = parseInt(headers['retry-after'] ?? '', 10)
            await this.sleep(Math.min(isNaN(ra) ? 2000 * 2 ** attempt : ra * 1000, 30000))
            continue
          }
          throw new FetchError(res.status === 429 ? 'Kaynak istek sınırına ulaşıldı (HTTP 429). Daha sonra tekrar denenecek.' : `Sunucu hatası (HTTP ${res.status})`, res.status, res.status === 429 ? 'rate-limit' : 'http')
        }
        const max = opts.maxBytes ?? 3_000_000
        const len = parseInt(headers['content-length'] ?? '0', 10)
        if (len > max) throw new FetchError('Yanıt çok büyük', res.status, 'too-large')
        const buf = new Uint8Array(await res.arrayBuffer())
        if (buf.length > max) throw new FetchError('Yanıt çok büyük', res.status, 'too-large')
        const ct = headers['content-type'] ?? ''
        const charset = ct.match(/charset=([\w-]+)/i)?.[1]?.toLowerCase()
        let text: string
        try {
          text = new TextDecoder(charset && charset !== 'utf8' ? charset : 'utf-8').decode(buf)
        } catch {
          text = new TextDecoder('utf-8').decode(buf)
        }
        if ((res.status === 403 || res.status === 429) && BOT_WALL.test(text.slice(0, 20000))) this.blockedUntil.set(host, Date.now() + BLOCK_PAUSE_MS)
        const out: FetchResult = { url, finalUrl: res.url || url, status: res.status, headers, text, fromCache: false }
        if (opts.cacheTtlMs && res.ok) this.cache.set(cacheKey, { at: Date.now(), res: out })
        if (this.cache.size > 500) this.cache.delete(this.cache.keys().next().value as string)
        return out
      } catch (e) {
        if (e instanceof FetchError) throw e
        const aborted = (e as Error).name === 'AbortError'
        if (opts.signal?.aborted) throw new FetchError('İptal edildi', null, 'network')
        if (attempt < retries) {
          attempt++
          await this.sleep(1500 * 2 ** attempt)
          continue
        }
        throw new FetchError(aborted ? 'Zaman aşımı: sayfa yanıt vermedi.' : `Bağlantı hatası: ${(e as Error).message}`, null, aborted ? 'timeout' : 'network')
      } finally {
        clearTimeout(timer)
        opts.signal?.removeEventListener('abort', onAbort)
      }
    }
  }

  async json<T>(url: string, opts: FetchOptions = {}): Promise<{ data: T; res: FetchResult }> {
    const res = await this.fetch(url, { ...opts, json: true })
    if (res.status === 401 || res.status === 403) throw new FetchError(`Yetkilendirme hatası (HTTP ${res.status}). API anahtarını kontrol edin.`, res.status, 'http')
    if (res.status >= 400) throw new FetchError(`HTTP ${res.status}: ${res.text.slice(0, 200)}`, res.status, 'http')
    try {
      return { data: JSON.parse(res.text) as T, res }
    } catch {
      throw new FetchError('Kaynak geçersiz JSON döndürdü', res.status, 'http')
    }
  }
}
