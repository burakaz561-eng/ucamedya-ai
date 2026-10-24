// Mesaj alıcısı seçimi: şirketin iletişim bilgilerini kanala göre sıralar (saf fonksiyonlar, test edilebilir).

export interface ContactRow {
  type: string
  value: string
  value_key: string
  kind: string
  source_type: string | null
  source_url: string | null
  label: string | null
}

/**
 * İletişim bilgilerini kanala göre en uygundan en az uyguna sıralar.
 * WhatsApp: sitedeki WhatsApp bağlantısı → iletişim sayfasındaki cep → sitedeki cep → Google kaydındaki cep →
 *           diğer cepler → sabit hatlar ("WhatsApp yok" işaretlileri ve kişisel numaraları sona atar).
 * E-posta: şirketin kendi alan adındaki kurumsal adres (iletişim sayfası önce) → diğer kurumsal → ücretsiz/kişisel.
 */
export function rankContacts(rows: ContactRow[], channel: 'email' | 'whatsapp', domain: string | null): ContactRow[] {
  const fromContactPage = (r: ContactRow) => /iletisim|iletişim|contact|bize-ulas/i.test(r.source_url ?? '')
  const score = (r: ContactRow): number => {
    let sc = 0
    if (r.kind === 'personal') sc -= 50
    if (channel === 'email') {
      if (r.type !== 'email') return -1000
      const dom = r.value_key.split('@')[1] ?? ''
      if (domain && (dom === domain || dom.endsWith('.' + domain))) sc += 40
      if (r.source_type === 'website') sc += 15
      if (fromContactPage(r)) sc += 10
      if (/^(info|iletisim|bilgi|contact|satis|sales|hello|merhaba)@/.test(r.value_key)) sc += 5
      return sc
    }
    if (r.type === 'email') return -1000
    if (/WhatsApp yok/i.test(r.label ?? '')) sc -= 100
    if (r.type === 'whatsapp') sc += 60
    if (/^905\d{9}$/.test(r.value_key)) sc += 30
    if (r.source_type === 'website') sc += 10
    if (fromContactPage(r)) sc += 8
    if (r.source_type === 'provider') sc += 5
    return sc
  }
  return rows.filter((r) => score(r) > -1000).sort((a, b) => score(b) - score(a))
}

export function contactSourceLabel(r: ContactRow): string {
  if (r.source_type === 'website') return `şirketin web sitesi${r.source_url ? ` (${r.source_url})` : ''}`
  if (r.source_type === 'provider') return 'Google işletme kaydı'
  if (r.source_type === 'import') return 'CSV içe aktarma'
  if (r.source_type === 'manual') return 'elle eklendi'
  return r.source_type ?? 'bilinmiyor'
}
