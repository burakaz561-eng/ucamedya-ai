// Hazır otomasyon profilleri. Kullanıcı bunları düzenleyebilir, silebilir, yenilerini ekleyebilir.

export interface ProfileConfig {
  sectors: string[]
  locations: { city: string; district?: string }[]
  customerTypes: string[]
  analysisTypes: string[]
  extraQueries: string[]
  targetCount: number
  tone: string
  channels: ('email' | 'whatsapp')[]
  steps: { analyze: boolean; screenshots: boolean; pdf: boolean; drafts: boolean }
  reportFormat: 'standard' | 'short'
}

const base: ProfileConfig = {
  sectors: [],
  locations: [],
  customerTypes: [],
  analysisTypes: ['design', 'mobile', 'ux', 'performance', 'seo', 'trust'],
  extraQueries: [],
  targetCount: 25,
  tone: 'professional',
  channels: ['email'],
  steps: { analyze: true, screenshots: true, pdf: true, drafts: true },
  reportFormat: 'standard'
}

export const DEFAULT_PROFILES: { name: string; description: string; config: ProfileConfig }[] = [
  { name: 'İnşaat firmaları araştırması', description: 'Kocaeli ve çevresindeki inşaat firmaları; tam analiz.', config: { ...base, sectors: ['İnşaat'], locations: [{ city: 'Kocaeli' }], targetCount: 40 } },
  { name: 'Web sitesi olmayan şirketler', description: 'Sitesi bulunmayan işletmeler; analiz yerine web tasarım teklifi odaklı taslak.', config: { ...base, customerTypes: ['no_website'], steps: { analyze: false, screenshots: false, pdf: false, drafts: true } } },
  { name: 'Mobil tasarım iyileştirme fırsatları', description: 'Mobil uyumluluk sorunları öne çıkan siteler.', config: { ...base, customerTypes: ['mobile'], analysisTypes: ['mobile', 'ux', 'design'] } },
  { name: 'E-ticaret web sitesi geliştirme fırsatları', description: 'Ürün satan ama e-ticaret altyapısı zayıf firmalar.', config: { ...base, customerTypes: ['ecommerce'], sectors: ['Mobilya', 'E-ticaret', 'Üretim'] } },
  { name: 'SEO hizmeti fırsatları', description: 'Teknik SEO eksikleri belirgin siteler.', config: { ...base, customerTypes: ['seo'], analysisTypes: ['seo', 'performance'], tone: 'technical' } },
  { name: 'Kurumsal kimlik ve tasarım hizmetleri', description: 'Kurumsal güven ve görsel tutarlılığı zayıf firmalar.', config: { ...base, customerTypes: ['identity', 'visual'], analysisTypes: ['design', 'trust'] } }
]
