// Tasarım iyileştirme konsepti: analiz verisinden örnek ana sayfa düzeni, metinler, hizmet kartları,
// iletişim butonları, mobil yerleşim ve renk/tipografi önerisi üretir.
//
// İlkeler:
//  - Gerçek web sitesine hiçbir şey yapılmaz; çıktı ayrı bir sunumdur (PDF).
//  - Şirketin logosu ve görselleri konsepte KOYULMAZ (kullanım izni bilinmiyor); şirket adı yazı olarak gösterilir.
//    "Önce" bölümünde yalnızca analizde alınan, herkese açık sayfanın ekran görüntüsü kullanılır.
//  - Şirket hakkında bilinmeyen bir iddia (yıl, ödül, müşteri sayısı) yazılmaz; doldurulması gereken yerler [köşeli parantez] ile işaretlenir.

import { shortCompanyName } from '@shared/message-templates'
import { fold } from '@shared/text'

export interface ConceptInput {
  company: { name: string; sector: string | null; city: string | null; website: string | null }
  title: string | null
  metaDescription: string | null
  h1: string[]
  headings: { level: number; text: string }[]
  fontFamilies: number | null
  textColors: number | null
  hasViewport: boolean | null
  hamburger: boolean | null
  contacts: { phone: string | null; whatsapp: string | null; email: string | null }
  findings: { code: string; title: string; severity: string; recommendation: string | null; category: string }[]
}

export interface ConceptData {
  brandName: string
  sectorLabel: string
  palette: { name: string; primary: string; accent: string; surface: string; ink: string; why: string }
  typography: { heading: string; body: string; why: string }
  hero: { headlines: string[]; subline: string; sublineFromSite: boolean }
  services: { title: string; text: string; fromSite: boolean }[]
  ctas: { label: string; detail: string; available: boolean }[]
  mobile: string[]
  improvements: { title: string; recommendation: string }[]
  compare: { aspect: string; now: string; concept: string }[]
}

const GENERIC = /^(hakkimizda|iletisim|bize ulasin|anasayfa|ana sayfa|haberler|blog|duyurular|referanslar|galeri|kariyer|sss|sik sorulan sorular|menu|kvkk|gizlilik|cerez|copyright|tum haklari)/ // fold() edilmiş metinle karşılaştırılır

