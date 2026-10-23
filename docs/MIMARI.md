# UcaMedya AI Growth Studio — Teknik Mimari ve Ekran Planı

Bu belge, uygulamanın neden bu şekilde kurulduğunu ve hangi parçanın nerede durduğunu açıklar.
Özelliklerin gerçek durumu (çalışıyor / gerçek hesapla denenmedi / anahtar bekliyor / yok) için
[`DURUM-RAPORU.md`](DURUM-RAPORU.md) dosyasına bakın.

## 1. Teknoloji seçimi

| Katman | Seçim | Neden |
|---|---|---|
| Masaüstü çerçevesi | **Electron 44** | Windows + macOS tek kod tabanı; ekran görüntüsü, PDF üretimi (printToPDF) ve dosya gezgini entegrasyonu hazır. Aynı yığın KariyerRadar AI'da üretimde çalışıyor. |
| Arayüz | **React 19 + TypeScript**, kendi tasarım sistemi (CSS değişkenleri) | Ağır bir UI kütüphanesi yerine UcaMedya marka tokenları üzerine kurulu, açık/koyu tema destekli bileşenler. |
| 3D | **Three.js** | Robot karakter kodla (prosedürel) modellenir, PBR malzeme + ışık. Model GLB olarak da dışa aktarılabilir. WebGL yoksa veya "hafif mod" seçiliyse SVG robot gösterilir. |
| Veritabanı | **SQLite (`node:sqlite`, Node yerleşik)** | Yerel derleme gerektirmez → Windows/macOS paketlemesi sorunsuz. WAL modu, sürümlü migration, `VACUUM INTO` ile tutarlı yedek. |
| Sırlar | **Electron `safeStorage`** | Windows'ta DPAPI, macOS'ta Anahtar Zinciri. API anahtarları düz metin olarak diske, günlüğe veya arayüze gitmez. |
| Web analizi | **playwright-core + sistemde yüklü Edge/Chrome** | Ek tarayıcı indirmeden masaüstü ve mobil görünüm, DOM ölçümleri ve ekran görüntüsü. |
| Performans | **Google PageSpeed Insights API** (Lighthouse motoru) | Core Web Vitals ve Lighthouse puanları ölçülür; anahtar yoksa test "yapılamadı" olarak raporlanır, tahmin üretilmez. |
| Yapay zekâ | **Anthropic Claude** (varsayılan) veya **OpenAI** | Sağlayıcı ayarlardan seçilir. AI yalnızca kayıtlı bulgulardan yazar; ölçülmemiş sorun uyduramaz (istem + doğrulama). |
| E-posta | **nodemailer (SMTP) + imapflow (IMAP)** | Gmail/Google Workspace (uygulama şifresi), Outlook/Microsoft 365, kurumsal SMTP. |
| WhatsApp | **WhatsApp Business Platform (Cloud API)** + **manuel "tıkla-gönder"** modu | Resmî API ile şablon mesaj; resmî hesap yoksa wa.me bağlantısı açılır, gönder tuşuna kullanıcı basar. Gayriresmî WhatsApp Web otomasyonu yok (hesap kısıtlama riski). |
| Excel | **exceljs** | Müşteri listesi ve araştırma sonuçları .xlsx. |
| Paketleme | **electron-builder** | Windows NSIS kurulum; macOS DMG (x64 + arm64) yapılandırması, imzalama/notarization yer tutucuları. |

## 2. Katmanlar

```
src/
  main/                    Ana süreç (Node.js) — tüm iş mantığı burada
    database/              db.ts (bağlantı, migration, yedek), migrations.ts, repos/*
    security/              secrets.ts (safeStorage), app-lock.ts (isteğe bağlı parola)
    integrations/          Her dış servis ayrı modül: search/*, pagespeed, ai/*, email, whatsapp
    analysis/              site analiz motoru: browser.ts, checks/*, scoring.ts, report.ts
    research/              araştırma hattı (sorgu → keşif → doğrulama → analiz → puan → taslak)
    outreach/              izin kontrolü, gönderim kuyruğu, ret listesi
    jobs/                  kalıcı görev kuyruğu (eşzamanlılık, duraklat/devam/iptal, yeniden dene)
    files/                 müşteri klasör sistemi, dosya merkezi senkronu
    reports/               PDF (HTML şablon → printToPDF), Excel/CSV
    ipc.ts                 tek kanal + zod şema doğrulaması
  preload/                 contextBridge ile dar API (Node erişimi yok)
  renderer/                React arayüz
  shared/                  ortak tipler, sabitler (sektörler, aşamalar, hizmetler, iller)
```

