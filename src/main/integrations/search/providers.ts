// Şirket keşfi için arama sağlayıcıları. Yalnızca resmî API'ler kullanılır (Google arama sonuç
// sayfası kazınmaz). Her sağlayıcı aynı SearchHit biçimini döndürür.
//
//  - Google Places API (New) Text Search: işletme adı, adres, web sitesi, telefon, işletme durumu.
//    Sorgu başına en fazla 60 sonuç (20'lik 3 sayfa). Önerilen sağlayıcı.
//  - SerpAPI (google_maps motoru): Google Haritalar sonuçlarını yetkili bir aracı üzerinden verir.
//  - Brave Search API: genel web araması; işletme bilgisi daha zayıftır, sonuçlar "ek araştırma
//    gerekiyor" olarak işaretlenir.

import type { PoliteFetcher } from '../../http/fetcher'
import { FetchError } from '../../http/fetcher'
import type { SearchHit } from '@shared/types'
import { isOfficialWebsite, normalizeWebsite } from '@shared/text'

export interface SearchProvider {
  key: 'google_places' | 'serpapi' | 'brave'
  label: string
  search(query: string, opts: { limit: number; signal?: AbortSignal }): Promise<SearchHit[]>
  test(): Promise<string>
}

export class QuotaError extends Error {}

function cityFromComponents(comps: { longText?: string; types?: string[] }[] | undefined) {
  const city = comps?.find((c) => c.types?.includes('administrative_area_level_1'))?.longText
  const district = comps?.find((c) => c.types?.includes('administrative_area_level_2'))?.longText
  return { city: city?.replace(/\s*(İli|Province)$/i, ''), district }
}

function rethrow(e: unknown, provider: string): never {
  if (e instanceof FetchError && (e.status === 429 || e.kind === 'rate-limit')) throw new QuotaError(`${provider}: API kotası doldu veya istek sınırına ulaşıldı (HTTP 429).`)
  if (e instanceof FetchError && (e.status === 401 || e.status === 403)) throw new Error(`${provider}: Yetkilendirme hatası (HTTP ${e.status}). API anahtarını ve API'nin projede etkin olduğunu kontrol edin.`)
  throw e
}

export class GooglePlacesProvider implements SearchProvider {
  key = 'google_places' as const
  label = 'Google Places API (New)'
  constructor(
    private http: PoliteFetcher,
    private apiKey: string
  ) {}

  private async page(query: string, pageToken?: string, signal?: AbortSignal) {
    const fields = [
      'places.id', 'places.displayName', 'places.formattedAddress', 'places.addressComponents', 'places.websiteUri',
      'places.nationalPhoneNumber', 'places.internationalPhoneNumber', 'places.businessStatus', 'places.rating',
      'places.userRatingCount', 'places.types', 'places.googleMapsUri', 'nextPageToken'
    ].join(',')
    try {
      const { data } = await this.http.json<{
        places?: {
          id: string
          displayName?: { text: string }
          formattedAddress?: string
          addressComponents?: { longText?: string; types?: string[] }[]
          websiteUri?: string
          nationalPhoneNumber?: string
          internationalPhoneNumber?: string
          businessStatus?: string
          rating?: number
          userRatingCount?: number
          types?: string[]
          googleMapsUri?: string
        }[]
        nextPageToken?: string
        error?: { message: string }
      }>('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        respectRobots: false,
        retries: 1,
        signal,
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': this.apiKey, 'X-Goog-FieldMask': fields },
        body: JSON.stringify({ textQuery: query, languageCode: 'tr', regionCode: 'TR', pageSize: 20, ...(pageToken ? { pageToken } : {}) }),
        minIntervalMs: 300
      })
      return data
    } catch (e) {
      rethrow(e, this.label)
    }
  }

  async search(query: string, opts: { limit: number; signal?: AbortSignal }): Promise<SearchHit[]> {
    const out: SearchHit[] = []
    let token: string | undefined
    for (let i = 0; i < 3 && out.length < opts.limit; i++) {
      const data = await this.page(query, token, opts.signal)
      for (const p of data.places ?? []) {
        const loc = cityFromComponents(p.addressComponents)
        out.push({
          name: p.displayName?.text ?? '',
          address: p.formattedAddress,
          city: loc.city,
          district: loc.district,
          website: normalizeWebsite(p.websiteUri) ?? undefined,
          phone: p.internationalPhoneNumber ?? p.nationalPhoneNumber,
          sourceRef: p.id,
          businessStatus: p.businessStatus,
          rating: p.rating,
          ratingCount: p.userRatingCount,
          types: p.types,
          mapsUrl: p.googleMapsUri
        })
      }
      token = data.nextPageToken
      if (!token) break
      await new Promise((r) => setTimeout(r, 1500))
    }
    return out.filter((h) => h.name).slice(0, opts.limit)
  }

  async test(): Promise<string> {
    const r = await this.page('mimarlık ofisi Kocaeli')
    return `Bağlantı başarılı: test sorgusu ${r.places?.length ?? 0} işletme döndürdü.`
  }
}

