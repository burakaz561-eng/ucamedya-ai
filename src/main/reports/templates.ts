// PDF raporları için HTML şablonları (saf fonksiyonlar). Görseller veri URI olarak verilir.
// Rapor dili ihtiyatlıdır: sezgisel bulgular "olabilir" diliyle, ölçülemeyen testler açıkça belirtilir.

import { FINDING_CATEGORIES, SEVERITY_LABELS, type FindingCategory } from '@shared/constants'

export const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const trDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' }) : '—')
const money = (n: number, cur = 'TRY') => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: cur, maximumFractionDigits: 2 }).format(n)

export interface BrandForPdf {
  name: string
  website: string
  email: string
  phone: string
  address: string
  logoDataUri: string | null
  fontCss: string
}

export const baseCss = (b: BrandForPdf) => `
${b.fontCss}
@page { size: A4; margin: 16mm 14mm 18mm; }
* { box-sizing: border-box; }
body { font-family: 'Inter Tight', 'Segoe UI', Arial, sans-serif; color: #18181B; font-size: 10pt; line-height: 1.5; margin: 0; }
h1, h2, h3, .display { font-family: 'Outfit', 'Inter Tight', sans-serif; letter-spacing: -0.01em; }
h2 { font-size: 15pt; margin: 22px 0 10px; padding-bottom: 6px; border-bottom: 2px solid #E95A1B; break-after: avoid; }
h3 { font-size: 11.5pt; margin: 14px 0 6px; break-after: avoid; }
.muted { color: #6F6F78; }
.small { font-size: 8.5pt; }
.cover { height: 255mm; display: flex; flex-direction: column; justify-content: space-between; page-break-after: always; position: relative; }
.cover .band { position: absolute; right: -14mm; top: -16mm; width: 70mm; height: 285mm; background: linear-gradient(180deg, #E95A1B 0%, #CC4A10 100%); opacity: .08; }
.cover .dot { width: 18px; height: 18px; border-radius: 50%; background: #E95A1B; display: inline-block; }
.cover h1 { font-size: 30pt; line-height: 1.1; margin: 0 0 10px; }
.cover .kicker { text-transform: uppercase; letter-spacing: .18em; font-size: 8.5pt; color: #E95A1B; font-weight: 600; }
.logo { height: 46px; }
.meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; margin-top: 18px; }
.meta div span { display: block; font-size: 8pt; color: #6F6F78; text-transform: uppercase; letter-spacing: .08em; }
.card { border: 1px solid #E4E1DA; border-radius: 10px; padding: 12px 14px; margin: 8px 0; break-inside: avoid; }
.scores { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.score { border: 1px solid #E4E1DA; border-radius: 10px; padding: 10px 12px; break-inside: avoid; }
.score .v { font-family: 'Outfit'; font-size: 20pt; font-weight: 700; }
.bar { height: 6px; background: #F3F2EE; border-radius: 6px; overflow: hidden; margin-top: 4px; }
.bar i { display: block; height: 100%; background: #E95A1B; }
.sev { display: inline-block; font-size: 7.5pt; font-weight: 600; padding: 2px 8px; border-radius: 99px; text-transform: uppercase; letter-spacing: .06em; }
.sev.high { background: #FDE2E1; color: #9F1D1A; } .sev.medium { background: #FCEBD5; color: #8A4B05; } .sev.low { background: #E8EEF9; color: #23467A; } .sev.info { background: #EEE; color: #444; }
.cert { font-size: 7.5pt; color: #6F6F78; margin-left: 6px; }
.shot { width: 100%; border: 1px solid #E4E1DA; border-radius: 8px; margin: 6px 0; }
.shots2 { display: grid; grid-template-columns: 2.6fr 1fr; gap: 10px; align-items: start; }
table { width: 100%; border-collapse: collapse; font-size: 9pt; }
th { text-align: left; font-weight: 600; color: #6F6F78; font-size: 8pt; text-transform: uppercase; letter-spacing: .06em; border-bottom: 1px solid #D3CFC6; padding: 6px 4px; }
td { border-bottom: 1px solid #EAE7E0; padding: 6px 4px; vertical-align: top; }
.right { text-align: right; }
.note { background: #FEF3EC; border-left: 3px solid #E95A1B; padding: 8px 12px; border-radius: 6px; font-size: 9pt; }
.footer { margin-top: 24px; font-size: 8pt; color: #6F6F78; border-top: 1px solid #E4E1DA; padding-top: 8px; }
.pb { page-break-before: always; }
`