Güvenlik: `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`; renderer yalnızca
`window.api.invoke(kanal, veri)` çağırabilir; her kanalın girdisi zod ile doğrulanır. Dış bağlantılar
yalnızca http/https ise varsayılan tarayıcıda açılır. Yerel ağ adreslerine (localhost, 192.168.x vb.)
analiz isteği atılmaz (SSRF koruması).

## 3. Veri modeli (SQLite)

Şartnamedeki 20 tablonun tamamı + yardımcılar:

- `companies` (şirket kartı; `deleted_at` ile yumuşak silme, `stage_key`, `opportunity_score`, `score_reasons`)
- `company_contacts` (kaynak URL + toplama tarihi + `kind`: kurumsal/kişisel — kişisel veri ek kontrole tabi)
- `research_projects`, `research_results` (hangi araştırma hangi şirketi buldu, aşama durumu)
- `website_analyses` (sürümlü: aynı şirket yeniden analiz edilirse yeni satır), `analysis_findings`, `screenshots`
- `outreach_drafts`, `outreach_permissions`, `outreach_messages` (benzersiz `idempotency_key` → tekrar gönderim imkânsız), `communication_events`
- `suppression_list` (ret/iletişim istemiyor — e-posta, telefon, alan adı)
- `email_accounts`, `whatsapp_accounts`, `integrations`
- `offers`, `offer_items`, `services` (düzenlenebilir hizmet kataloğu)
- `tasks`, `automation_runs`, `jobs` (kalıcı görev kuyruğu), `automation_profiles`
- `activity_logs`, `app_settings`, `stages` (düzenlenebilir), `tags`, `company_tags`, `notes`, `files`, `backups`

Silme politikası: şirket "Arşivle" ile gizlenir (varsayılan). Kalıcı silme ayrı onay ister; analizler,
ekran görüntüleri, taslaklar ve iletişim kayıtları da silinir, ancak **ret listesi kaydı asla silinmez**
(silinen şirkete yanlışlıkla yeniden yazılmasın diye). Kazanılmış / teklifi olan şirketler kalıcı silinemez.

## 4. Klasör sistemi

```
<Veri klasörü>/                         (ilk kurulumda seçilir; varsayılan Belgeler/UcaMedya AI Data)
  2026/<Sektör>/<İl>/<firma-adi>-<id>/
    company.json
    analyses/v1-2026-10-23/  analysis.json, website-report.pdf, screenshots/*.png
    contact/contact-details.json
    outreach/email-draft.txt, whatsapp-draft.txt
    offers/teklif-<no>.pdf
    history/activity-log.json
```

Dosya adları Türkçe karakterden arındırılır, Windows yasaklı karakterleri temizlenir, şirket kimliği
eklenerek çakışma önlenir. Analizler `v<sürüm>-<tarih>` alt klasörüne yazılır; eskiler silinmez.

## 5. Araştırma hattı (iş akışı)

| Aşama | Ne yapar | Hata olursa |
|---|---|---|
| 1 Araştırma | Sektör × şehir sorguları → arama sağlayıcısı (Google Places / SerpAPI / Brave / CSV) | Sağlayıcı yoksa açıkça "yapılandırılmamış"; manuel CSV içe aktarma önerilir |
| 2 Doğrulama | Alan adı / telefon / ad+şehir ile tekrar kontrolü, site erişilebilirliği, robots.txt | Erişilemeyen site "erişilemedi" olarak kaydedilir, "kötü site" sayılmaz |
| 3 Analiz | Masaüstü + mobil tarama, ekran görüntüleri, SEO/UX/güven kontrolleri, PageSpeed | Her şirket bağımsız; biri hata verirse diğerleri sürer |
| 4 Rapor | Şirket bazında PDF | — |
| 5 Taslak | AI ile kişiselleştirilmiş e-posta + WhatsApp taslağı (yalnız doğrulanmış bulgulardan) | AI yoksa şablon tabanlı taslak |
| 6–7 Kontrol/Onay | Kullanıcı inceler, onaylar | Onaysız hiçbir şey gönderilmez |
| 8 İletişim | Onaylı kayıtlar kuyruğa; izin + ret listesi + kanal kuralları kontrolü | Duraklat/devam/iptal; tekrar gönderim engeli |
| 9–11 | Yanıt eşleştirme (IMAP), görev/teklif, raporlama | — |