export class SerpApiProvider implements SearchProvider {
  key = 'serpapi' as const
  label = 'SerpAPI (Google Haritalar)'
  constructor(
    private http: PoliteFetcher,
    private apiKey: string
  ) {}

  private async page(query: string, start: number, signal?: AbortSignal) {
    const url = `https://serpapi.com/search.json?engine=google_maps&type=search&hl=tr&gl=tr&q=${encodeURIComponent(query)}&start=${start}&api_key=${encodeURIComponent(this.apiKey)}`
    try {
      const { data } = await this.http.json<{
        local_results?: { title: string; address?: string; phone?: string; website?: string; place_id?: string; rating?: number; reviews?: number; type?: string; types?: string[]; operating_hours?: unknown; open_state?: string }[]
        error?: string
      }>(url, { respectRobots: false, retries: 1, signal, minIntervalMs: 500 })
      if (data.error) {
        if (/run out of searches|limit/i.test(data.error)) throw new QuotaError(`SerpAPI: ${data.error}`)
        if (/no results/i.test(data.error)) return { local_results: [] }
        throw new Error(`SerpAPI: ${data.error}`)
      }
      return data
    } catch (e) {
      rethrow(e, this.label)
    }
  }

  async search(query: string, opts: { limit: number; signal?: AbortSignal }): Promise<SearchHit[]> {
    const out: SearchHit[] = []
    for (let start = 0; start < 60 && out.length < opts.limit; start += 20) {
      const data = await this.page(query, start, opts.signal)
      const rows = data.local_results ?? []
      for (const r of rows) {
        const parts = (r.address ?? '').split(',').map((s) => s.trim())
        const last = parts[parts.length - 1] ?? ''
        const m = last.match(/^(?:\d{5}\s+)?([^/]+)\/([^/]+)$/)
        out.push({
          name: r.title,
          address: r.address,
          district: m?.[1]?.trim(),
          city: m?.[2]?.trim(),
          website: normalizeWebsite(r.website) ?? undefined,
          phone: r.phone,
          sourceRef: r.place_id,
          businessStatus: /kalıcı olarak kapandı|permanently closed/i.test(r.open_state ?? '') ? 'CLOSED_PERMANENTLY' : undefined,
          rating: r.rating,
          ratingCount: r.reviews,
          types: r.types ?? (r.type ? [r.type] : undefined)
        })
      }
      if (rows.length < 20) break
    }
    return out.slice(0, opts.limit)
  }

  async test(): Promise<string> {
    const { data } = await this.http.json<{ account_email?: string; plan_searches_left?: number; total_searches_left?: number; error?: string }>(
      `https://serpapi.com/account.json?api_key=${encodeURIComponent(this.apiKey)}`,
      { respectRobots: false, retries: 0 }
    )
    if (data.error) throw new Error(`SerpAPI: ${data.error}`)
    return `Bağlantı başarılı. Kalan arama hakkı: ${data.total_searches_left ?? data.plan_searches_left ?? 'bilinmiyor'}.`
  }
}

