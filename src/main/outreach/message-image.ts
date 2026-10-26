// Mesaj görseli: kullanıcının seçtiği kampanya görseli (PNG/JPG). E-postaya ek olarak eklenir; WhatsApp masaüstü
// uygulaması dışarıdan dosya eklemeye izin vermediği için görsel panoya kopyalanır ve kullanıcı sohbete yapıştırır.

import { existsSync, readFileSync, statSync } from 'node:fs'
import { extname } from 'node:path'

export const IMAGE_EXTS = ['png', 'jpg', 'jpeg']
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024

export function validImage(path: string | null | undefined): path is string {
  if (!path || !existsSync(path)) return false
  if (!IMAGE_EXTS.includes(extname(path).slice(1).toLowerCase())) return false
  return statSync(path).size <= IMAGE_MAX_BYTES
}

/** Önizleme için küçük veri adresi (yalnızca uygulama içinde gösterilir) */
export function imageDataUri(path: string | null | undefined): string | null {
  if (!validImage(path)) return null
  const ext = extname(path).slice(1).toLowerCase()
  return `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${readFileSync(path).toString('base64')}`
}

/** Kanala göre bu mesaja görsel eklenecek mi? */
export function imageFor(channel: 'email' | 'whatsapp', img: { path: string; email: boolean; whatsapp: boolean } | undefined): string | null {
  if (!img || !validImage(img.path)) return null
  return (channel === 'email' ? img.email : img.whatsapp) ? img.path : null
}