Her aşama ayrı başlatılabilir; durum `research_results` satırında saklanır, uygulama yeniden açıldığında
"çalışıyor" kalmış işler "yarıda kaldı" olarak işaretlenir ve kaldığı aşamadan yeniden denenir.

## 6. Ekran planı (sol menü)

1. **Genel Bakış** — gerçek kayıtlardan KPI'lar, günlük/haftalık/aylık grafikler, son otomasyonlar, başarısız görevler
2. **AI Müşteri Bulucu** — yeni araştırma sihirbazı, canlı şirket bazlı ilerleme, sonuç özeti
3. **Sektör Araştırması** — araştırmalar listesi, sektör/şehir dağılımı, en sık sorunlar
4. **Web Sitesi Analizi** — tek URL analizi + analiz geçmişi + rapor görüntüleyici (bulgu, kanıt, önem, öneri, hizmet)
5. **Müşteri Havuzu** — filtrelenebilir tablo (sütun görünürlüğü, kayıtlı filtreler), müşteri kartı, birleştirme, içe/dışa aktarma
6. **İletişim Merkezi** — tüm kanalların gönderim kuyruğu, onay bekleyenler, ret listesi
7. **E-posta Kampanyaları** — hesaplar, kampanya kuyruğu, gelen yanıtlar
8. **WhatsApp İşlemleri** — gönderim paneli (şartnamedeki sütunlar), kuyruk kontrolleri
9. **AI Mesaj Stüdyosu** — taslak editörü + 10 yeniden yazma eylemi + ton seçimi
10. **Teklif ve Satış Yönetimi** — teklif oluşturucu, hizmet kataloğu, satış hunisi
11. **Takip Planlayıcısı** — görevler (sorumlu, tarih, öncelik, durum), hatırlatıcılar
12. **Raporlar ve Analitik** — toplu araştırma raporu, iletişim performansı, Excel/PDF
13. **Dosya Merkezi** — müşteri klasörleri, ekran görüntüleri, raporlar; arama/tarih filtresi
14. **Entegrasyonlar** — her servis için kart: durum, son kontrol, eksik ayar, test, bağlantıyı kes, hata
15. **Görevler ve Otomasyonlar** — kalıcı iş kuyruğu, otomasyon profilleri, günlükler
16. **Uygulama Ayarları** — marka (logo yükleme), iletişim bilgileri, puanlama ağırlıkları, aşamalar, tema, animasyon, yedekleme, güvenlik

Açılış: sinematik koyu sahne → logo ışıkla belirir → robot kamera hareketiyle girer, el sallar →
gerçek sistem kontrolleri (veritabanı, AI, entegrasyonlar, son oturum) → ana panel. "Atla" düğmesi
ve "açılış animasyonunu gösterme" ayarı vardır. İlk açılışta kurulum sihirbazı çalışır.

## 7. Bilinen teknik ve hukuki riskler

- **Google Custom Search JSON API** yeni müşterilere kapatıldı; işletme keşfi için **Google Places API (New)**
  önerilir (resmî, şartlara uygun; şirket adı, adres, web sitesi, telefon, işletme durumu döner).
- **WhatsApp Cloud API**: teslim/okunma bildirimleri ve gelen mesajlar **webhook** ile gelir; webhook
  herkese açık bir HTTPS adresi gerektirir. Masaüstü uygulaması bunu tek başına alamaz — bir aktarım
  sunucusu (ör. küçük bir bulut fonksiyonu) gerekir. İlk mesaj yalnızca **Meta onaylı şablonla** gönderilebilir.
- **E-posta açılma takibi** varsayılan kapalıdır (KVKK/ETK açısından açık rıza gerektirebilir).
- **Ticari elektronik ileti (6563 sayılı Kanun / İYS)**: tacirlere (B2B) gönderimde ön onay şartı farklı
  uygulanır, ancak ret hakkı her iletide sunulmalıdır. Uygulama bunu kontrol listesi olarak uygular,
  hukuki uygunluğu **garanti etmez**.
- **Ekran görüntüleri**: robots.txt'nin izin vermediği sayfalar ziyaret edilmez.
- **macOS paketi** Windows'ta derlenemez; bir Mac üzerinde `npm run dist:mac` gerekir. İmzalama için Apple Developer hesabı gerekir.