export const cover = (b: BrandForPdf, kicker: string, title: string, subtitle: string, meta: [string, string][]) => `
<section class="cover">
  <div class="band"></div>
  <div>${b.logoDataUri ? `<img class="logo" src="${b.logoDataUri}" alt="${esc(b.name)}">` : `<div class="display" style="font-size:20pt;font-weight:700">${esc(b.name)}</div>`}</div>
  <div>
    <div class="kicker">${esc(kicker)}</div>
    <h1>${esc(title)}</h1>
    <div class="muted" style="font-size:12pt">${esc(subtitle)}</div>
    <div class="meta">${meta.map(([k, v]) => `<div><span>${esc(k)}</span>${esc(v)}</div>`).join('')}</div>
  </div>
  <div class="small muted"><span class="dot" style="width:8px;height:8px;vertical-align:middle;margin-right:6px"></span>${esc(b.name)} · ${esc(b.website)}${b.email ? ` · ${esc(b.email)}` : ''}${b.phone ? ` · ${esc(b.phone)}` : ''}</div>
</section>`

export interface AnalysisReportData {
  company: { name: string; sector: string | null; city: string | null; district: string | null; address: string | null; website: string | null }
  analysis: { id: number; version: number; url: string; finalUrl: string | null; date: string; summary: string | null; aiSummary: string | null; overall: number | null }
  scores: Record<string, { score: number | null; confidence: string; reason: string; criteria: { label: string; passed: boolean | null; note?: string }[] }>
  findings: { category: string; title: string; detail: string | null; evidence: string | null; severity: string; certainty: string; recommendation: string | null; service: string | null; shot: string | null }[]
  shots: { label: string; uri: string; viewport: string }[]
  tests: { label: string; status: string; note?: string }[]
  psi: { performance: number | null; accessibility: number | null; seo: number | null; bestPractices: number | null; lab: Record<string, number | undefined>; field: Record<string, unknown> | null } | null
  services: { name: string; description: string }[]
}

const CONF: Record<string, string> = { high: 'yüksek güven', medium: 'orta güven', low: 'düşük güven', none: 'ölçülemedi' }
const CERT: Record<string, string> = { measured: 'ölçüldü', heuristic: 'sezgisel değerlendirme', ai: 'AI değerlendirmesi' }

