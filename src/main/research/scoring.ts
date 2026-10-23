// Fırsat puanı (0–100): şirketin UcaMedya hizmetleri açısından ne kadar uygun bir aday olduğunu
// gösterir. Mali güç veya satın alma niyeti BİLİNMEZ; puan yalnızca gözlemlenen işaretlerden hesaplanır
// ve her bileşenin gerekçesi kaydedilir.

import type { AppSettings } from '@shared/types'

export interface ScoreInput {
  websiteStatus: string // none | ok | unreachable | blocked_robots | error | unknown
  overall: number | null // site analiz genel puanı (yüksek = iyi site)
  findings: { category: string; severity: string; serviceKey: string | null; code: string }[]
  businessStatus: string | null
  ratingCount: number | null
  copyrightYear: number | null
  contacts: { type: string; kind: string; sourceType: string | null }[]
  customerTypes: string[]
  stageKey: string
  suppressed: boolean
  contactedBefore: boolean
  isCustomer: boolean
}

export interface ScoreResult {
  score: number
  group: string
  reasons: { label: string; points: number; max: number; note: string }[]
  services: string[]
}

const SEV_PTS: Record<string, number> = { high: 3, medium: 2, low: 1, info: 0 }

const TYPE_TO_CODES: Record<string, RegExp> = {
  outdated: /design_outdated/,
  mobile: /^mobile_/,
  slow: /^perf_(lighthouse_low|lcp|heavy|ttfb)/,
  visual: /design_(upscaled_images|low_contrast)/,
  seo: /^seo_/,
  conversion: /^ux_(no_cta_fold|contact_hard|no_form)/,
  identity: /(design_many_fonts|design_many_colors|trust_free_email|design_button)/,
  ecommerce: /$^/
}

