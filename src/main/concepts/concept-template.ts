// Tasarım konsepti sunumu (A4 PDF): kapak · mevcut durum · önerilen ana sayfa · mobil · renk/tipografi · önce/sonra.

import { baseCss, cover, esc, type BrandForPdf } from '../reports/templates'
import type { ConceptData } from './concept'

export interface ConceptPdfContext {
  company: { name: string; website: string | null }
  date: string
  before: { desktop: string | null; mobile: string | null }
}

function desktopMock(d: ConceptData) {
  const p = d.palette
  return `<div class="frame"><div class="bar"><i></i><i></i><i></i><span>${esc(d.brandName.toLocaleLowerCase('tr-TR').replace(/\s+/g, ''))}.com.tr</span></div>
<div class="mock" style="--p:${p.primary};--a:${p.accent};--s:${p.surface};--k:${p.ink}">
  <div class="nav"><b class="logo-t">${esc(d.brandName)}</b><span>Hizmetler</span><span>Projeler</span><span>Hakkımızda</span><span>İletişim</span><em>Teklif isteyin</em></div>
  <div class="hero"><div><div class="eyebrow">${esc(d.sectorLabel)}</div><h4>${esc(d.hero.headlines[1])}</h4><p>${esc(d.hero.subline)}</p><div class="btns"><em>Teklif isteyin</em><u>Hemen arayın</u></div></div><div class="ph">[Şirkete ait gerçek proje / ekip fotoğrafı]</div></div>
  <div class="cards">${d.services.map((s) => `<div class="c"><div class="ic"></div><b>${esc(s.title)}</b><span>${esc(s.text)}</span></div>`).join('')}</div>
  <div class="band"><b>Projeniz için ücretsiz ön görüşme</b><span>${d.ctas.map((c) => esc(c.label)).join(' · ')}</span></div>
  <div class="foot">${esc(d.brandName)} · [adres] · [telefon] · [e-posta]</div>
</div></div>`
}

function mobileMock(d: ConceptData) {
  const p = d.palette
  return `<div class="phone"><div class="mock m" style="--p:${p.primary};--a:${p.accent};--s:${p.surface};--k:${p.ink}">
  <div class="nav"><b class="logo-t">${esc(d.brandName)}</b><span class="burger">☰</span></div>
  <div class="hero"><div><h4>${esc(d.hero.headlines[1])}</h4><p>${esc(d.hero.subline.slice(0, 120))}</p><div class="btns"><em>Teklif isteyin</em></div></div></div>
  ${d.services.slice(0, 3).map((s) => `<div class="c"><b>${esc(s.title)}</b></div>`).join('')}
  <div class="sticky"><span>📞 Ara</span><span>💬 WhatsApp</span></div>
</div></div>`
}