export function analysisReportHtml(b: BrandForPdf, d: AnalysisReportData): string {
  const cats = Object.keys(FINDING_CATEGORIES) as FindingCategory[]
  const fb = (cat: string) => d.findings.filter((f) => f.category === cat)
  const findingHtml = (f: AnalysisReportData['findings'][number], i: number) => `
    <div class="card">
      <div><span class="sev ${esc(f.severity)}">${esc(SEVERITY_LABELS[f.severity as keyof typeof SEVERITY_LABELS] ?? f.severity)}</span><span class="cert">${esc(CERT[f.certainty] ?? f.certainty)}</span></div>
      <h3>Bulgu ${i + 1} — ${esc(f.title)}</h3>
      ${f.detail ? `<div>${esc(f.detail)}</div>` : ''}
      ${f.evidence ? `<div class="small" style="margin-top:4px"><b>Kanıt:</b> ${esc(f.evidence)}</div>` : ''}
      ${f.recommendation ? `<div style="margin-top:4px"><b>Öneri:</b> ${esc(f.recommendation)}</div>` : ''}
      ${f.service ? `<div class="small muted" style="margin-top:4px"><b>İlgili ${esc(b.name)} hizmeti:</b> ${esc(f.service)}</div>` : ''}
      ${f.shot ? `<img class="shot" src="${f.shot}" style="max-height:110mm;object-fit:contain">` : ''}
    </div>`
  let n = 0
  const home = d.shots.filter((s) => /Ana sayfa/.test(s.label))
  const desk = home.find((s) => s.viewport === 'desktop')
  const mob = home.find((s) => s.viewport === 'mobile')
  const prioritized = [...d.findings].sort((a, b2) => ['high', 'medium', 'low', 'info'].indexOf(a.severity) - ['high', 'medium', 'low', 'info'].indexOf(b2.severity))
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${esc(d.company.name)} — Web Sitesi Analiz Raporu</title><style>${baseCss(b)}</style></head><body>
${cover(b, 'Web Sitesi Analiz Raporu', d.company.name, d.analysis.finalUrl ?? d.analysis.url, [
  ['Analiz tarihi', trDate(d.analysis.date)],
  ['Analiz sürümü', `v${d.analysis.version} · #${d.analysis.id}`],
  ['Sektör', d.company.sector ?? '—'],
  ['Konum', [d.company.district, d.company.city].filter(Boolean).join(', ') || '—']
])}
<h2>1. Şirket bilgileri</h2>
<table><tr><th>Şirket</th><td>${esc(d.company.name)}</td></tr><tr><th>Web sitesi</th><td>${esc(d.analysis.finalUrl ?? d.analysis.url)}</td></tr><tr><th>Sektör</th><td>${esc(d.company.sector ?? '—')}</td></tr><tr><th>Adres</th><td>${esc(d.company.address ?? ([d.company.district, d.company.city].filter(Boolean).join(', ') || '—'))}</td></tr><tr><th>Analiz tarihi</th><td>${trDate(d.analysis.date)}</td></tr></table>

<h2>2. Yönetici özeti</h2>
<p>${esc(d.analysis.aiSummary || d.analysis.summary || 'Özet oluşturulamadı.')}</p>
${d.analysis.aiSummary ? `<div class="small muted">Bu özet yapay zekâ tarafından yalnızca aşağıdaki ölçüm ve bulgulardan hazırlanmıştır.</div>` : ''}
<div class="scores" style="margin-top:10px">
${cats.map((c) => { const s = d.scores[c]; return `<div class="score"><div class="small muted">${esc(FINDING_CATEGORIES[c])}</div><div class="v">${s?.score ?? '—'}<span class="small muted">${s?.score != null ? '/100' : ''}</span></div><div class="bar"><i style="width:${s?.score ?? 0}%"></i></div><div class="small muted" style="margin-top:4px">${esc(CONF[s?.confidence ?? 'none'])}</div></div>` }).join('')}
</div>
<div class="note" style="margin-top:10px">Puanlar, aşağıda listelenen ölçütlerin karşılanma oranından hesaplanır (${d.analysis.overall != null ? `genel ortalama ${d.analysis.overall}/100` : 'genel puan hesaplanamadı'}). Ölçülemeyen ölçütler puana katılmaz; güven düzeyi ölçüm kapsamını gösterir. Puanlar bir değerlendirme aracıdır, kesin bir kalite hükmü değildir.</div>

${desk || mob ? `<h2 class="pb">3. Web sitesi ekran görüntüleri</h2><div class="shots2">${desk ? `<div><div class="small muted">Masaüstü (1440 px)</div><img class="shot" src="${desk.uri}"></div>` : '<div></div>'}${mob ? `<div><div class="small muted">Mobil (390 px)</div><img class="shot" src="${mob.uri}"></div>` : ''}</div>` : ''}

<h2 class="pb">4. Tespit edilen sorunlar</h2>
${d.findings.length ? '' : '<p>Ölçülen kriterlerde belirgin bir sorun tespit edilmedi.</p>'}
${cats.map((c) => (fb(c).length ? `<h3 style="color:#CC4A10">${esc(FINDING_CATEGORIES[c])}</h3>${fb(c).map((f) => findingHtml(f, n++)).join('')}` : '')).join('')}

<h2 class="pb">5. Teknik performans ölçümleri</h2>
${d.psi ? `<table><tr><th>Ölçüm (Google PageSpeed Insights, mobil)</th><th class="right">Değer</th></tr>
<tr><td>Performans puanı</td><td class="right">${d.psi.performance ?? '—'}/100</td></tr>
<tr><td>Erişilebilirlik puanı</td><td class="right">${d.psi.accessibility ?? '—'}/100</td></tr>
<tr><td>SEO puanı</td><td class="right">${d.psi.seo ?? '—'}/100</td></tr>
<tr><td>En iyi uygulamalar</td><td class="right">${d.psi.bestPractices ?? '—'}/100</td></tr>
<tr><td>LCP (en büyük içerik boyaması)</td><td class="right">${d.psi.lab.lcp != null ? (d.psi.lab.lcp / 1000).toFixed(1) + ' sn' : '—'}</td></tr>
<tr><td>CLS (düzen kayması)</td><td class="right">${d.psi.lab.cls != null ? d.psi.lab.cls.toFixed(3) : '—'}</td></tr>
<tr><td>TBT (toplam engelleme süresi)</td><td class="right">${d.psi.lab.tbt != null ? Math.round(d.psi.lab.tbt) + ' ms' : '—'}</td></tr>
</table>` : '<p class="note">Google PageSpeed Insights ölçümü bu analizde yapılamadı (API anahtarı yok veya servis yanıt vermedi). Core Web Vitals değerleri için tahmin üretilmemiştir.</p>'}

<h3>Ölçüm kapsamı</h3>
<table><tr><th>Test</th><th>Durum</th><th>Not</th></tr>${d.tests.map((t) => `<tr><td>${esc(t.label)}</td><td>${t.status === 'done' ? 'Yapıldı' : t.status === 'skipped' ? 'Yapılamadı' : 'Başarısız'}</td><td class="small">${esc(t.note ?? '')}</td></tr>`).join('')}</table>

<h3>Kategori ölçütleri</h3>
${cats.map((c) => { const s = d.scores[c]; if (!s) return ''; return `<div class="card"><b>${esc(FINDING_CATEGORIES[c])}</b> — ${s.score ?? '—'}/100 <span class="small muted">(${esc(CONF[s.confidence])})</span><div class="small">${s.criteria.map((x) => `${x.passed === null ? '○' : x.passed ? '✓' : '✗'} ${esc(x.label)}${x.note ? ` <span class="muted">(${esc(x.note)})</span>` : ''}`).join('<br>')}</div></div>` }).join('')}

<h2 class="pb">6. Önceliklendirilmiş iyileştirme önerileri</h2>
<table><tr><th>#</th><th>Öneri</th><th>Önem</th></tr>${prioritized.filter((f) => f.recommendation).slice(0, 12).map((f, i) => `<tr><td>${i + 1}</td><td><b>${esc(f.title)}</b><br><span class="small">${esc(f.recommendation)}</span></td><td><span class="sev ${esc(f.severity)}">${esc(SEVERITY_LABELS[f.severity as keyof typeof SEVERITY_LABELS])}</span></td></tr>`).join('')}</table>

<h2>7. ${esc(b.name)}'nın sağlayabileceği hizmetler</h2>
${d.services.length ? d.services.map((s) => `<div class="card"><b>${esc(s.name)}</b><div class="small">${esc(s.description)}</div></div>`).join('') : '<p>Bu analizde belirgin bir hizmet ihtiyacı öne çıkmadı.</p>'}

<h2>8. Önerilen sonraki adımlar</h2>
<ol><li>Rapordaki yüksek önem dereceli bulguların birlikte gözden geçirilmesi.</li><li>Önceliklerin ve bütçenin belirlenmesi için kısa bir tanışma görüşmesi.</li><li>${esc(b.name)} tarafından kapsam ve zaman planı içeren teklif hazırlanması.</li></ol>

<div class="footer">Bu rapor ${esc(b.name)} tarafından ${trDate(d.analysis.date)} tarihinde, sitenin herkese açık sayfalarının otomatik incelemesiyle hazırlanmıştır. Ölçümler test anındaki koşulları yansıtır; ağ, sunucu yükü ve cihaz farklılıkları sonuçları etkileyebilir. "Sezgisel değerlendirme" olarak işaretli bulgular kesin tespit değildir. Bu rapor hukuki değerlendirme içermez.</div>
</body></html>`
}

export interface OfferPdfData {
  number: string
  title: string
  date: string
  validUntil: string | null
  company: { name: string; address: string | null; city: string | null; email: string | null; phone: string | null }
  items: { name: string; description: string | null; quantity: number; unit: string | null; unitPrice: number; vatRate: number }[]
  currency: string
  discountLabel: string | null
  discountAmount: number
  subtotal: number
  vatTotal: number
  total: number
  vatIncluded: boolean
  delivery: string | null
  paymentTerms: string | null
  notes: string | null
  analysisSummary?: string | null
  nextSteps?: string | null
  /** Taslak (onaylanmamış fiyat) ise PDF'te belirgin uyarı */
  draft?: boolean
}

export function offerHtml(b: BrandForPdf, o: OfferPdfData): string {
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Teklif ${esc(o.number)}</title><style>${baseCss(b)}</style></head><body>
<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px">
  <div>${b.logoDataUri ? `<img class="logo" src="${b.logoDataUri}">` : `<div class="display" style="font-size:18pt;font-weight:700">${esc(b.name)}</div>`}
  <div class="small muted" style="margin-top:6px">${esc(b.address)}<br>${esc(b.website)}${b.email ? ` · ${esc(b.email)}` : ''}${b.phone ? ` · ${esc(b.phone)}` : ''}</div></div>
  <div style="text-align:right"><div class="kicker" style="color:#E95A1B;letter-spacing:.18em;font-size:8.5pt;font-weight:600">FİYAT TEKLİFİ</div><div class="display" style="font-size:18pt;font-weight:700">${esc(o.number)}</div>
  <div class="small">Tarih: ${trDate(o.date)}<br>${o.validUntil ? `Geçerlilik: ${trDate(o.validUntil)}` : ''}</div></div>
</div>
<div class="card"><div class="small muted">SAYIN</div><b>${esc(o.company.name)}</b><div class="small">${esc([o.company.address, o.company.city].filter(Boolean).join(', '))}${o.company.email ? `<br>${esc(o.company.email)}` : ''}${o.company.phone ? ` · ${esc(o.company.phone)}` : ''}</div></div>
${o.draft ? `<div class="card" style="border:1.5px solid #E95A1B;color:#B3410E;margin-top:12px"><b>TASLAK</b> — Bu teklif henüz onaylanmamıştır; fiyatlar ve kapsam kesinleşmemiştir.</div>` : ''}
${o.analysisSummary ? `<h3>Mevcut durum ve analiz özeti</h3><p style="white-space:pre-wrap">${esc(o.analysisSummary)}</p>` : ''}
<h2>${esc(o.title)}</h2>
<table><tr><th>#</th><th>Hizmet</th><th class="right">Miktar</th><th class="right">Birim fiyat</th><th class="right">KDV</th><th class="right">Tutar</th></tr>
${o.items.map((it, i) => `<tr><td>${i + 1}</td><td><b>${esc(it.name)}</b>${it.description ? `<br><span class="small muted">${esc(it.description)}</span>` : ''}</td><td class="right">${it.quantity} ${esc(it.unit ?? '')}</td><td class="right">${money(it.unitPrice, o.currency)}</td><td class="right">%${it.vatRate}</td><td class="right">${money(it.unitPrice * it.quantity, o.currency)}</td></tr>`).join('')}
</table>
<table style="width:55%;margin-left:auto;margin-top:10px">
<tr><td>Ara toplam</td><td class="right">${money(o.subtotal + o.discountAmount, o.currency)}</td></tr>
${o.discountAmount ? `<tr><td>İndirim ${esc(o.discountLabel ?? '')}</td><td class="right">−${money(o.discountAmount, o.currency)}</td></tr>` : ''}
<tr><td>KDV ${o.vatIncluded ? '(fiyatlara dahil)' : ''}</td><td class="right">${money(o.vatTotal, o.currency)}</td></tr>
<tr><td><b>Genel toplam</b></td><td class="right"><b>${money(o.total, o.currency)}</b></td></tr>
</table>
${o.delivery ? `<h3>Tahmini teslim süresi</h3><p>${esc(o.delivery)}</p>` : ''}
${o.paymentTerms ? `<h3>Ödeme koşulları</h3><p>${esc(o.paymentTerms)}</p>` : ''}
${o.notes ? `<h3>Açıklamalar</h3><p style="white-space:pre-wrap">${esc(o.notes)}</p>` : ''}
${o.nextSteps ? `<h3>Sonraki adımlar</h3><p style="white-space:pre-wrap">${esc(o.nextSteps)}</p>` : ''}
<div class="footer">${o.validUntil ? `Bu teklif ${trDate(o.validUntil)} tarihine kadar geçerlidir. ` : ''}${esc(b.name)} · ${esc(b.website)}</div>
</body></html>`
}

