# 0.3 Ek Geliştirme Paketi — Mevcut durum ve plan (2026-10-25)

Mevcut uygulama (0.2.4) incelendi. Var olan işlevler korunur; yeni işler ayrı modüllere eklenir. Veritabanı değişiklikleri yeni migration sürümleriyle yapılır. Migration öncesi otomatik yedek alınır.

## Modül modül: ne var, ne eksik, nereye eklenecek

| Modül | Zaten çalışan | Eksik | Dosyalar |
|---|---|---|---|
| 1. Fırsat analizi | 0–100 puan, 5 ağırlıklı bileşen + gerekçe, ağırlıklar Ayarlar'da, gruplar (7), iletişim doğrulama, daha önce iletişim, hizmet uyumu | Grup adları istenen 5 gruba uyarlanacak (Öncelikli fırsat / Yüksek hizmet uyumu / Ek inceleme gerekli / Düşük öncelik / İletişim için uygun değil); verisi olmayan kriter "veri yok" gösterilecek | `research/scoring.ts`, `shared/constants.ts` |
| 2. Tasarım konsepti | Analiz bulguları, ekran görüntüleri, PDF altyapısı | Tamamı: konsept üretici (ana sayfa düzeni, başlıklar, hizmet kartları, iletişim butonları, mobil yerleşim, renk/tipografi), önce/sonra sunum PDF'i | yeni `concepts/concept-service.ts`, `reports/concept-template.ts` |
| 3. CRM | Müşteri kartı, kaynaklar, notlar, görevler, dosyalar, geçmiş, birleştirme, kesin eşleşmede (alan adı/telefon/e-posta/sağlayıcı) tekrar kaydı engeli | Emin olunmayan eşleşmeler için onay kuyruğu, "son görülme", iletişim tercihi, kartta son analiz tarihi + sonraki görev özeti | `services/companies.ts`, yeni `services/matching.ts`, `pages/CompanyDrawer.tsx` |
| 4. Kanban | 16 düzenlenebilir aşama, aşama değişikliği günlüğü, "İletişim istemiyor" → ret listesi | Sürükle-bırak pano, "Yanıt geldi" aşaması, aşama geçmişi tablosu | yeni `pages/Pipeline.tsx`, migration |
| 5. Web sitesi entegrasyonu | — | WordPress eklentisi (talepleri saklar, anahtarla korunan REST ucu), masaüstünde periyodik çekme, eşleştirme, bildirim, talep kartı | yeni `wordpress/ucamedya-baglanti/`, `integrations/website-leads.ts`, `pages/Leads.tsx` |
| 6. Teklif formu | — | Eklentide hizmete göre soru değiştiren kısa form (8 hizmet), KVKK onayı, spam koruması | eklenti |
| 7. Ön analiz aracı | Masaüstünde güçlü analiz motoru (SSRF korumalı) | Sitede ziyaretçi aracı: erişim, HTTPS, başlık/meta, mobil viewport, temel performans, görsel boyutları; özel IP engeli | eklenti |
| 8. Teklif PDF | Teklif, KDV, indirim, geçerlilik, ödeme, PDF, karta bağlı | Analizden teklif taslağı (önerilen hizmetler, analiz özeti, sonraki adımlar); fiyatlar boş gelir, kullanıcı girer | `services/offers.ts`, `pages/Offers.tsx` |
| 9. Görevler | Görev, öncelik, durum, hatırlatma | Ana panelde bugün/geciken, hazır görev şablonları | `pages/Dashboard.tsx` |
| 10. Analitik | Huni, kanal, sektör/şehir raporları | Web sitesi talepleri, hizmet bazında talep, olumlu yanıt, kazanılan/kaybedilen, tahminî ve gerçekleşen gelir ayrımı, "veri yok" gösterimi | `services/stats.ts`, `pages/Reports.tsx` |
| 11. Asistan | Robot olay bildirimleri | Soru-cevap paneli: yalnızca veritabanındaki verilerle yanıt, işlem öncesi onay | yeni `assistant/assistant.ts`, `components/AssistantPanel.tsx` |
| 12. Güvenlik | Yedek, sürümlü migration, test modu, ret listesi, tekrar gönderim engeli, gizli anahtar deposu, SSRF koruması | Migration öncesi otomatik yedek | `database/db.ts` |

Önemli not: ucamedya.com.tr temasında (v6) zaten bir teklif hesaplayıcı ve PageSpeed tabanlı "ücretsiz analiz" bölümü vardı. Tema kaynak klasörü bu bilgisayarda artık yok. Bu yüzden form ve ön analiz, temadan bağımsız çalışan bir WordPress eklentisi olarak yazılır ve kısa kodla istenen sayfaya eklenir.

## Bağlantı güvenliği (Modül 5)

Masaüstü uygulamasının internetten erişilebilir bir adresi yoktur. Bu yüzden talepleri **uygulama siteden çeker**:
- Eklenti talepleri kendi tablosunda saklar.
- Eklenti, etkinleştirildiğinde rastgele bir bağlantı anahtarı üretir. Anahtar WordPress yönetim panelinde gösterilir.
- Masaüstü uygulaması bu anahtarı işletim sisteminin güvenli deposunda saklar.
- Uygulama birkaç dakikada bir HTTPS ile yeni talepleri sorar ve aldıklarını onaylar.
- Anahtar olmadan talepler okunamaz.
