// Dış bağlantı güvenliği: yalnızca http(s), yerel ağ adresleri engellenir (SSRF koruması).

import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

const PRIVATE_HOST = /^(localhost|.*\.local|.*\.internal|127\.|10\.|192\.168\.|169\.254\.|0\.0\.0\.0|\[?::1\]?$|172\.(1[6-9]|2\d|3[01])\.)/i

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
}

/** Ağ isteği atılabilecek güvenli bir dış http(s) adresi mi? (yerel ağ adresleri engellenir) */
export function isSafeExternalUrl(url: string): boolean {
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
    if (PRIVATE_HOST.test(u.hostname)) return false
    if (u.username || u.password) return false
    return true
  } catch {
    return false
  }
}

function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number)
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
  }
  const l = ip.toLowerCase()
  return l === '::1' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe80') || l.startsWith('::ffff:127.') || l.startsWith('::ffff:10.') || l.startsWith('::ffff:192.168.')
}

/** Ad çözümlemesi yaparak adresin yerel ağa işaret etmediğini doğrular (tarayıcıyla ziyaret öncesi). */
export async function assertPublicHost(url: string): Promise<void> {
  if (!isSafeExternalUrl(url)) throw new Error('Geçersiz veya yerel ağa ait adres; güvenlik nedeniyle ziyaret edilmez.')
  const host = new URL(url).hostname.replace(/^\[|\]$/g, '')
  if (isIP(host)) {
    if (isPrivateIp(host)) throw new Error('Yerel ağ adresi; güvenlik nedeniyle ziyaret edilmez.')
    return
  }
  const addrs = await lookup(host, { all: true }).catch(() => [])
  if (!addrs.length) throw new Error(`Alan adı çözümlenemedi (${host}). Site kapalı veya adres hatalı olabilir.`)
  if (addrs.some((a) => isPrivateIp(a.address))) throw new Error('Alan adı yerel ağ adresine yönleniyor; güvenlik nedeniyle ziyaret edilmez.')
}

/** Kullanıcının varsayılan tarayıcısında açılabilecek adres mi? */
export function isOpenableUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return (u.protocol === 'https:' || u.protocol === 'http:') && !u.username && !u.password && url.length < 4000
  } catch {
    return false
  }
}

export function absoluteUrl(href: string, base: string): string | null {
  try {
    return new URL(href, base).toString()
  } catch {
    return null
  }
}