const PALETTES: { re: RegExp; p: ConceptData['palette']; cards: string[] }[] = [
  { re: /insaat|yapi|mimar|tadilat|dekorasyon|zemin|cati/, p: { name: 'Sağlam & enerjik', primary: '#1F3A5F', accent: '#F28C28', surface: '#F5F3EF', ink: '#1B1F24', why: 'Lacivert güven ve sağlamlık, turuncu ise harekete geçirici butonlar için dikkat çeker.' }, cards: ['Konut projeleri', 'Ticari yapılar', 'Tadilat ve renovasyon', 'Proje danışmanlığı'] },
  { re: /emlak|gayrimenkul/, p: { name: 'Prestij', primary: '#14213D', accent: '#C9A227', surface: '#F7F7F5', ink: '#111827', why: 'Koyu lacivert ve altın tonu, gayrimenkulde güven ve değer algısını destekler.' }, cards: ['Satılık ilanlar', 'Kiralık ilanlar', 'Değerleme', 'Yatırım danışmanlığı'] },
  { re: /saglik|klinik|dis|hastane|medikal|doktor|fizyoterapi|eczane|veteriner/, p: { name: 'Temiz & sakin', primary: '#0F766E', accent: '#0EA5E9', surface: '#F2F8F8', ink: '#0F172A', why: 'Teal ve açık mavi, sağlıkta temizlik ve güven hissi verir; yüksek kontrast okunabilirliği korur.' }, cards: ['Muayene ve tanı', 'Tedavi hizmetleri', 'Uzman kadro', 'Online randevu'] },
  { re: /restoran|kafe|cafe|yemek|gida|pastane|firin|catering/, p: { name: 'Sıcak & iştah açıcı', primary: '#7C2D12', accent: '#F59E0B', surface: '#FFF8F0', ink: '#1C1917', why: 'Sıcak kahve-kırmızı ve amber tonları yiyecek-içecekte iştah ve samimiyet çağrıştırır.' }, cards: ['Menü', 'Rezervasyon', 'Paket servis', 'Özel organizasyonlar'] },
  { re: /hukuk|avukat|danisman|muhasebe|mali musavir|sigorta/, p: { name: 'Kurumsal & ciddi', primary: '#1E293B', accent: '#B08D57', surface: '#F8F8F6', ink: '#0F172A', why: 'Koyu arduvaz ve bronz vurgu profesyonellik ve güvenilirlik algısı oluşturur.' }, cards: ['Hizmet alanları', 'Danışmanlık süreci', 'Uzman ekip', 'Ücretsiz ön görüşme'] },
  { re: /otel|turizm|seyahat|pansiyon/, p: { name: 'Ferah', primary: '#0E4D64', accent: '#F4A261', surface: '#F4FAFB', ink: '#102A33', why: 'Deniz mavisi ve gün batımı turuncusu konaklama ve tatil hissini destekler.' }, cards: ['Odalar', 'Olanaklar', 'Konum', 'Online rezervasyon'] },
  { re: /guzellik|kuafor|estetik|spa|bakim/, p: { name: 'Zarif', primary: '#5B2A4C', accent: '#E8A1B0', surface: '#FBF6F8', ink: '#24131F', why: 'Mürdüm ve pudra pembe, güzellik ve bakım sektöründe zarafet çağrıştırır.' }, cards: ['Hizmetler', 'Fiyat listesi', 'Uzmanlarımız', 'Online randevu'] },
  { re: /egitim|okul|kurs|akademi|dershane/, p: { name: 'Canlı & güvenilir', primary: '#1D4ED8', accent: '#FACC15', surface: '#F5F8FF', ink: '#0F172A', why: 'Mavi güven, sarı enerji ve öğrenme heyecanı için kullanılır.' }, cards: ['Programlar', 'Eğitmenler', 'Kayıt süreci', 'Başarı hikâyeleri'] },
  { re: /oto|arac|servis|lastik|galeri/, p: { name: 'Dinamik', primary: '#111827', accent: '#DC2626', surface: '#F6F6F7', ink: '#0B0F19', why: 'Koyu antrasit ve kırmızı vurgu otomotivde güç ve hız algısını öne çıkarır.' }, cards: ['Bakım ve onarım', 'Yedek parça', 'Ekspertiz', 'Randevu al'] },
  { re: /e-?ticaret|magaza|tekstil|moda|giyim|butik/, p: { name: 'Modern perakende', primary: '#18181B', accent: '#E11D48', surface: '#FAFAFA', ink: '#09090B', why: 'Siyah-beyaz zemin ürünleri öne çıkarır, canlı vurgu rengi sepete ekle butonlarını belirginleştirir.' }, cards: ['Yeni gelenler', 'Çok satanlar', 'Kampanyalar', 'Kargo ve iade'] }
]
const DEFAULT_PALETTE = { p: { name: 'Nötr profesyonel', primary: '#1F2937', accent: '#2563EB', surface: '#F7F7F8', ink: '#111827', why: 'Nötr koyu gri zemin, mavi vurgu ile her sektöre uyan sade ve okunaklı bir yapı sunar.' }, cards: ['Hizmetlerimiz', 'Neden biz?', 'Çalışma sürecimiz', 'Referanslar'] }

