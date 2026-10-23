// Ölçümlerden bulgu ve kategori puanı üreten saf (yan etkisiz) kurallar. Birim testleri bu dosyayı sınar.
// İlke: yalnızca ölçülen değerden bulgu üretilir. Ölçülemeyen kriter puana katılmaz ve güven düzeyini düşürür.

import type { CategoryScore, FindingDraft, TestRecord } from '@shared/types'
import type { FindingCategory } from '@shared/constants'
import { FREE_MAIL, domainOf, fold } from '@shared/text'

/* eslint-disable @typescript-eslint/no-explicit-any */
export type PageData = any

export interface SiteChecks {
  https: boolean
  httpRedirectsToHttps: boolean | null
  robotsTxt: { status: number | null; disallowAll: boolean } | null
  sitemap: { found: boolean; url?: string; urls?: number } | null
  brokenLinks: { checked: number; broken: { url: string; status: number | string }[] } | null
  consoleErrors: number
  failedRequests: { url: string; status: number }[]
  mixedContent: number
  certificateError?: string
}

export interface PsiResult {
  strategy: 'mobile' | 'desktop'
  performance: number | null
  accessibility: number | null
  seo: number | null
  bestPractices: number | null
  lab: { lcp?: number; cls?: number; tbt?: number; fcp?: number; si?: number; tti?: number }
  field: { lcp?: number; cls?: number; inp?: number; category?: string } | null
  fetchedAt: string
}

export interface AnalysisInput {
  desktop: PageData | null
  mobile: PageData | null
  pages: { kind: string; url: string; desktop: PageData | null }[]
  site: SiteChecks
  psi: PsiResult | null
  siteDomain: string
}

type Crit = { cat: FindingCategory; label: string; passed: boolean | null; weight: number; note?: string }

const PAGE_KIND_RE: Record<string, RegExp> = {
  about: /(hakkimizda|kurumsal|biz kimiz|about)/,
  services: /(hizmet|cozum|urun|services|solutions|products|faaliyet)/,
  contact: /(iletisim|bize ulas|contact)/,
  references: /(referans|proje|portfoy|galeri|calismalar|work|projects|clients|musteri)/,
  privacy: /(gizlilik|kvkk|kisisel veri|aydinlatma|privacy|cerez|cookie)/,
  blog: /(blog|haber|duyuru|news)/
}

export function findPageLinks(home: PageData, siteDomain: string): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {}
  const links: { href: string; text: string; inNav: boolean }[] = home?.links ?? []
  for (const [kind, re] of Object.entries(PAGE_KIND_RE)) {
    const cands = links.filter((l) => {
      if (domainOf(l.href) !== siteDomain) return false
      let path = ''
      try {
        path = decodeURIComponent(new URL(l.href).pathname)
      } catch {
        path = l.href
      }
      return re.test(fold(l.text)) || re.test(fold(path))
    })
    const best = cands.sort((a, b) => Number(b.inNav) - Number(a.inNav))[0]
    out[kind] = best?.href.split('#')[0]
  }
  return out
}

const fmtMs = (ms?: number) => (ms == null ? '—' : ms >= 1000 ? `${(ms / 1000).toFixed(1)} sn` : `${Math.round(ms)} ms`)