export function computeOpportunity(i: ScoreInput, s: AppSettings['scoring']): ScoreResult {
  const w = s.weights
  const total = w.improvementNeed + w.serviceFit + w.activeSignals + w.contactValidity + w.opportunitySignals || 1
  const norm = (x: number) => (x / total) * 100
  const reasons: ScoreResult['reasons'] = []
  const services = new Set<string>()

  // 1) Geliştirme ihtiyacı
  let need = 0
  let needNote = ''
  if (i.websiteStatus === 'none') {
    need = 1
    needNote = 'Web sitesi bulunamadı: yeni site ihtiyacı yüksek olabilir.'
    services.add('corporate_web')
  } else if (i.overall != null) {
    need = Math.max(0, Math.min(1, (100 - i.overall) / 60))
    needNote = `Site analiz puanı ${i.overall}/100.`
  } else if (i.websiteStatus === 'unreachable') {
    need = 0.5
    needNote = 'Site erişilemedi; geçici bir sorun olabilir, kesin değerlendirme yapılamadı.'
  } else needNote = 'Site henüz analiz edilmedi.'
  reasons.push({ label: 'Web sitesinin geliştirilme ihtiyacı', points: Math.round(norm(need * w.improvementNeed)), max: Math.round(norm(w.improvementNeed)), note: needNote })

  // 2) Hizmet uyumu
  const sevSum = i.findings.reduce((acc, f) => acc + (SEV_PTS[f.severity] ?? 0), 0)
  for (const f of i.findings) if (f.serviceKey && (f.severity === 'high' || f.severity === 'medium')) services.add(f.serviceKey)
  const fit = i.websiteStatus === 'none' ? 1 : Math.min(1, sevSum / 12)
  reasons.push({ label: 'UcaMedya hizmetleriyle uyum', points: Math.round(norm(fit * w.serviceFit)), max: Math.round(norm(w.serviceFit)), note: services.size ? `İlgili hizmetler: ${[...services].join(', ')}` : 'Belirgin hizmet fırsatı tespit edilmedi.' })

  // 3) Aktiflik işaretleri
  let act = 0
  const actNotes: string[] = []
  if (i.businessStatus === 'OPERATIONAL') {
    act += 0.5
    actNotes.push('arama sağlayıcısına göre faaliyette')
  } else if (i.businessStatus && /CLOSED/.test(i.businessStatus)) actNotes.push('arama sağlayıcısı kapalı olarak gösteriyor')
  if ((i.ratingCount ?? 0) >= 5) {
    act += 0.25
    actNotes.push(`${i.ratingCount} değerlendirme`)
  }
  if (i.websiteStatus === 'ok') act += 0.15
  if (i.copyrightYear && i.copyrightYear >= new Date().getFullYear() - 1) {
    act += 0.1
    actNotes.push(`sitede güncel yıl (${i.copyrightYear})`)
  }
  act = Math.min(1, act)
  reasons.push({ label: 'Şirketin aktif olduğuna dair işaretler', points: Math.round(norm(act * w.activeSignals)), max: Math.round(norm(w.activeSignals)), note: actNotes.join(', ') || 'Güvenilir aktiflik işareti yok.' })

  // 4) İletişim kanalı geçerliliği
  const corp = i.contacts.filter((c) => c.kind === 'corporate')
  const hasEmail = corp.some((c) => c.type === 'email')
  const hasPhone = corp.some((c) => c.type === 'phone' || c.type === 'whatsapp')
  const fromSite = corp.some((c) => c.sourceType === 'website')
  const cv = (hasEmail ? 0.5 : 0) + (hasPhone ? 0.3 : 0) + (fromSite ? 0.2 : 0)
  reasons.push({ label: 'İletişim kanalının geçerliliği', points: Math.round(norm(cv * w.contactValidity)), max: Math.round(norm(w.contactValidity)), note: `${hasEmail ? 'kurumsal e-posta var' : 'e-posta yok'}, ${hasPhone ? 'telefon var' : 'telefon yok'}${fromSite ? ', şirketin kendi sitesinden doğrulandı' : ''}` })

  // 5) Hedeflenen fırsat türleriyle eşleşme
  let matched = 0
  const matchedTypes: string[] = []
  for (const t of i.customerTypes) {
    if (t === 'no_website' && i.websiteStatus === 'none') {
      matched++
      matchedTypes.push('web sitesi yok')
      continue
    }
    const re = TYPE_TO_CODES[t]
    if (re && i.findings.some((f) => re.test(f.code))) {
      matched++
      matchedTypes.push(t)
    }
  }
  const opp = i.customerTypes.length ? matched / i.customerTypes.length : Math.min(1, i.findings.filter((f) => f.severity !== 'low').length / 4)
  reasons.push({ label: 'Gözlemlenen hizmet fırsatları', points: Math.round(norm(opp * w.opportunitySignals)), max: Math.round(norm(w.opportunitySignals)), note: i.customerTypes.length ? `Hedeflenen ${i.customerTypes.length} fırsat türünden ${matched} tanesi gözlemlendi${matchedTypes.length ? ` (${matchedTypes.join(', ')})` : ''}.` : 'Hedef fırsat türü seçilmedi; orta/yüksek önemli bulgu sayısına göre.' })

  const score = Math.max(0, Math.min(100, reasons.reduce((a, r) => a + r.points, 0)))

  let group: string
  if (i.suppressed || i.stageKey === 'do_not_contact') group = 'opted_out'
  else if (i.isCustomer) group = 'not_suitable'
  else if (i.contactedBefore) group = 'contacted_before'
  else if (i.businessStatus && /CLOSED/.test(i.businessStatus)) group = 'not_suitable'
  else if (!hasEmail && !hasPhone) group = 'needs_research'
  else if (i.websiteStatus !== 'none' && i.overall == null) group = 'needs_research'
  else if (score >= s.priorityThreshold) group = 'priority'
  else if (score >= s.highFitThreshold) group = 'high_fit'
  else group = 'mid_fit'
  if (i.websiteStatus === 'none') services.add('identity')
  return { score, group, reasons, services: [...services] }
}