export class BraveProvider implements SearchProvider {
  key = 'brave' as const
  label = 'Brave Search API'
  constructor(
    private http: PoliteFetcher,
    private apiKey: string
  ) {}

  async search(query: string, opts: { limit: number; signal?: AbortSignal }): Promise<SearchHit[]> {
    const out: SearchHit[] = []
    for (let offset = 0; offset < 5 && out.length < opts.limit; offset++) {
      let data: { web?: { results?: { title: string; url: string; description?: string }[] } }
      try {
        data = (
          await this.http.json<typeof data>(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&country=TR&search_lang=tr&count=20&offset=${offset}`, {
            respectRobots: false,
            retries: 1,
            signal: opts.signal,
            headers: { 'X-Subscription-Token': this.apiKey },
            minIntervalMs: 1100
          })
        ).data
      } catch (e) {
        rethrow(e, this.label)
      }
      const rows = data.web?.results ?? []
      for (const r of rows) {
        if (!isOfficialWebsite(r.url)) continue
        const origin = new URL(r.url).origin
        if (out.some((o) => o.website === origin)) continue
        out.push({ name: r.title.split(/\s[|–\-:]\s/)[0].trim().slice(0, 120), website: origin })
      }
      if (rows.length < 20) break
    }
    return out.slice(0, opts.limit)
  }

  async test(): Promise<string> {
    const r = await this.search('mimarlık ofisi Kocaeli', { limit: 3 })
    return `Bağlantı başarılı: test sorgusu ${r.length} sonuç döndürdü.`
  }
}

/** CSV içe aktarma (manuel veri): başlık satırındaki sütun adları esnek eşleştirilir. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  const delim = (text.split('\n')[0].match(/;/g)?.length ?? 0) > (text.split('\n')[0].match(/,/g)?.length ?? 0) ? ';' : ','
  let row: string[] = []
  let cell = ''
  let q = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (q) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') q = false
      else cell += ch
    } else if (ch === '"') q = true
    else if (ch === delim) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      if (row.some((c) => c.trim())) rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  row.push(cell)
  if (row.some((c) => c.trim())) rows.push(row)
  return rows
}

const COLS: Record<keyof SearchHit | 'email' | 'sector', RegExp> = {
  name: /^(şirket|sirket|firma|ad|isim|name|company|unvan|ünvan)/i,
  address: /^(adres|address)/i,
  city: /^(il|şehir|sehir|city)$/i,
  district: /^(ilçe|ilce|district)$/i,
  website: /^(web|site|website|url)/i,
  phone: /^(telefon|tel|phone|gsm)/i,
  email: /^(e-?posta|email|mail)/i,
  sector: /^(sektör|sektor|sector|kategori)/i,
  sourceRef: /^$/, businessStatus: /^$/, rating: /^$/, ratingCount: /^$/, types: /^$/, mapsUrl: /^$/
}

export function csvToHits(text: string): (SearchHit & { email?: string; sector?: string })[] {
  const rows = parseCsv(text.replace(/^﻿/, ''))
  if (rows.length < 2) return []
  const header = rows[0].map((h) => h.trim())
  const idx = (k: keyof typeof COLS) => header.findIndex((h) => COLS[k].test(h))
  const map = { name: idx('name'), address: idx('address'), city: idx('city'), district: idx('district'), website: idx('website'), phone: idx('phone'), email: idx('email'), sector: idx('sector') }
  if (map.name < 0) throw new Error('CSV dosyasında "Şirket" / "Firma" / "Ad" sütunu bulunamadı.')
  return rows.slice(1).map((r) => {
    const v = (i: number) => (i >= 0 ? (r[i] ?? '').trim() || undefined : undefined)
    return {
      name: v(map.name) ?? '',
      address: v(map.address),
      city: v(map.city),
      district: v(map.district),
      website: normalizeWebsite(v(map.website)) ?? undefined,
      phone: v(map.phone),
      email: v(map.email),
      sector: v(map.sector)
    }
  }).filter((h) => h.name)
}
