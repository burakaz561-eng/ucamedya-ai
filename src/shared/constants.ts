// Uygulama genelinde kullanılan sabit listeler. Kullanıcının düzenleyebildiği listeler
// (aşamalar, hizmetler) veritabanına bu değerlerle tohumlanır; sonrasında veritabanı esas alınır.

export const APP_NAME = 'UcaMedya AI Growth Studio'
export const BRAND_SITE = 'https://ucamedya.com.tr/'

export const SECTORS = [
  'İnşaat', 'Gayrimenkul', 'Mimarlık', 'İç mimarlık', 'Mobilya', 'Otomotiv', 'Sağlık ve klinikler',
  'Güzellik merkezleri', 'Restoran ve kafeler', 'Oteller', 'Turizm', 'E-ticaret', 'Üretim', 'Lojistik',
  'Eğitim', 'Hukuk büroları'
] as const

/** Arama sorgularında sektör adının yanına eklenen eş anlamlılar (daha iyi kapsama için). */
export const SECTOR_QUERY_HINTS: Record<string, string[]> = {
  'İnşaat': ['inşaat firması', 'inşaat şirketi', 'müteahhit'],
  'Gayrimenkul': ['emlak ofisi', 'gayrimenkul danışmanlığı'],
  'Mimarlık': ['mimarlık ofisi', 'mimarlık bürosu'],
  'İç mimarlık': ['iç mimarlık ofisi', 'iç mimar'],
  'Mobilya': ['mobilya mağazası', 'mobilya imalatı'],
  'Otomotiv': ['oto galeri', 'otomotiv servisi', 'oto yedek parça'],
  'Sağlık ve klinikler': ['özel klinik', 'diş kliniği', 'tıp merkezi'],
  'Güzellik merkezleri': ['güzellik merkezi', 'estetik merkezi', 'kuaför'],
  'Restoran ve kafeler': ['restoran', 'kafe'],
  'Oteller': ['otel', 'butik otel'],
  'Turizm': ['turizm acentesi', 'seyahat acentesi'],
  'E-ticaret': ['online mağaza', 'e-ticaret firması'],
  'Üretim': ['üretim firması', 'fabrika', 'imalat'],
  'Lojistik': ['lojistik firması', 'nakliye firması'],
  'Eğitim': ['özel okul', 'kurs merkezi', 'eğitim kurumu'],
  'Hukuk büroları': ['hukuk bürosu', 'avukatlık bürosu']
}

export const CUSTOMER_TYPES = [
  { key: 'no_website', label: 'Web sitesi olmayan şirketler' },
  { key: 'outdated', label: 'Eski tasarıma sahip web siteleri' },
  { key: 'mobile', label: 'Mobil uyumluluk sorunu bulunan siteler' },
  { key: 'slow', label: 'Yavaş çalışan web siteleri' },
  { key: 'visual', label: 'Görsel kalitesi düşük siteler' },
  { key: 'seo', label: 'SEO açısından geliştirilebilecek siteler' },
  { key: 'conversion', label: 'İletişim ve teklif alma süreçleri zayıf siteler' },
  { key: 'ecommerce', label: 'E-ticaret altyapısını geliştirebilecek şirketler' },
  { key: 'identity', label: 'Kurumsal kimlik yenilemeye ihtiyaç duyabilecek firmalar' }
] as const

export const RESEARCH_TARGETS = [10, 25, 50, 100] as const

export const DEFAULT_STAGES: { key: string; label: string; color: string; terminal?: boolean }[] = [
  { key: 'new', label: 'Yeni bulundu', color: 'neutral' },
  { key: 'researching', label: 'Araştırılıyor', color: 'info' },
  { key: 'awaiting_analysis', label: 'Analiz bekliyor', color: 'neutral' },
  { key: 'analyzed', label: 'Analiz tamamlandı', color: 'info' },
  { key: 'review', label: 'İnceleme bekliyor', color: 'warning' },
  { key: 'approved', label: 'İletişim için onaylandı', color: 'brand' },
  { key: 'contacted', label: 'İlk iletişim kuruldu', color: 'brand' },
  { key: 'waiting_reply', label: 'Yanıt bekleniyor', color: 'warning' },
  { key: 'meeting', label: 'Görüşme planlandı', color: 'success' },
  { key: 'offer_prepared', label: 'Teklif hazırlandı', color: 'info' },
  { key: 'offer_sent', label: 'Teklif gönderildi', color: 'info' },
  { key: 'negotiation', label: 'Müzakere', color: 'warning' },
  { key: 'won', label: 'Müşteri kazanıldı', color: 'success', terminal: true },
  { key: 'lost', label: 'Kaybedildi', color: 'danger', terminal: true },
  { key: 'do_not_contact', label: 'İletişim istemiyor', color: 'danger', terminal: true },
  { key: 'archived', label: 'Arşivlendi', color: 'neutral', terminal: true }
]

export const PRIORITY_GROUPS = [
  { key: 'priority', label: 'Öncelikli inceleme' },
  { key: 'high_fit', label: 'Yüksek hizmet uyumu' },
  { key: 'mid_fit', label: 'Orta düzey hizmet uyumu' },
  { key: 'needs_research', label: 'Ek araştırma gerekiyor' },
  { key: 'not_suitable', label: 'İletişim için uygun değil' },
  { key: 'contacted_before', label: 'Daha önce iletişim kurulmuş' },
  { key: 'opted_out', label: 'İletişim istemiyor' }
] as const

