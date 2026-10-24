// Metin normalizasyonu: Türkçe karakter katlama, dosya adı üretimi, telefon/e-posta/alan adı anahtarları.

const TR_MAP: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', İ: 'i', ö: 'o', ş: 's', ü: 'u', Ç: 'c', Ğ: 'g', Ö: 'o', Ş: 's', Ü: 'u', â: 'a', î: 'i', û: 'u' }

/** Küçük harfe çevirir, Türkçe karakterleri ASCII karşılığına katlar. */
export function fold(s: string): string {
  return s
    .replace(/[çğıİöşüÇĞÖŞÜâîû]/g, (c) => TR_MAP[c] ?? c)
    .toLocaleLowerCase('tr-TR')
    .replace(/[ıİ]/g, 'i')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
}

const COMPANY_SUFFIXES = /\b(ltd|sti|şti|a\.?s|anonim|limited|sirketi|şirketi|ticaret|tic|san|sanayi|ve|insaat|inşaat|yapi|yapı|ins|gayrimenkul|ltd\.?sti)\b\.?/g

/** Şirket adını tekrar kontrolü için anahtar hâline getirir ("ABC İnşaat Ltd. Şti." → "abc"). */
export function companyNameKey(name: string): string {
  const f = fold(name).replace(/[^a-z0-9\s.]/g, ' ')
  const stripped = f.replace(COMPANY_SUFFIXES, ' ').replace(/[.\s]+/g, ' ').trim()
  return (stripped || f.replace(/\s+/g, ' ').trim()).slice(0, 80)
}

/** Güvenli, çakışmasız klasör/dosya adı parçası (Windows ve macOS'ta geçerli). */
export function safeSlug(s: string, max = 60): string {
  const out = fold(s)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '')
  return out || 'adsiz'
}

/** Klasör adı için Türkçe başlığı koruyarak yalnızca yasaklı karakterleri temizler. */
export function safeFolderName(s: string, max = 60): string {
  const cleaned = s
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '')
    .slice(0, max)
  const reserved = /^(con|prn|aux|nul|com\d|lpt\d)$/i
  return !cleaned || reserved.test(cleaned) ? `_${cleaned || 'adsiz'}` : cleaned
}

/** Telefonu E.164 benzeri anahtara çevirir (TR varsayılan). Geçersizse boş döner. */
export function phoneKey(raw: string): string {
  let d = raw.replace(/[^\d+]/g, '')
  if (d.startsWith('+')) d = d.slice(1)
  else if (d.startsWith('00')) d = d.slice(2)
  else if (d.startsWith('0')) d = '90' + d.slice(1)
  else if (d.length === 10) d = '90' + d
  return d.length >= 11 && d.length <= 15 ? d : ''
}

/** Türk cep telefonu mu? (WhatsApp için tek başına yeterli kanıt değildir.) */
export function isTrMobile(key: string): boolean {
  return /^905\d{9}$/.test(key)
}

export function formatPhone(key: string): string {
  if (/^90\d{10}$/.test(key)) return `+90 ${key.slice(2, 5)} ${key.slice(5, 8)} ${key.slice(8, 10)} ${key.slice(10)}`
  return key ? `+${key}` : ''
}

export function emailKey(raw: string): string {
  const e = raw.trim().toLowerCase().replace(/^mailto:/, '').split('?')[0]
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(e) ? e : ''
}

/** Kişisel e-posta sağlayıcısı mı? (Kurumsal e-posta kullanımı güven bulgusu için.) */
export const FREE_MAIL = /@(gmail|hotmail|outlook|live|yahoo|yandex|icloud|mail|msn|windowslive|outlook\.com)\./i

export function domainOf(url: string | null | undefined): string {
  if (!url) return ''
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`)
    return u.hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
}

/** Sosyal medya / rehber / pazar yeri adresleri "resmî web sitesi" sayılmaz. */
export const NON_OFFICIAL_HOSTS = /(^|\.)(facebook|instagram|twitter|x|linkedin|youtube|tiktok|sahibinden|hepsiburada|trendyol|n11|google|goo\.gl|wa\.me|whatsapp|yandex|foursquare|tripadvisor|yelp|zomato|yemeksepeti|getir|linktr\.ee|sites\.google|business\.site|blogspot|wixsite|armut|bionluk|firmasec|bulurum|rehber|yellowpages|cylex|kariyer|emlakjet|hepsiemlak|zingat)\./i

export function isOfficialWebsite(url: string | null | undefined): boolean {
  const d = domainOf(url)
  if (!d) return false
  return !NON_OFFICIAL_HOSTS.test(`.${d}.`)
}

export function normalizeWebsite(url: string | null | undefined): string | null {
  if (!url) return null
  const raw = url.trim()
  if (!raw) return null
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
    if (!/^https?:$/.test(u.protocol)) return null
    u.hash = ''
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|gclid|fbclid)/i.test(k)) u.searchParams.delete(k)
    return u.toString().replace(/\/$/, '')
  } catch {
    return null
  }
}

/** İşletme adlarındaki emoji ve süs karakterlerini temizler ("🛠️ Maker Mimarlık ☀️" → "Maker Mimarlık"). */
export function cleanBusinessName(s: string): string {
  return s
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}]/gu, '')
    .replace(/[★☆✓✔•◆◇■□▶►]+/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s\-–|·&]+|[\s\-–|·&]+$/g, '')
    .trim()
}

export function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}