export function conceptHtml(b: BrandForPdf, d: ConceptData, ctx: ConceptPdfContext): string {
  const p = d.palette
  const css = `
.frame { border: 1px solid #d4d4d8; border-radius: 10px; overflow: hidden; box-shadow: 0 6px 24px rgba(0,0,0,.08); }
.frame .bar { background: #f4f4f5; padding: 6px 10px; display: flex; gap: 5px; align-items: center; font-size: 7pt; color: #71717a; }
.frame .bar i { width: 7px; height: 7px; border-radius: 50%; background: #d4d4d8; display: inline-block; }
.frame .bar span { margin-left: 10px; background: #fff; padding: 2px 10px; border-radius: 6px; }
.mock { background: var(--s); color: var(--k); font-size: 8pt; }
.mock .nav { display: flex; gap: 14px; align-items: center; padding: 10px 16px; background: #fff; border-bottom: 1px solid #e4e4e7; }
.mock .nav span { color: #52525b; }
.mock .logo-t { font-family: Outfit, sans-serif; font-size: 11pt; color: var(--p); margin-right: auto; }
.mock em, .mock u { font-style: normal; text-decoration: none; padding: 6px 12px; border-radius: 999px; font-weight: 600; display: inline-block; }
.mock em { background: var(--a); color: #fff; }
.mock u { border: 1.5px solid #fff; color: #fff; }
.mock .hero { background: var(--p); color: #fff; padding: 22px 18px; display: grid; grid-template-columns: 1.3fr 1fr; gap: 14px; align-items: center; }
.mock .hero h4 { font-family: Outfit, sans-serif; font-size: 15pt; line-height: 1.2; margin: 4px 0 8px; }
.mock .hero p { opacity: .9; margin: 0 0 10px; }
.mock .eyebrow { text-transform: uppercase; letter-spacing: .14em; font-size: 6.5pt; opacity: .8; }
.mock .btns { display: flex; gap: 8px; }
.mock .ph { height: 120px; border-radius: 10px; background: rgba(255,255,255,.12); border: 1px dashed rgba(255,255,255,.45); display: grid; place-items: center; text-align: center; font-size: 7pt; padding: 8px; }
.mock .cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; padding: 14px 16px; }
.mock .c { background: #fff; border-radius: 10px; padding: 10px; border: 1px solid #e4e4e7; display: flex; flex-direction: column; gap: 4px; }
.mock .c .ic { width: 18px; height: 18px; border-radius: 6px; background: var(--a); opacity: .85; }
.mock .c span { color: #71717a; font-size: 6.8pt; }
.mock .band { margin: 0 16px 14px; background: var(--k); color: #fff; border-radius: 10px; padding: 12px 14px; display: flex; justify-content: space-between; }
.mock .foot { padding: 8px 16px 12px; color: #71717a; font-size: 6.5pt; }
.phone { width: 64mm; border: 6px solid #18181b; border-radius: 22px; overflow: hidden; box-shadow: 0 6px 24px rgba(0,0,0,.12); }
.mock.m .hero { grid-template-columns: 1fr; padding: 16px 12px; }
.mock.m .hero h4 { font-size: 12pt; }
.mock.m .c { margin: 8px 10px 0; }
.mock.m .burger { margin-left: auto; font-size: 12pt; color: var(--p); }
.mock.m .sticky { margin-top: 12px; display: grid; grid-template-columns: 1fr 1fr; }
.mock.m .sticky span { text-align: center; padding: 10px 0; font-weight: 700; color: #fff; background: var(--p); }
.mock.m .sticky span + span { background: var(--a); }
.shot { width: 100%; border: 1px solid #e4e4e7; border-radius: 8px; }
.two { display: grid; grid-template-columns: 1.7fr 1fr; gap: 12px; align-items: start; }
.sw { display: flex; gap: 10px; margin: 8px 0; }
.sw div { flex: 1; border-radius: 10px; height: 54px; display: flex; align-items: flex-end; padding: 6px 8px; font-size: 7.5pt; color: #fff; }
.pb { page-break-before: always; }
.note { border-left: 3px solid #E95A1B; padding: 6px 10px; background: #fff7f2; font-size: 8.5pt; }
`
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${esc(ctx.company.name)} — Tasarım İyileştirme Konsepti</title><style>${baseCss(b)}${css}</style></head><body>
${cover(b, 'Tasarım İyileştirme Konsepti', ctx.company.name, ctx.company.website ?? '', [['Hazırlanma tarihi', ctx.date], ['Sektör', d.sectorLabel], ['Durum', 'Örnek konsept — onay ve içerik çalışması gerektirir']])}

<h2>1. Mevcut durum</h2>
<div class="two">
  <div>${ctx.before.desktop ? `<img class="shot" src="${ctx.before.desktop}" alt="Mevcut ana sayfa (masaüstü)"><div class="small muted">Mevcut ana sayfa — masaüstü (analiz sırasında alınan ekran görüntüsü)</div>` : '<div class="muted">Masaüstü ekran görüntüsü yok.</div>'}</div>
  <div>${ctx.before.mobile ? `<img class="shot" src="${ctx.before.mobile}" alt="Mevcut ana sayfa (mobil)" style="max-height:150mm;object-fit:cover;object-position:top"><div class="small muted">Mobil görünüm</div>` : '<div class="muted">Mobil ekran görüntüsü yok.</div>'}</div>
</div>
${d.improvements.length ? `<h3>Konseptin çözmeyi hedeflediği tespitler</h3><table><tr><th>Tespit</th><th>Öneri</th></tr>${d.improvements.map((x) => `<tr><td><b>${esc(x.title)}</b></td><td>${esc(x.recommendation)}</td></tr>`).join('')}</table>` : ''}

<h2 class="pb">2. Önerilen ana sayfa düzeni (masaüstü)</h2>
${desktopMock(d)}
<h3>Başlık önerileri</h3>
<ol>${d.hero.headlines.map((h) => `<li>${esc(h)}</li>`).join('')}</ol>
<p class="small">Açıklama metni: ${esc(d.hero.subline)} ${d.hero.sublineFromSite ? '<span class="muted">(sitenin mevcut meta açıklamasından)</span>' : ''}</p>
<h3>Hizmet kartları</h3>
<p class="small">${d.services.some((s) => s.fromSite) ? 'Kart başlıkları sitenin mevcut başlıklarından alındı.' : 'Sitede ayırt edilebilir hizmet başlığı bulunamadı; kartlar sektöre göre örnektir ve şirketin gerçek hizmetleriyle değiştirilmelidir.'}</p>
<h3>İletişim butonları</h3>
<table><tr><th>Buton</th><th>Hedef</th><th>Mevcut bilgi</th></tr>${d.ctas.map((c) => `<tr><td><b>${esc(c.label)}</b></td><td>${esc(c.detail)}</td><td>${c.available ? 'Var' : '<span class="muted">Eksik</span>'}</td></tr>`).join('')}</table>

<h2 class="pb">3. Mobil yerleşim</h2>
<div class="two" style="grid-template-columns: 70mm 1fr">
  <div>${mobileMock(d)}</div>
  <div><h3 style="margin-top:0">Mobil öneriler</h3><ul>${d.mobile.map((m) => `<li>${esc(m)}</li>`).join('')}</ul></div>
</div>

<h2>4. Renk ve tipografi önerisi</h2>
<p><b>${esc(p.name)}</b> — ${esc(p.why)}</p>
<div class="sw"><div style="background:${p.primary}">Ana renk ${p.primary}</div><div style="background:${p.accent}">Vurgu ${p.accent}</div><div style="background:${p.surface};color:#18181b;border:1px solid #e4e4e7">Zemin ${p.surface}</div><div style="background:${p.ink}">Metin ${p.ink}</div></div>
<p><b>Yazı tipleri:</b> başlıklar <span style="font-family:Outfit;font-size:12pt">${esc(d.typography.heading)}</span>, metin <span style="font-family:'Inter Tight'">${esc(d.typography.body)}</span>. ${esc(d.typography.why)}</p>
<p class="small muted">Şirketin mevcut kurumsal renkleri varsa öncelik onlarındır; bu palet, kurumsal kimlik yoksa ya da yenilenecekse bir başlangıç önerisidir.</p>

<h2 class="pb">5. Önce / sonra karşılaştırması</h2>
<table><tr><th>Konu</th><th>Şu an (ölçülen)</th><th>Konsept</th></tr>${d.compare.map((c) => `<tr><td><b>${esc(c.aspect)}</b></td><td>${esc(c.now)}</td><td>${esc(c.concept)}</td></tr>`).join('')}</table>

<h2>6. Notlar</h2>
<div class="note">Bu belge bir <b>tasarım konseptidir</b>; şirketin web sitesinde hiçbir değişiklik yapılmamıştır. Şirkete ait logo ve görseller, kullanım izni olmadan konsepte eklenmemiştir. [Köşeli parantez] içindeki alanlar şirketle birlikte doldurulacak içeriklerdir. Mevcut durum bölümündeki ölçümler ${esc(ctx.date)} tarihli otomatik analizden alınmıştır.</div>
<p class="small muted" style="margin-top:14px">${esc(b.name)} · ${esc(b.website)}${b.email ? ` · ${esc(b.email)}` : ''}${b.phone ? ` · ${esc(b.phone)}` : ''}</p>
</body></html>`
}