export const DEFAULT_SERVICES: { key: string; name: string; description: string; unit: string }[] = [
  { key: 'corporate_web', name: 'Kurumsal web tasarımı', description: 'Markaya özel, mobil uyumlu kurumsal web sitesi tasarımı ve kurulumu.', unit: 'proje' },
  { key: 'wordpress', name: 'WordPress web sitesi geliştirme', description: 'Yönetim paneli ile kolay güncellenebilen WordPress sitesi.', unit: 'proje' },
  { key: 'ecommerce', name: 'E-ticaret sitesi kurulumu', description: 'Ürün, ödeme ve kargo altyapısıyla e-ticaret sitesi.', unit: 'proje' },
  { key: 'redesign', name: 'Web sitesi yenileme', description: 'Mevcut sitenin tasarım, içerik yapısı ve mobil deneyiminin yenilenmesi.', unit: 'proje' },
  { key: 'technical_seo', name: 'Teknik SEO', description: 'Başlık, meta, site haritası, yapılandırılmış veri ve indekslenebilirlik düzenlemeleri.', unit: 'proje' },
  { key: 'seo_consulting', name: 'SEO danışmanlığı', description: 'Aylık anahtar kelime, içerik ve performans danışmanlığı.', unit: 'ay' },
  { key: 'speed', name: 'Hız optimizasyonu', description: 'Görsel, önbellek ve kaynak optimizasyonu ile sayfa hızının iyileştirilmesi.', unit: 'proje' },
  { key: 'graphic', name: 'Grafik tasarım', description: 'Afiş, broşür, katalog ve reklam tasarımları.', unit: 'adet' },
  { key: 'identity', name: 'Kurumsal kimlik tasarımı', description: 'Logo, renk, tipografi ve kurumsal kimlik kılavuzu.', unit: 'proje' },
  { key: 'social_design', name: 'Sosyal medya tasarımı', description: 'Markaya uygun sosyal medya gönderi ve hikâye tasarımları.', unit: 'ay' },
  { key: 'content', name: 'Dijital içerik üretimi', description: 'Fotoğraf, video ve metin içerik üretimi.', unit: 'ay' },
  { key: 'maintenance', name: 'Web sitesi bakım ve destek hizmetleri', description: 'Güncelleme, yedekleme, güvenlik ve içerik desteği.', unit: 'ay' }
]

export const MESSAGE_TONES = [
  { key: 'professional', label: 'Profesyonel' },
  { key: 'friendly', label: 'Samimi' },
  { key: 'corporate', label: 'Kurumsal' },
  { key: 'short', label: 'Kısa ve net' },
  { key: 'consulting', label: 'Danışmanlık odaklı' },
  { key: 'technical', label: 'Teknik inceleme odaklı' }
] as const

export const REWRITE_ACTIONS = [
  { key: 'rewrite', label: 'Yeniden yaz' },
  { key: 'shorten', label: 'Kısalt' },
  { key: 'more_professional', label: 'Daha profesyonel yap' },
  { key: 'more_friendly', label: 'Daha samimi yap' },
  { key: 'more_technical', label: 'Teknik ayrıntıları artır' },
  { key: 'add_findings', label: 'Analiz bulgularını ekle' },
  { key: 'fix_spelling', label: 'Yazım hatalarını düzelt' },
  { key: 'to_email', label: 'E-posta sürümüne dönüştür' },
  { key: 'to_whatsapp', label: 'WhatsApp sürümüne dönüştür' },
  { key: 'alternative', label: 'Yeni alternatif üret' }
] as const

export const FINDING_CATEGORIES = {
  design: 'Görsel tasarım',
  mobile: 'Mobil uyumluluk',
  ux: 'Kullanıcı deneyimi',
  performance: 'Teknik performans',
  seo: 'SEO',
  trust: 'Kurumsal güven'
} as const
export type FindingCategory = keyof typeof FINDING_CATEGORIES

export const SEVERITY_LABELS = { high: 'Yüksek', medium: 'Orta', low: 'Düşük', info: 'Bilgi' } as const
export type Severity = keyof typeof SEVERITY_LABELS

export const OFFER_STATUSES = [
  { key: 'draft', label: 'Taslak' },
  { key: 'sent', label: 'Gönderildi' },
  { key: 'negotiation', label: 'Müzakere' },
  { key: 'won', label: 'Kazanıldı' },
  { key: 'lost', label: 'Kaybedildi' },
  { key: 'expired', label: 'Süresi doldu' }
] as const

export const SALES_FUNNEL = ['Potansiyel müşteri', 'Görüşme', 'İhtiyaç analizi', 'Teklif', 'Müzakere', 'Kazanıldı/Kaybedildi'] as const

export const TASK_PRIORITIES = [
  { key: 'low', label: 'Düşük' },
  { key: 'normal', label: 'Normal' },
  { key: 'high', label: 'Yüksek' },
  { key: 'urgent', label: 'Acil' }
] as const

/** Puanlama ağırlıkları (Ayarlar > Puanlama'dan değiştirilebilir). Toplamı 100 olmak zorunda değildir; normalize edilir. */
export const DEFAULT_SCORING_WEIGHTS = {
  improvementNeed: 35,
  serviceFit: 20,
  activeSignals: 15,
  contactValidity: 15,
  opportunitySignals: 15
}

export const DEFAULT_CATEGORY_WEIGHTS: Record<FindingCategory, number> = {
  design: 1, mobile: 1, ux: 1, performance: 1, seo: 1, trust: 1
}