const MOBILE_TIPS: Record<string, string> = {
  mobile_no_viewport: 'Sayfaya mobil ölçekleme (viewport) etiketi eklenmeli; yerleşim telefon genişliğine göre akmalı.',
  mobile_overflow: 'Yatay kaydırmaya yol açan geniş bölümler esnek genişliğe çevrilmeli; görseller ekran genişliğini aşmamalı.',
  mobile_small_text: 'Gövde metni mobilde en az 16 px olmalı; satır aralığı 1.5 civarında tutulmalı.',
  mobile_small_targets: 'Buton ve menü öğeleri en az 44×44 px dokunma alanına sahip olmalı.',
  mobile_menu: 'Mobilde açılır (hamburger) menü kullanılmalı; menü en fazla 6 ana başlıktan oluşmalı.'
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim()

export function buildConcept(i: ConceptInput): ConceptData {
  const brand = shortCompanyName(i.company.name)
  const sec = i.company.sector ? clean(i.company.sector) : ''
  const pal = PALETTES.find((x) => x.re.test(fold(sec))) ?? DEFAULT_PALETTE
  const sectorLabel = sec ? sec.toLocaleLowerCase('tr-TR') : 'sektörünüz'

  const headlines = [
    `${brand}: ${sec ? `${sectorLabel} alanında` : ''} [işinizi tek cümlede anlatan net vaat]`.replace(/\s+/g, ' '),
    `${i.company.city ? `${clean(i.company.city)}'de ` : ''}${sec ? `${sectorLabel} için ` : ''}doğru adres: ${brand}`,
    `[Müşterinizin en sık sorduğu soruya yanıt veren başlık] — ${brand}`
  ]
  const meta = i.metaDescription ? clean(i.metaDescription) : ''
  const hero = { headlines, subline: meta.length >= 40 ? meta : '[Hizmetlerinizi ve sizi rakiplerinizden ayıran özelliği anlatan 1–2 cümle — müşteriyle netleştirilir]', sublineFromSite: meta.length >= 40 }

  const siteCards = [...new Set(i.headings.filter((h) => h.level >= 2 && h.level <= 3).map((h) => clean(h.text)).filter((t) => t.length >= 4 && t.length <= 42 && !GENERIC.test(fold(t)) && !/\d{4}/.test(t)))].slice(0, 4)
  const services = siteCards.length >= 2
    ? siteCards.map((t) => ({ title: t, text: '[Bu hizmetin müşteriye faydasını anlatan kısa açıklama]', fromSite: true }))
    : pal.cards.map((t) => ({ title: t, text: '[Kısa açıklama — örnek kart, şirketin gerçek hizmetleriyle değiştirilir]', fromSite: false }))

  const ctas = [
    { label: 'Hemen arayın', detail: i.contacts.phone ?? 'telefon numarası eklenmeli', available: !!i.contacts.phone },
    { label: "WhatsApp'tan yazın", detail: i.contacts.whatsapp ?? 'WhatsApp numarası eklenmeli', available: !!i.contacts.whatsapp },
    { label: 'Teklif isteyin', detail: 'Kısa form (ad, telefon/e-posta, ihtiyaç) — 3 alanı geçmemeli', available: true }
  ]

  const codes = new Set(i.findings.map((f) => f.code))
  const mobile = Object.entries(MOBILE_TIPS).filter(([c]) => codes.has(c)).map(([, t]) => t)
  mobile.push('Ekranın altında sabit, iki butonlu iletişim çubuğu: "Ara" ve "WhatsApp".')
  mobile.push('İlk ekranda yalnızca başlık, kısa açıklama ve tek bir ana buton; hizmet kartları alt alta tek sütun.')

  const improvements = i.findings
    .filter((f) => (f.severity === 'high' || f.severity === 'medium') && f.recommendation)
    .slice(0, 8)
    .map((f) => ({ title: f.title, recommendation: f.recommendation! }))

  const ctaNow = [i.contacts.phone && 'telefon', i.contacts.whatsapp && 'WhatsApp', i.contacts.email && 'e-posta'].filter(Boolean).join(', ')
  const compare = [
    { aspect: 'Ana başlık (H1)', now: i.h1.length ? `"${clean(i.h1[0]).slice(0, 70)}"${i.h1.length > 1 ? ` (+${i.h1.length - 1} H1 daha)` : ''}` : 'Yok', concept: 'Tek, faydayı anlatan net başlık + kısa açıklama' },
    { aspect: 'Sayfa başlığı (title)', now: i.title ? `"${clean(i.title).slice(0, 70)}"` : 'Yok', concept: `"${brand} | ${sec || '[ana hizmet]'}${i.company.city ? ` – ${clean(i.company.city)}` : ''}"` },
    { aspect: 'Yazı tipi sayısı', now: i.fontFamilies != null ? String(i.fontFamilies) : 'ölçülemedi', concept: '2 (başlık + metin)' },
    { aspect: 'Metin rengi sayısı', now: i.textColors != null ? String(i.textColors) : 'ölçülemedi', concept: '3–4 (ana, ikincil, vurgu)' },
    { aspect: 'Mobil ölçekleme', now: i.hasViewport == null ? 'ölçülemedi' : i.hasViewport ? 'Var' : 'Yok', concept: 'Var, tek sütun mobil yerleşim' },
    { aspect: 'Mobil menü', now: i.hamburger == null ? 'ölçülemedi' : i.hamburger ? 'Var' : 'Tespit edilmedi', concept: 'Açılır menü + sabit iletişim çubuğu' },
    { aspect: 'İletişim kanalları', now: ctaNow || 'bulunamadı', concept: 'Ara · WhatsApp · Teklif formu her ekranda erişilebilir' }
  ]

  return {
    brandName: brand,
    sectorLabel: sec || 'Belirtilmemiş',
    palette: pal.p,
    typography: { heading: 'Outfit', body: 'Inter Tight', why: 'Geometrik, modern bir başlık yazı tipi ile ekranda çok okunaklı bir metin yazı tipi; ikisi de Türkçe karakterleri tam destekler. Toplam 2 yazı tipi sayfa hızını korur.' },
    hero,
    services,
    ctas,
    mobile,
    improvements,
    compare
  }
}
