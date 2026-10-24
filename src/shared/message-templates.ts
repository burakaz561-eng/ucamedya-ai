// Düzenlenebilir mesaj şablonları (Ayarlar → Mesaj gönderimi → Mesaj şablonları).
// Yer tutucular: {sirket} {sektor_ifadesi} {sektor} {sehir} {web_sitesi} {bulgu_1} {bulgu_2} {bulgular} {marka} {marka_web}
// Bulgu yer tutucuları yalnızca analizde ölçülmüş bulgularla doldurulur; bulgu yoksa ilgili cümle boş kalır.

export interface MessageTemplates {
  emailSubject: string
  emailBody: string
  whatsappBody: string
}

export const DEFAULT_TEMPLATES: MessageTemplates = {
  emailSubject: '{sirket} için ücretsiz UCA Radar dijital değerlendirmesi',
  emailBody: `Merhaba,
{sektor_ifadesi} markaların dijital görünürlüğünü ve kullanıcı deneyimini geliştirmeye yönelik yeni bir çalışma başlattık.

Bu yaklaşımla Uca Medya olarak, UCA Radar adını verdiğimiz bir dijital değerlendirme programı oluşturduk.

Bu çalışma kapsamında, markanızın web sitesini ve sosyal medya kanallarını ücretsiz olarak analiz ederek gelişime açık alanları ve değerlendirebileceğiniz dijital fırsatları sizinle paylaşmak isteriz.

Amacımız, markanıza dışarıdan profesyonel bir bakış açısı kazandırmak ve dijital iletişiminizi daha ileriye taşıyabilecek fırsatları birlikte keşfetmek.

İlginizi çekerse bu e-postayı yanıtlamanız yeterli. Markanıza özel kısa bir Uca Radar değerlendirmesi hazırlamaktan memnuniyet duyarız.

İyi çalışmalar,`,
  whatsappBody: `Merhaba,
{sektor_ifadesi} markaların dijital görünürlüğünü ve kullanıcı deneyimini geliştirmeye yönelik yeni bir çalışma başlattık.

Bu yaklaşımla Uca Medya olarak, UCA Radar adını verdiğimiz bir dijital değerlendirme programı oluşturduk. Bu kapsamda markanızın web sitesini ve sosyal medya kanallarını ücretsiz olarak analiz ederek gelişime açık alanları ve dijital fırsatları sizinle paylaşmak isteriz.

İlginizi çekerse bu mesajı yanıtlamanız yeterli; markanıza özel kısa bir Uca Radar değerlendirmesi hazırlamaktan memnuniyet duyarız.

İyi çalışmalar,
Uca Medya`
}

export const TEMPLATE_PLACEHOLDERS: { key: string; label: string }[] = [
  { key: '{sirket}', label: 'Şirketin kısa adı (ör. "RAMADİ YAPI İNŞAAT")' },
  { key: '{sektor_ifadesi}', label: '"İnşaat sektöründeki" — sektör yoksa "Farklı sektörlerdeki"' },
  { key: '{sektor}', label: 'Sektör (küçük harf)' },
  { key: '{sehir}', label: 'Şehir' },
  { key: '{web_sitesi}', label: 'Şirketin web sitesi' },
  { key: '{bulgu_1}', label: 'Analizdeki en önemli ölçülmüş bulgu (yoksa boş)' },
  { key: '{bulgu_2}', label: 'İkinci bulgu (yoksa boş)' },
  { key: '{bulgular}', label: 'İlk iki bulgu, "ve" ile' },
  { key: '{marka}', label: 'Marka adınız (Ayarlar → Marka)' },
  { key: '{marka_web}', label: 'Web siteniz' }
]

/** "RAMADİ YAPI İNŞAAT | Gebze Fabrika Tadilatı ve Kentsel Dönüşüm" → "RAMADİ YAPI İNŞAAT" */
export function shortCompanyName(name: string): string {
  const first = name.split(/\s+[|–—]\s+|\s+-\s+|\s*\|\s*/)[0].trim()
  return (first.length >= 2 ? first : name).slice(0, 80)
}

const lowerTr = (s: string) => s.toLocaleLowerCase('tr-TR')
const upperFirst = (s: string) => (s ? s.charAt(0).toLocaleUpperCase('tr-TR') + s.slice(1) : s)

export interface TemplateVars {
  company: string
  sector: string | null
  city: string | null
  website: string | null
  findings: string[]
  brandName: string
  brandWeb: string
}

export function renderTemplate(tpl: string, v: TemplateVars): string {
  const sector = v.sector ? lowerTr(v.sector) : ''
  const f = v.findings.map((x) => lowerTr(x.charAt(0)) + x.slice(1))
  const map: Record<string, string> = {
    '{sirket}': shortCompanyName(v.company),
    '{sektor_ifadesi}': sector ? `${sector} sektöründeki` : 'farklı sektörlerdeki',
    '{sektor}': sector,
    '{sehir}': v.city ?? '',
    '{web_sitesi}': v.website ?? '',
    '{bulgu_1}': f[0] ?? '',
    '{bulgu_2}': f[1] ?? '',
    '{bulgular}': f.slice(0, 2).join(' ve '),
    '{marka}': v.brandName,
    '{marka_web}': v.brandWeb
  }
  let out = tpl
  for (const [k, val] of Object.entries(map)) out = out.split(k).join(val)
  // Cümle başına gelen yer tutucuyu büyük harfle başlat (ör. "{sektor_ifadesi} markaların…")
  out = out.replace(/(^|[.!?]\s+|\n)([a-zçğıöşü])/g, (_m, p: string, c: string) => p + upperFirst(c))
  // Boş kalan bulgu yer tutucularından doğan fazla boşlukları temizle
  return out.replace(/[ \t]{2,}/g, ' ').replace(/ ([,.])/g, '$1').trim()
}
