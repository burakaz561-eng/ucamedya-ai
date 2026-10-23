export const fmtDate = (s?: string | null, withTime = false) => {
  if (!s) return '—'
  const d = new Date(s)
  if (isNaN(d.getTime())) return s
  return d.toLocaleString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric', ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}) })
}

export const fmtRel = (s?: string | null) => {
  if (!s) return '—'
  const diff = (Date.now() - new Date(s).getTime()) / 1000
  if (diff < 60) return 'az önce'
  if (diff < 3600) return `${Math.floor(diff / 60)} dk önce`
  if (diff < 86400) return `${Math.floor(diff / 3600)} sa önce`
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} gün önce`
  return fmtDate(s)
}

export const fmtMoney = (n: number | null | undefined, cur = 'TRY') => (n == null ? '—' : new Intl.NumberFormat('tr-TR', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(n))
export const fmtNum = (n: number | null | undefined) => (n == null ? '—' : new Intl.NumberFormat('tr-TR').format(n))
export const fmtBytes = (b?: number | null) => (b == null ? '—' : b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`)

export const scoreTone = (s: number | null | undefined) => (s == null ? 'neutral' : s >= 70 ? 'success' : s >= 45 ? 'warning' : 'danger')
/** Fırsat puanında yüksek = iyi fırsat (marka rengi). */
export const oppTone = (s: number | null | undefined) => (s == null ? 'neutral' : s >= 70 ? 'brand' : s >= 50 ? 'info' : 'neutral')

export const GROUP_LABELS: Record<string, string> = {
  priority: 'Öncelikli inceleme', high_fit: 'Yüksek hizmet uyumu', mid_fit: 'Orta düzey uyum', needs_research: 'Ek araştırma gerekiyor',
  not_suitable: 'İletişim için uygun değil', contacted_before: 'Daha önce iletişim kurulmuş', opted_out: 'İletişim istemiyor'
}
export const GROUP_TONE: Record<string, string> = { priority: 'brand', high_fit: 'success', mid_fit: 'info', needs_research: 'warning', not_suitable: 'neutral', contacted_before: 'neutral', opted_out: 'danger' }

export const SITE_STATUS: Record<string, [string, string]> = {
  unknown: ['Kontrol edilmedi', 'neutral'], none: ['Web sitesi yok', 'warning'], ok: ['Analiz edildi', 'success'],
  unreachable: ['Erişilemedi', 'danger'], blocked_robots: ['robots.txt izin vermiyor', 'neutral'], error: ['Analiz hatası', 'danger']
}

export const RUN_STATUS: Record<string, [string, string]> = {
  queued: ['Sırada', 'neutral'], running: ['Çalışıyor', 'brand'], paused: ['Duraklatıldı', 'warning'], completed: ['Tamamlandı', 'success'],
  failed: ['Başarısız', 'danger'], cancelled: ['İptal edildi', 'neutral'], interrupted: ['Yarıda kaldı', 'warning'], draft: ['Taslak', 'neutral']
}

export const MSG_STATUS: Record<string, [string, string]> = {
  queued: ['Kuyrukta', 'neutral'], sending: ['Gönderiliyor', 'brand'], sent: ['Gönderildi', 'success'], delivered: ['Teslim edildi', 'success'], read: ['Okundu', 'success'],
  failed: ['Başarısız', 'danger'], cancelled: ['İptal', 'neutral'], blocked: ['Engellendi', 'danger'], test_sent: ['Test gönderimi', 'info'], manual_opened: ['WhatsApp\'ta açıldı', 'warning']
}

export const DRAFT_STATUS: Record<string, [string, string]> = {
  draft: ['Onay bekliyor', 'warning'], approved: ['Onaylandı', 'success'], queued: ['Kuyrukta', 'brand'], sent: ['Gönderildi', 'success'], rejected: ['Reddedildi', 'neutral']
}

export const JOB_TYPES: Record<string, string> = { research: 'Araştırma', analysis: 'Site analizi', drafts: 'Taslak üretimi', outreach: 'Gönderim', backup: 'Yedekleme', reply_sync: 'Yanıt kontrolü', research_report: 'Araştırma raporu' }