export interface ResearchReportData {
  name: string
  date: string
  criteria: { sectors: string[]; locations: string[]; target: number; provider: string }
  totals: Record<string, number>
  topIssues: { title: string; count: number }[]
  bySector: { label: string; count: number }[]
  byCity: { label: string; count: number }[]
  byService: { label: string; count: number }[]
  companies: { name: string; city: string | null; website: string | null; status: string; score: number | null; group: string }[]
}

export function researchReportHtml(b: BrandForPdf, d: ResearchReportData): string {
  const t = d.totals
  const dist = (title: string, rows: { label: string; count: number }[]) => {
    const max = Math.max(1, ...rows.map((r) => r.count))
    return `<h3>${esc(title)}</h3><table>${rows.map((r) => `<tr><td style="width:40%">${esc(r.label)}</td><td><div class="bar" style="height:8px"><i style="width:${(r.count / max) * 100}%"></i></div></td><td class="right" style="width:40px">${r.count}</td></tr>`).join('') || '<tr><td class="muted">Veri yok</td></tr>'}</table>`
  }
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${esc(d.name)} — Araştırma Raporu</title><style>${baseCss(b)}</style></head><body>
${cover(b, 'Toplu Araştırma Raporu', d.name, `${d.criteria.sectors.join(', ') || 'Tüm sektörler'} · ${d.criteria.locations.join(', ') || 'Türkiye'}`, [
  ['Rapor tarihi', trDate(d.date)],
  ['Araştırma hedefi', `${d.criteria.target} şirket (hedef; garanti değildir)`],
  ['Arama sağlayıcısı', d.criteria.provider],
  ['Bulunan şirket', String(t.found ?? 0)]
])}
<h2>Özet</h2>
<div class="scores">
${[['Bulunan şirket', t.found], ['Geçerli web sitesi', t.withWebsite], ['Web sitesi yok', t.noWebsite], ['Analizi tamamlanan', t.analyzed], ['Analiz hatası / erişilemeyen', t.analysisFailed], ['Yinelenen kayıt', t.duplicates], ['İnceleme bekleyen', t.reviewPending], ['Onaylanan iletişim', t.approved], ['Gönderilen iletişim', t.sent], ['Alınan yanıt', t.replies]]
  .map(([k, v]) => `<div class="score"><div class="small muted">${esc(k)}</div><div class="v">${v ?? 0}</div></div>`).join('')}
</div>
<h2>En sık görülen web sitesi sorunları</h2>
<table><tr><th>Sorun</th><th class="right">Şirket sayısı</th></tr>${d.topIssues.map((x) => `<tr><td>${esc(x.title)}</td><td class="right">${x.count}</td></tr>`).join('') || '<tr><td class="muted">Analiz edilmiş site yok</td></tr>'}</table>
${dist('Sektör bazında dağılım', d.bySector)}
${dist('Şehir bazında dağılım', d.byCity)}
${dist('Hizmet fırsatı dağılımı', d.byService)}
<h2 class="pb">Şirket listesi</h2>
<table><tr><th>Şirket</th><th>Şehir</th><th>Web sitesi</th><th>Durum</th><th class="right">Puan</th></tr>
${d.companies.map((c) => `<tr><td>${esc(c.name)}</td><td>${esc(c.city ?? '—')}</td><td class="small">${esc(c.website ?? 'yok')}</td><td class="small">${esc(c.status)}</td><td class="right">${c.score ?? '—'}</td></tr>`).join('')}
</table>
<div class="footer">Rakamlar uygulama veritabanındaki gerçek kayıtlardan hesaplanmıştır. Fırsat puanı şirketin mali gücünü veya satın alma niyetini göstermez.</div>
</body></html>`
}