export function evaluate(input: AnalysisInput, categoryWeights?: Partial<Record<FindingCategory, number>>) {
  const f: FindingDraft[] = []
  const crit: Crit[] = []
  const tests: TestRecord[] = []
  const d = input.desktop
  const m = input.mobile
  const add = (x: FindingDraft) => f.push(x)
  const c = (cat: FindingCategory, label: string, passed: boolean | null, weight = 1, note?: string) => crit.push({ cat, label, passed, weight, note })

  // ---------------- B. Mobil ----------------
  if (m) {
    tests.push({ key: 'mobile_render', label: 'Mobil görünüm (390 px)', status: 'done' })
    const vp = m.viewport
    const hasViewport = !!vp.meta && /width\s*=\s*device-width/i.test(vp.meta)
    c('mobile', 'Viewport meta etiketi', hasViewport, 2)
    if (!hasViewport) add({ category: 'mobile', code: 'mobile_no_viewport', title: 'Mobil ölçekleme etiketi eksik', evidence: `viewport meta: ${vp.meta ?? 'yok'}`, detail: 'Sayfa mobil cihazlarda masaüstü genişliğinde açılıp küçültülerek gösteriliyor olabilir.', severity: 'high', certainty: 'measured', recommendation: 'Sayfaya <meta name="viewport" content="width=device-width, initial-scale=1"> eklenmeli ve yerleşim duyarlı (responsive) hâle getirilmeli.', serviceKey: 'redesign', pageUrl: m.url, screenshotKey: 'home-mobile' })
    const overflowPx = vp.scrollWidth - vp.w
    c('mobile', 'Yatay taşma yok', overflowPx <= 4, 2)
    if (overflowPx > 4) add({ category: 'mobile', code: 'mobile_overflow', title: 'Mobilde içerik ekran dışına taşıyor', evidence: `Sayfa genişliği ${vp.scrollWidth}px, ekran ${vp.w}px (${overflowPx}px yatay kaydırma). Taşan öğeler: ${m.overflow.slice(0, 3).map((o: any) => o.sel).join(', ') || 'belirlenemedi'}`, severity: overflowPx > 40 ? 'high' : 'medium', certainty: 'measured', recommendation: 'Taşan bölümlerin genişlikleri yüzde/esnek değerlere çevrilmeli, görseller max-width:100% ile sınırlandırılmalı.', serviceKey: 'redesign', pageUrl: m.url, screenshotKey: 'issue-overflow' })
    const smallRatio = m.text.elements ? m.text.small / m.text.elements : 0
    c('mobile', 'Okunabilir yazı boyutu (≥12px)', smallRatio < 0.15, 1.5, `${Math.round(smallRatio * 100)}% küçük metin`)
    if (smallRatio >= 0.15) add({ category: 'mobile', code: 'mobile_small_text', title: 'Mobilde okunması zor küçük yazılar', evidence: `Görünür metin bloklarının %${Math.round(smallRatio * 100)}'i 12px'ten küçük (${m.text.small}/${m.text.elements}). Örnek: ${m.text.smallSamples.map((s: any) => `"${s.text}" ${s.size}px`).slice(0, 2).join('; ')}`, severity: smallRatio > 0.35 ? 'high' : 'medium', certainty: 'measured', recommendation: 'Gövde metni mobilde en az 16px, yardımcı metinler en az 12-13px olmalı.', serviceKey: 'redesign', pageUrl: m.url, screenshotKey: 'home-mobile' })
    const tRatio = m.targets.total ? m.targets.small / m.targets.total : 0
    c('mobile', 'Dokunma alanları yeterli (≥32px)', tRatio < 0.25, 1, `${m.targets.small}/${m.targets.total} küçük`)
    if (tRatio >= 0.25 && m.targets.small >= 5) add({ category: 'mobile', code: 'mobile_small_targets', title: 'Mobilde dokunulması zor küçük bağlantı ve butonlar', evidence: `${m.targets.total} tıklanabilir öğenin ${m.targets.small} tanesi 32×32px'ten küçük. Örnek: ${m.targets.samples.slice(0, 3).map((s: any) => `"${s.text || s.sel}" ${s.w}×${s.h}`).join('; ')}`, severity: 'medium', certainty: 'measured', recommendation: 'Mobilde buton ve menü öğeleri en az 44×44px dokunma alanına sahip olmalı.', serviceKey: 'redesign', pageUrl: m.url })
    const navUsable = m.hamburger || m.navLinks <= 7
    c('mobile', 'Mobil menü kullanılabilir', navUsable, 1)
    if (!navUsable) add({ category: 'mobile', code: 'mobile_menu', title: 'Mobil için ayrı bir menü yapısı tespit edilmedi', evidence: `Mobil görünümde ${m.navLinks} menü bağlantısı açık hâlde, açılır menü düğmesi bulunamadı.`, severity: 'medium', certainty: 'heuristic', recommendation: 'Mobilde açılır (hamburger) menü kullanılmalı.', serviceKey: 'redesign', pageUrl: m.url, screenshotKey: 'home-mobile' })
    const formsSmall = m.forms.reduce((s: number, x: any) => s + x.smallFont, 0)
    if (m.forms.length) {
      c('mobile', 'Form alanları mobilde rahat kullanılır', formsSmall === 0, 0.5)
      if (formsSmall > 0) add({ category: 'mobile', code: 'mobile_form_zoom', title: 'Form alanları mobilde yakınlaştırmaya neden oluyor', evidence: `${formsSmall} form alanının yazı boyutu 16px'ten küçük (iOS'ta otomatik yakınlaştırma tetiklenir).`, severity: 'low', certainty: 'measured', recommendation: 'Form alanlarının yazı boyutu en az 16px yapılmalı.', serviceKey: 'redesign', pageUrl: m.url })
    }
    const mobileContact = m.contacts.tels.length > 0 || m.contacts.whatsappLinks.length > 0
    c('mobile', 'Mobilde tek dokunuşla arama/WhatsApp', mobileContact, 1)
    if (!mobileContact) add({ category: 'mobile', code: 'mobile_no_tap_contact', title: 'Mobilde tek dokunuşla arama bağlantısı yok', evidence: 'Sayfada tel: veya WhatsApp bağlantısı bulunamadı.', severity: 'medium', certainty: 'measured', recommendation: 'Telefon numarası tel: bağlantısı olarak, mümkünse sabit bir "Ara / WhatsApp" düğmesiyle sunulmalı.', serviceKey: 'redesign', pageUrl: m.url })
  } else tests.push({ key: 'mobile_render', label: 'Mobil görünüm', status: 'failed', note: 'Sayfa mobil görünümde açılamadı.' })

  // ---------------- A. Görsel tasarım ----------------
  if (d) {
    tests.push({ key: 'desktop_render', label: 'Masaüstü görünüm (1440 px)', status: 'done' })
    const im = d.images
    c('design', 'Görseller net (büyütülmemiş)', im.upscaled === 0, 1.5, `${im.upscaled} büyütülmüş görsel`)
    if (im.upscaled > 0) add({ category: 'design', code: 'design_upscaled_images', title: 'Düşük çözünürlüklü (büyütülerek gösterilen) görseller', evidence: `${im.upscaled} görsel, gerçek çözünürlüğünden daha büyük gösteriliyor. Örnek: ${im.upscaledSamples.slice(0, 2).map((s: any) => `${s.natural} → ${s.shown} px`).join('; ')}`, detail: 'Görseller ekranda bulanık veya pikselli görünebilir.', severity: im.upscaled >= 3 ? 'medium' : 'low', certainty: 'measured', recommendation: 'Daha yüksek çözünürlüklü, markaya uygun görseller kullanılmalı (gösterim boyutunun en az 2 katı).', serviceKey: 'content', pageUrl: d.url, screenshotKey: 'issue-image' })
    const fams = d.text.families.filter(([n]: [string]) => !/icon|awesome|dashicons|material|glyph|eicons|fa-/i.test(n))
    c('design', 'Tutarlı yazı tipi kullanımı (≤3 aile)', fams.length <= 3, 1, `${fams.length} yazı tipi`)
    if (fams.length > 3) add({ category: 'design', code: 'design_many_fonts', title: 'Tutarsız tipografi: çok sayıda yazı tipi', evidence: `Sayfada ${fams.length} farklı yazı tipi ailesi kullanılıyor: ${fams.slice(0, 5).map((x: any) => x[0]).join(', ')}`, severity: 'low', certainty: 'measured', recommendation: 'En fazla 2 yazı tipi ailesiyle tutarlı bir tipografi sistemi kurulmalı.', serviceKey: 'identity', pageUrl: d.url })
    c('design', 'Metin renk sayısı makul', d.text.colors <= 10, 0.5, `${d.text.colors} metin rengi`)
    if (d.text.colors > 12) add({ category: 'design', code: 'design_many_colors', title: 'Tutarsız renk kullanımı', evidence: `Metinlerde ${d.text.colors} farklı renk tespit edildi.`, severity: 'low', certainty: 'heuristic', recommendation: 'Sınırlı bir marka renk paleti tanımlanmalı ve tüm sayfalarda uygulanmalı.', serviceKey: 'identity', pageUrl: d.url })
    const lcRatio = d.text.contrastChecked ? d.text.lowContrast / d.text.contrastChecked : 0
    c('design', 'Metin kontrastı yeterli (WCAG AA)', lcRatio < 0.1, 1.5, `%${Math.round(lcRatio * 100)} düşük kontrast`)
    if (lcRatio >= 0.1 && d.text.lowContrast >= 3) add({ category: 'design', code: 'design_low_contrast', title: 'Okunması zor, düşük kontrastlı metinler', evidence: `${d.text.contrastChecked} metin bloğunun ${d.text.lowContrast} tanesi WCAG AA kontrast oranının altında. Örnek: ${d.text.lowContrastSamples.slice(0, 2).map((s: any) => `"${s.text}" (oran ${s.ratio}:1)`).join('; ')}`, severity: lcRatio > 0.25 ? 'medium' : 'low', certainty: 'measured', recommendation: 'Metin ve arka plan renkleri en az 4.5:1 kontrast oranı sağlayacak şekilde düzenlenmeli.', serviceKey: 'redesign', pageUrl: d.url })
    const dense = d.text.aboveFoldWords > 260
    c('design', 'İlk ekranda metin yoğunluğu dengeli', !dense, 0.5, `${d.text.aboveFoldWords} kelime`)
    if (dense) add({ category: 'design', code: 'design_text_dense', title: 'İlk ekranda yoğun metin', evidence: `Sayfa açıldığında görünen alanda yaklaşık ${d.text.aboveFoldWords} kelime var.`, severity: 'low', certainty: 'heuristic', recommendation: 'İlk ekranda kısa bir değer önerisi, net bir başlık ve tek bir ana eylem düğmesi kullanılmalı.', serviceKey: 'redesign', pageUrl: d.url, screenshotKey: 'home-desktop' })
    const h1ok = d.seo.h1.length === 1
    c('design', 'Net görsel hiyerarşi (tek ana başlık)', h1ok, 0.5)
    c('design', 'Tutarlı buton stilleri', d.buttonStyleVariants <= 6, 0.5, `${d.buttonStyleVariants} farklı buton stili`)
    if (d.buttonStyleVariants > 8) add({ category: 'design', code: 'design_button_inconsistent', title: 'Tutarsız buton tasarımları', evidence: `${d.buttonStyleVariants} farklı buton stili (köşe, renk, iç boşluk birleşimi) tespit edildi.`, severity: 'low', certainty: 'heuristic', recommendation: 'Birincil/ikincil buton stilleri tanımlanmalı ve tüm sitede aynı bileşen kullanılmalı.', serviceKey: 'redesign', pageUrl: d.url })
    const thisYear = new Date().getFullYear()
    const lg = d.legacy
    const legacySignals: string[] = []
    if (lg.copyrightYear && lg.copyrightYear < thisYear - 2) legacySignals.push(`telif yılı ${lg.copyrightYear}`)
    if (lg.jquery && /^1\.([0-8])\./.test(lg.jquery)) legacySignals.push(`eski jQuery ${lg.jquery}`)
    if (lg.layoutTables > 0) legacySignals.push('tablo tabanlı yerleşim')
    if (lg.font) legacySignals.push('eski HTML etiketleri (font/center/marquee)')
    if (lg.flash) legacySignals.push('Flash içerik')
    if (lg.frames) legacySignals.push('frame kullanımı')
    if (m && !(m.viewport.meta && /device-width/.test(m.viewport.meta))) legacySignals.push('mobil uyumsuz yerleşim')
    c('design', 'Güncel tasarım altyapısı', legacySignals.length === 0, 1.5, legacySignals.join(', ') || undefined)
    if (legacySignals.length) add({ category: 'design', code: 'design_outdated', title: 'Güncelliğini yitirmiş tasarım işaretleri', evidence: `Tespit edilen işaretler: ${legacySignals.join(', ')}.`, detail: 'Bu işaretler sitenin uzun süredir güncellenmediğini düşündürebilir; tek başına tasarımın kötü olduğunu kanıtlamaz.', severity: legacySignals.length >= 2 ? 'medium' : 'low', certainty: 'heuristic', recommendation: 'Güncel, mobil öncelikli bir tasarımla site yenilenmeli.', serviceKey: 'redesign', pageUrl: d.url, screenshotKey: 'home-desktop' })
  } else tests.push({ key: 'desktop_render', label: 'Masaüstü görünüm', status: 'failed', note: 'Sayfa açılamadı.' })

  // ---------------- C. Kullanıcı deneyimi ----------------
  const pagesByKind = Object.fromEntries(input.pages.map((p) => [p.kind, p]))
  if (d) {
    const ctaFold = d.cta.aboveFold.length > 0
    c('ux', 'İlk ekranda harekete geçirici buton', ctaFold, 2)
    if (!ctaFold) add({ category: 'ux', code: 'ux_no_cta_fold', title: 'Teklif / iletişim butonu ilk ekranda görünmüyor', evidence: d.cta.total ? `Sayfada ${d.cta.total} iletişim/teklif bağlantısı var, ancak hiçbiri ilk ekranda değil.` : 'Sayfada "teklif al", "iletişim", "bize ulaşın" gibi bir eylem düğmesi bulunamadı.', severity: 'high', certainty: 'measured', recommendation: 'İlk ekrana belirgin bir "Teklif Alın" / "Hemen Arayın" düğmesi eklenmeli.', serviceKey: 'redesign', pageUrl: d.url, screenshotKey: 'home-desktop' })
    const contactFound = !!pagesByKind.contact || d.contacts.tels.length + d.contacts.mailtos.length + d.contacts.phonesInText.length > 0
    c('ux', 'İletişim bilgisi kolay bulunuyor', contactFound, 1.5)
    if (!contactFound) add({ category: 'ux', code: 'ux_contact_hard', title: 'İletişim bilgilerine ulaşmak zor', evidence: 'Ana sayfada iletişim sayfası bağlantısı, telefon veya e-posta bulunamadı.', severity: 'high', certainty: 'measured', recommendation: 'Menüde "İletişim" sayfası ve sayfa altında telefon/e-posta/adres bilgisi yer almalı.', serviceKey: 'redesign', pageUrl: d.url })
    const anyForm = d.forms.length > 0 || (pagesByKind.contact?.desktop?.forms?.length ?? 0) > 0
    c('ux', 'Teklif / iletişim formu', anyForm, 1)
    if (!anyForm) add({ category: 'ux', code: 'ux_no_form', title: 'Teklif veya iletişim formu bulunamadı', evidence: 'Ana sayfada ve iletişim sayfasında form tespit edilmedi.', severity: 'medium', certainty: 'measured', recommendation: 'Kısa (3-4 alanlı) bir teklif isteme formu eklenmeli.', serviceKey: 'redesign', pageUrl: pagesByKind.contact?.url ?? d.url })
    const unlabeled = [...d.forms, ...(pagesByKind.contact?.desktop?.forms ?? [])].reduce((s: number, x: any) => s + x.unlabeled, 0)
    if (anyForm) c('ux', 'Form alanları etiketli', unlabeled === 0, 0.5)
    const navOk = d.navLinks >= 3 && d.navLinks <= 12
    c('ux', 'Anlaşılır navigasyon (3–12 menü öğesi)', navOk, 1, `${d.navLinks} menü bağlantısı`)
    if (!navOk) add({ category: 'ux', code: 'ux_nav', title: d.navLinks < 3 ? 'Menü yapısı yetersiz' : 'Menü çok kalabalık', evidence: `Üst menüde ${d.navLinks} bağlantı var.`, severity: 'low', certainty: 'heuristic', recommendation: 'Ana menü 5-8 net başlıkla sadeleştirilmeli (Hizmetler, Projeler, Hakkımızda, İletişim…).', serviceKey: 'redesign', pageUrl: d.url })
    c('ux', 'Hizmetler sayfası', !!pagesByKind.services, 1)
    if (!pagesByKind.services) add({ category: 'ux', code: 'ux_no_services_page', title: 'Hizmetler için ayrı bir sayfa bulunamadı', evidence: 'Menüde "Hizmetler / Ürünler / Çözümler" benzeri bir bağlantı tespit edilmedi.', severity: 'low', certainty: 'heuristic', recommendation: 'Her ana hizmet için açıklayıcı bir sayfa oluşturulmalı.', serviceKey: 'redesign', pageUrl: d.url })
  }

  // ---------------- D. Teknik performans ----------------
  const s = input.site
  c('performance', 'HTTPS kullanımı', s.https, 2)
  if (!s.https) add({ category: 'performance', code: 'perf_no_https', title: 'Site güvenli bağlantı (HTTPS) kullanmıyor', evidence: s.certificateError ? `Sertifika hatası: ${s.certificateError}` : 'Site http:// üzerinden açılıyor.', detail: 'Tarayıcılar "Güvenli değil" uyarısı gösterir; ziyaretçi güveni ve arama sıralaması olumsuz etkilenir.', severity: 'high', certainty: 'measured', recommendation: 'SSL sertifikası kurulmalı ve tüm trafik HTTPS\'e yönlendirilmeli.', serviceKey: 'maintenance' })
  if (s.mixedContent > 0) add({ category: 'performance', code: 'perf_mixed', title: 'Güvenli sayfada güvensiz (http) kaynaklar', evidence: `${s.mixedContent} kaynak http:// üzerinden yükleniyor.`, severity: 'low', certainty: 'measured', recommendation: 'Tüm kaynaklar https:// adresine taşınmalı.', serviceKey: 'maintenance' })
  if (input.psi) {
    const p = input.psi
    tests.push({ key: 'pagespeed', label: `PageSpeed Insights (${p.strategy === 'mobile' ? 'mobil' : 'masaüstü'})`, status: 'done', note: `Ölçüm: ${p.fetchedAt.slice(0, 16).replace('T', ' ')}` })
    if (p.performance != null) {
      c('performance', 'Lighthouse performans puanı ≥ 50', p.performance >= 50, 3, `${p.performance}/100`)
      if (p.performance < 50) add({ category: 'performance', code: 'perf_lighthouse_low', title: 'Mobil sayfa performansı düşük', evidence: `Lighthouse mobil performans puanı ${p.performance}/100. LCP ${fmtMs(p.lab.lcp)}, TBT ${fmtMs(p.lab.tbt)}, CLS ${p.lab.cls?.toFixed(2) ?? '—'}.`, severity: p.performance < 30 ? 'high' : 'medium', certainty: 'measured', recommendation: 'Görseller sıkıştırılmalı (WebP/AVIF), kullanılmayan betikler kaldırılmalı, önbellekleme yapılandırılmalı.', serviceKey: 'speed' })
    }
    if (p.lab.lcp != null) {
      c('performance', 'LCP ≤ 2,5 sn (laboratuvar)', p.lab.lcp <= 2500, 1.5, fmtMs(p.lab.lcp))
      if (p.lab.lcp > 4000 && !(p.performance != null && p.performance < 50)) add({ category: 'performance', code: 'perf_lcp', title: 'Ana içerik geç yükleniyor (LCP)', evidence: `En büyük içerik boyaması ${fmtMs(p.lab.lcp)} (hedef ≤ 2,5 sn).`, severity: 'medium', certainty: 'measured', recommendation: 'İlk ekrandaki büyük görsel optimize edilmeli ve öncelikli yüklenmeli.', serviceKey: 'speed' })
    }
    if (p.lab.cls != null) {
      c('performance', 'CLS ≤ 0,1 (düzen kayması)', p.lab.cls <= 0.1, 1, p.lab.cls.toFixed(3))
      if (p.lab.cls > 0.25) add({ category: 'performance', code: 'perf_cls', title: 'Sayfa yüklenirken içerik kayıyor (CLS)', evidence: `Kümülatif düzen kayması ${p.lab.cls.toFixed(2)} (hedef ≤ 0,1).`, severity: 'medium', certainty: 'measured', recommendation: 'Görsellere ve reklam alanlarına sabit boyut verilmeli.', serviceKey: 'speed' })
    }
    if (p.field?.inp != null) c('performance', 'INP ≤ 200 ms (gerçek kullanıcı verisi)', p.field.inp <= 200, 1, `${p.field.inp} ms`)
    if (p.seo != null) c('seo', 'Lighthouse SEO puanı ≥ 80', p.seo >= 80, 1.5, `${p.seo}/100`)
  } else tests.push({ key: 'pagespeed', label: 'PageSpeed Insights / Core Web Vitals', status: 'skipped', note: 'PageSpeed API anahtarı yok veya ölçüm başarısız; Core Web Vitals ölçülmedi, tahmin üretilmedi.' })
  if (d?.timing) {
    tests.push({ key: 'local_timing', label: 'Yerel yükleme ölçümü (masaüstü, bu bilgisayarın bağlantısıyla)', status: 'done' })
    const t = d.timing
    c('performance', 'Sunucu yanıtı (TTFB) ≤ 800 ms', t.ttfb <= 800, 1, fmtMs(t.ttfb))
    if (t.ttfb > 1500) add({ category: 'performance', code: 'perf_ttfb', title: 'Sunucu geç yanıt veriyor', evidence: `İlk bayt süresi ${fmtMs(t.ttfb)} (yerel ölçüm, tek deneme).`, severity: 'low', certainty: 'measured', recommendation: 'Sunucu tarafı önbellek ve daha hızlı barındırma değerlendirilmeli.', serviceKey: 'speed' })
  }
  if (d?.resources) {
    const r = d.resources
    c('performance', 'Sayfa boyutu ≤ 3 MB', r.kb <= 3072, 1, `${(r.kb / 1024).toFixed(1)} MB`)
    if (r.kb > 5120 || r.big.length >= 3) add({ category: 'performance', code: 'perf_heavy', title: 'Gereğinden büyük sayfa ve dosyalar', evidence: `Toplam aktarım ${(r.kb / 1024).toFixed(1)} MB (görseller ${(r.imageKb / 1024).toFixed(1)} MB). 500 KB üstü ${r.big.length} dosya: ${r.big.slice(0, 3).map((b: any) => `${b.url.split('/').pop()?.slice(0, 40)} (${b.kb} KB)`).join(', ')}`, severity: r.kb > 8192 ? 'high' : 'medium', certainty: 'measured', recommendation: 'Görseller yeniden boyutlandırılıp WebP formatına dönüştürülmeli; tembel yükleme (lazy-load) kullanılmalı.', serviceKey: 'speed' })
    if (d.images.oversized >= 3) add({ category: 'performance', code: 'perf_oversized_images', title: 'Gösterim boyutundan çok büyük görseller', evidence: `${d.images.oversized} görsel, gösterildiği boyutun 2,5 katından büyük çözünürlükte indiriliyor.`, severity: 'low', certainty: 'measured', recommendation: 'Görseller gösterim boyutuna göre yeniden boyutlandırılmalı (srcset).', serviceKey: 'speed' })
  }
  if (s.failedRequests.length || s.consoleErrors) {
    c('performance', 'Sayfa hatası yok', s.failedRequests.length === 0 && s.consoleErrors === 0, 1)
    if (s.failedRequests.length + s.consoleErrors >= 2) add({ category: 'performance', code: 'perf_page_errors', title: 'Sayfa yüklenirken hatalar oluşuyor', evidence: `${s.failedRequests.length} kaynak yüklenemedi${s.failedRequests[0] ? ` (ör. HTTP ${s.failedRequests[0].status}: ${s.failedRequests[0].url.slice(0, 80)})` : ''}, ${s.consoleErrors} JavaScript hatası.`, severity: 'low', certainty: 'measured', recommendation: 'Eksik dosyalar ve betik hataları giderilmeli.', serviceKey: 'maintenance' })
  } else if (d) c('performance', 'Sayfa hatası yok', true, 1)
  if (s.brokenLinks) {
    tests.push({ key: 'broken_links', label: `Bozuk bağlantı kontrolü (${s.brokenLinks.checked} iç bağlantı)`, status: 'done' })
    c('performance', 'Bozuk iç bağlantı yok', s.brokenLinks.broken.length === 0, 1, `${s.brokenLinks.broken.length} bozuk`)
    if (s.brokenLinks.broken.length) add({ category: 'performance', code: 'perf_broken_links', title: 'Bozuk bağlantılar', evidence: `${s.brokenLinks.checked} iç bağlantıdan ${s.brokenLinks.broken.length} tanesi hata veriyor: ${s.brokenLinks.broken.slice(0, 3).map((b) => `${b.url.slice(0, 70)} (${b.status})`).join(', ')}`, severity: s.brokenLinks.broken.length >= 3 ? 'medium' : 'low', certainty: 'measured', recommendation: 'Bozuk bağlantılar düzeltilmeli veya yönlendirilmeli.', serviceKey: 'maintenance' })
  } else tests.push({ key: 'broken_links', label: 'Bozuk bağlantı kontrolü', status: 'skipped', note: 'Ana sayfa okunamadığı için yapılmadı.' })
  if (input.psi?.accessibility != null) c('performance', 'Lighthouse erişilebilirlik ≥ 80', input.psi.accessibility >= 80, 1, `${input.psi.accessibility}/100`)

  // ---------------- E. SEO ----------------
  if (d) {
    const seo = d.seo
    const tl = (d.title ?? '').length
    c('seo', 'Sayfa başlığı (10–65 karakter)', tl >= 10 && tl <= 65, 1.5, `${tl} karakter`)
    if (!tl || tl < 10 || tl > 70) add({ category: 'seo', code: 'seo_title', title: !tl ? 'Sayfa başlığı (title) eksik' : tl < 10 ? 'Sayfa başlığı çok kısa' : 'Sayfa başlığı çok uzun', evidence: `title: "${(d.title ?? '').slice(0, 90)}" (${tl} karakter)`, severity: !tl ? 'high' : 'low', certainty: 'measured', recommendation: 'Her sayfa için 50-60 karakterlik, firma adı ve ana hizmeti içeren benzersiz bir başlık yazılmalı.', serviceKey: 'technical_seo', pageUrl: d.url })
    const dl = (seo.description ?? '').length
    c('seo', 'Meta açıklaması (50–170 karakter)', dl >= 50 && dl <= 170, 1.5, dl ? `${dl} karakter` : 'yok')
    if (!dl || dl < 50 || dl > 180) add({ category: 'seo', code: 'seo_description', title: !dl ? 'Meta açıklaması eksik' : 'Meta açıklaması ideal uzunlukta değil', evidence: dl ? `${dl} karakter: "${seo.description.slice(0, 100)}…"` : 'meta description etiketi yok.', severity: !dl ? 'medium' : 'low', certainty: 'measured', recommendation: '140-160 karakterlik, hizmeti ve konumu içeren bir açıklama eklenmeli.', serviceKey: 'technical_seo', pageUrl: d.url })
    c('seo', 'Tek H1 başlığı', seo.h1.length === 1, 1, `${seo.h1.length} adet H1`)
    if (seo.h1.length !== 1) add({ category: 'seo', code: 'seo_h1', title: seo.h1.length === 0 ? 'Ana başlık (H1) yok' : 'Birden fazla H1 başlığı', evidence: seo.h1.length ? `${seo.h1.length} H1: ${seo.h1.slice(0, 3).map((h: string) => `"${h.slice(0, 40)}"`).join(', ')}` : 'Sayfada H1 etiketi bulunamadı.', severity: seo.h1.length === 0 ? 'medium' : 'low', certainty: 'measured', recommendation: 'Her sayfada ana konuyu anlatan tek bir H1 başlığı olmalı.', serviceKey: 'technical_seo', pageUrl: d.url })
    c('seo', 'Başlık hiyerarşisi atlamasız', seo.headingSkips === 0, 0.5)
    const altRatio = d.images.total ? d.images.missingAlt / d.images.total : 0
    c('seo', 'Görsel alternatif metinleri', altRatio < 0.2, 1, `${d.images.missingAlt}/${d.images.total} eksik`)
    if (altRatio >= 0.2 && d.images.missingAlt >= 3) add({ category: 'seo', code: 'seo_alt', title: 'Görsellerde alternatif metin (alt) eksik', evidence: `${d.images.total} görselin ${d.images.missingAlt} tanesinde alt özniteliği yok.`, severity: 'low', certainty: 'measured', recommendation: 'Görsellere içeriği anlatan kısa alt metinleri eklenmeli.', serviceKey: 'technical_seo', pageUrl: d.url })
    c('seo', 'Canonical etiketi', !!seo.canonical, 0.5)
    const noindex = /noindex/i.test(seo.robots ?? '')
    c('seo', 'Sayfa indekslenebilir', !noindex, 2)
    if (noindex) add({ category: 'seo', code: 'seo_noindex', title: 'Sayfa arama motorlarına kapalı (noindex)', evidence: `meta robots: "${seo.robots}"`, severity: 'high', certainty: 'measured', recommendation: 'Yayındaki sayfalardan noindex kaldırılmalı.', serviceKey: 'technical_seo', pageUrl: d.url })
    c('seo', 'Yapılandırılmış veri (Schema.org)', seo.ldTypes.length > 0, 1, seo.ldTypes.slice(0, 3).join(', ') || 'yok')
    if (!seo.ldTypes.length) add({ category: 'seo', code: 'seo_no_schema', title: 'Yapılandırılmış veri kullanılmıyor', evidence: 'Sayfada JSON-LD (Schema.org) işaretlemesi bulunamadı.', severity: 'low', certainty: 'measured', recommendation: 'Organization / LocalBusiness şeması eklenerek arama sonuçlarında zengin görünüm sağlanmalı.', serviceKey: 'technical_seo', pageUrl: d.url })
    c('seo', 'Sosyal paylaşım (Open Graph) etiketleri', !!(seo.ogTitle && seo.ogImage), 0.5)
    c('seo', 'Sayfa dili (lang) belirtilmiş', !!d.lang, 0.5)
  }
  if (s.robotsTxt) {
    c('seo', 'robots.txt mevcut', s.robotsTxt.status === 200, 0.5)
    if (s.robotsTxt.disallowAll) add({ category: 'seo', code: 'seo_robots_block', title: 'robots.txt tüm siteyi arama motorlarına kapatıyor', evidence: 'robots.txt: "User-agent: * / Disallow: /"', severity: 'high', certainty: 'measured', recommendation: 'robots.txt dosyası düzeltilmeli.', serviceKey: 'technical_seo' })
  }
  if (s.sitemap) {
    c('seo', 'Site haritası (sitemap.xml)', s.sitemap.found, 1)
    if (!s.sitemap.found) add({ category: 'seo', code: 'seo_no_sitemap', title: 'Site haritası bulunamadı', evidence: '/sitemap.xml, /sitemap_index.xml ve robots.txt içinde site haritası yok.', severity: 'low', certainty: 'measured', recommendation: 'XML site haritası oluşturulup Google Search Console\'a gönderilmeli.', serviceKey: 'technical_seo' })
  }

  // ---------------- F. Kurumsal güven ----------------
  if (d) {
    const kinds = findPageLinks(d, input.siteDomain)
    c('trust', 'Hakkımızda sayfası', !!kinds.about, 1)
    if (!kinds.about) add({ category: 'trust', code: 'trust_no_about', title: 'Hakkımızda / kurumsal sayfa bulunamadı', evidence: 'Menüde veya sayfada "Hakkımızda / Kurumsal" bağlantısı tespit edilmedi.', severity: 'low', certainty: 'heuristic', recommendation: 'Firmanın hikâyesini, ekibini ve deneyimini anlatan bir sayfa eklenmeli.', serviceKey: 'content', pageUrl: d.url })
    c('trust', 'Referans / proje örnekleri', !!kinds.references, 1)
    if (!kinds.references) add({ category: 'trust', code: 'trust_no_refs', title: 'Referans veya proje örnekleri bulunamadı', evidence: 'Menüde "Projeler / Referanslar / Galeri" benzeri bağlantı tespit edilmedi.', severity: 'medium', certainty: 'heuristic', recommendation: 'Tamamlanan projeler fotoğraf ve kısa açıklamalarla sergilenmeli.', serviceKey: 'content', pageUrl: d.url })
    c('trust', 'Gizlilik / KVKK bilgilendirmesi', !!kinds.privacy, 1)
    if (!kinds.privacy) add({ category: 'trust', code: 'trust_no_privacy', title: 'KVKK / gizlilik bilgilendirmesi bulunamadı', evidence: 'Sayfada KVKK aydınlatma metni veya gizlilik politikası bağlantısı tespit edilmedi.', detail: 'Form üzerinden kişisel veri toplanıyorsa aydınlatma metni gereklidir. (Hukuki değerlendirme değildir.)', severity: d.forms.length ? 'medium' : 'low', certainty: 'heuristic', recommendation: 'KVKK aydınlatma metni ve çerez politikası sayfaları eklenmeli.', serviceKey: 'maintenance', pageUrl: d.url })
    const emails: string[] = [...new Set([...(d.contacts.mailtos ?? []), ...(d.contacts.emailsInText ?? [])].map((e: string) => e.toLowerCase()))]
    if (emails.length) {
      const corporate = emails.some((e) => domainOf(e.split('@')[1]) === input.siteDomain || (!FREE_MAIL.test(e) && e.endsWith(input.siteDomain)))
      const free = emails.filter((e) => FREE_MAIL.test(e))
      c('trust', 'Kurumsal e-posta adresi', corporate, 1)
      if (!corporate && free.length) add({ category: 'trust', code: 'trust_free_email', title: 'Kurumsal yerine ücretsiz e-posta adresi kullanılıyor', evidence: `Sitede yayımlanan adres: ${free[0]}`, severity: 'low', certainty: 'measured', recommendation: `${input.siteDomain} alan adıyla kurumsal e-posta kullanılmalı.`, serviceKey: 'identity', pageUrl: d.url })
    } else c('trust', 'Kurumsal e-posta adresi', null, 1, 'sayfada e-posta yok')
    c('trust', 'Sosyal medya bağlantıları', d.contacts.socials.length > 0, 0.5)
  }

  // ---------------- Puanlar ----------------
  const cats: FindingCategory[] = ['design', 'mobile', 'ux', 'performance', 'seo', 'trust']
  const scores = {} as Record<FindingCategory, CategoryScore>
  for (const cat of cats) {
    const list = crit.filter((x) => x.cat === cat)
    const measured = list.filter((x) => x.passed !== null)
    const totalW = list.reduce((s2, x) => s2 + x.weight, 0)
    const measuredW = measured.reduce((s2, x) => s2 + x.weight, 0)
    const passedW = measured.filter((x) => x.passed).reduce((s2, x) => s2 + x.weight, 0)
    let score = measuredW ? Math.round((passedW / measuredW) * 100) : null
    if (cat === 'performance' && input.psi?.performance != null && score != null) score = Math.round(score * 0.4 + input.psi.performance * 0.6)
    const coverage = totalW ? measuredW / totalW : 0
    const confidence: CategoryScore['confidence'] = !measured.length ? 'none' : coverage > 0.85 && measured.length >= 4 ? 'high' : coverage > 0.5 ? 'medium' : 'low'
    const failed = measured.filter((x) => !x.passed).map((x) => x.label)
    scores[cat] = {
      score,
      confidence,
      measured: measured.length > 0,
      criteria: list.map((x) => ({ label: x.label, passed: x.passed, weight: x.weight, note: x.note })),
      reason: score == null ? 'Bu kategori ölçülemedi.' : failed.length ? `Karşılanmayan ölçütler: ${failed.join(', ')}.` : 'Ölçülen tüm ölçütler karşılandı.'
    }
  }
  const cw = categoryWeights ?? {}
  const valid = cats.filter((k) => scores[k].score != null)
  const wsum = valid.reduce((s2, k) => s2 + (cw[k] ?? 1), 0)
  const overall = valid.length ? Math.round(valid.reduce((s2, k) => s2 + (scores[k].score as number) * (cw[k] ?? 1), 0) / wsum) : null

  const sevOrder = { high: 0, medium: 1, low: 2, info: 3 }
  f.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity])
  return { findings: f, scores, overall, tests }
}

/** Bulgulardan kısa, kanıta dayalı Türkçe özet (AI yoksa kullanılır). */
export function ruleSummary(findings: FindingDraft[], overall: number | null): string {
  if (!findings.length) return overall != null ? `Ölçülen kriterlerde belirgin bir sorun tespit edilmedi (genel puan ${overall}/100).` : 'Analiz tamamlanamadı; bulgu üretilemedi.'
  const top = findings.filter((x) => x.severity === 'high' || x.severity === 'medium').slice(0, 3)
  const parts = (top.length ? top : findings.slice(0, 2)).map((x) => x.title.charAt(0).toLocaleLowerCase('tr-TR') + x.title.slice(1))
  return `İncelemede öne çıkan noktalar: ${parts.join('; ')}.${overall != null ? ` Ölçülen kriterlere göre genel puan ${overall}/100.` : ''}`
}
