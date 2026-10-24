// Hafif iletişim bilgisi taraması (tam site analizi kapalıyken kullanılır): ana sayfa ve iletişim/hakkımızda
// sayfasındaki kurumsal e-posta ve telefonlar okunur. robots.txt kurallarına uyulur; kaynak sayfa kaydedilir.

import type { PoliteFetcher } from '../http/fetcher'
import { emailKey, phoneKey, fold } from '@shared/text'

export interface FoundContact {
  type: 'email' | 'phone' | 'whatsapp'
  value: string
  sourceUrl: string
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
const PHONE_RE = /(?:\+90|0)\s*\(?\d{3}\)?[\s.-]*\d{3}[\s.-]*\d{2}[\s.-]*\d{2}/g

export function extractContacts(html: string, sourceUrl: string): FoundContact[] {
  const out: FoundContact[] = []
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
  for (const m of text.match(EMAIL_RE) ?? []) {
    const k = emailKey(m)
    if (k && !/\.(png|jpe?g|gif|webp|svg)$/i.test(k) && !/(sentry|wixpress|example|domain\.com)/i.test(k)) out.push({ type: 'email', value: k, sourceUrl })
  }
  for (const m of text.match(/href=["']tel:([^"']+)/gi) ?? []) {
    const k = phoneKey(m.replace(/^href=["']tel:/i, ''))
    if (k) out.push({ type: 'phone', value: k, sourceUrl })
  }
  for (const m of text.replace(/<[^>]+>/g, ' ').match(PHONE_RE) ?? []) {
    const k = phoneKey(m)
    if (k) out.push({ type: 'phone', value: k, sourceUrl })
  }
  for (const m of text.match(/(?:wa\.me\/|phone=)(\+?\d{10,15})/g) ?? []) {
    const k = phoneKey(m.replace(/^(wa\.me\/|phone=)/, ''))
    if (k) out.push({ type: 'whatsapp', value: k, sourceUrl })
  }
  const uniq = new Map(out.map((c) => [`${c.type}:${c.value}`, c]))
  return [...uniq.values()]
}

export async function crawlContacts(http: PoliteFetcher, website: string, signal?: AbortSignal): Promise<FoundContact[]> {
  const res: FoundContact[] = []
  let home = ''
  try {
    const r = await http.fetch(website, { timeoutMs: 20000, maxBytes: 3_000_000, signal, retries: 1 })
    home = r.text
    res.push(...extractContacts(home, r.finalUrl))
    const origin = new URL(r.finalUrl).origin
    const links = [...home.matchAll(/<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
      .map((m) => ({ href: m[1], text: fold(m[2].replace(/<[^>]+>/g, ' ')) }))
      .filter((l) => /(iletisim|contact|bize ulas|hakkimizda|about)/.test(l.text + ' ' + fold(l.href)))
    const seen = new Set<string>()
    for (const l of links) {
      let u: string
      try {
        u = new URL(l.href, origin).toString()
      } catch {
        continue
      }
      if (!u.startsWith(origin) || seen.has(u)) continue
      seen.add(u)
      if (seen.size > 2) break
      try {
        const p = await http.fetch(u, { timeoutMs: 20000, maxBytes: 3_000_000, signal, retries: 0 })
        res.push(...extractContacts(p.text, p.finalUrl))
      } catch {
        /* sayfa okunamazsa atlanır */
      }
    }
  } catch {
    return res
  }
  const uniq = new Map(res.map((c) => [`${c.type}:${c.value}`, c]))
  return [...uniq.values()]
}
