# API Bağlantılarını Yapılandırma Rehberi

Tüm anahtarlar **Entegrasyonlar** sayfasından (veya kurulum sihirbazından) girilir, Windows DPAPI / macOS Anahtar Zinciri ile şifrelenir, arayüze geri gösterilmez ve günlüklere yazılmaz. Her kartta **Test et** düğmesi gerçek bir istek yapar; başarısız test asla başarılı gösterilmez.

## 1. Google Places API (New) — şirket keşfi (önerilen)

1. https://console.cloud.google.com → yeni proje oluşturun.
2. **Faturalandırma** hesabı bağlayın (Places API ücretlidir; aylık ücretsiz kullanım kredisi sağlayıcının güncel koşullarına bağlıdır).
3. **APIs & Services → Library → "Places API (New)"** → Etkinleştir.
4. **Credentials → Create credentials → API key**. Anahtarı "Application restrictions: None" ve "API restrictions: Places API (New)" ile sınırlayın.
5. Uygulamada Entegrasyonlar → Google Places API → Yapılandır → anahtarı yapıştırın → Test et.

Not: Her sorgu en fazla 60 işletme döndürür. Araştırma başına sorgu sayısı Ayarlar > Analiz'den sınırlanır (varsayılan 12). Telefon ve web sitesi alanları daha üst bir fiyat katmanındadır.

## 2. SerpAPI (alternatif)

https://serpapi.com → kayıt → Dashboard'daki **API Key**. Test, kalan arama hakkınızı gösterir.

## 3. Brave Search API (alternatif)

https://api.search.brave.com → abonelik → **Subscription token**. Genel web araması olduğu için işletme bilgisi (telefon/adres) gelmez; şirketler "ek araştırma gerekiyor" grubunda toplanabilir.

## 4. Google PageSpeed Insights — Core Web Vitals

Google Cloud'da **PageSpeed Insights API**'yi etkinleştirip bir API anahtarı oluşturun (ücretsiz kota). Anahtarsız kullanım kotası çok düşüktür. Anahtar yoksa analiz raporunda "Core Web Vitals ölçülmedi" yazar; tahmin üretilmez.

## 5. Yapay zekâ

- **Anthropic Claude (varsayılan)**: https://console.anthropic.com → API Keys. Varsayılan model Claude Opus 5.5; Entegrasyonlar > Yapay zekâ > Yapılandır'dan Sonnet 5.5 veya Haiku 5.5 (daha düşük maliyet) seçilebilir. Güvenlik sınıflandırıcısı bir isteği reddederse sunucu taraflı yedek model devreye girer.
- **OpenAI**: https://platform.openai.com → API keys; model adını ayarlardan girin.

Yapay zekâya yalnızca şirket adı, sektör, şehir, web adresi ve analiz bulguları gönderilir; kişisel iletişim bilgileri gönderilmez.

## 6. E-posta (SMTP / IMAP)

| Sağlayıcı | SMTP | IMAP | Gerekenler |
|---|---|---|---|
| Gmail | smtp.gmail.com:465 (SSL) | imap.gmail.com:993 | Google hesabında 2 adımlı doğrulama + **Uygulama şifresi** |
| Google Workspace | smtp.gmail.com:465 | imap.gmail.com:993 | Yöneticinin IMAP ve uygulama şifrelerine izin vermesi |
| Outlook.com | smtp-mail.outlook.com:587 (STARTTLS) | outlook.office365.com:993 | Uygulama şifresi gerekebilir |
| Microsoft 365 | smtp.office365.com:587 (STARTTLS) | outlook.office365.com:993 | Yöneticinin hesap için **SMTP AUTH**'u açması |
| Kurumsal / hosting | Firmanızın verdiği | Firmanızın verdiği | — |

E-posta Kampanyaları → Hesap ekle → bilgileri girin → **Kaydet ve test et** (SMTP ve IMAP ayrı ayrı doğrulanır). Günlük gönderim sınırını sağlayıcının sınırının altında tutun. IMAP tanımlıysa yanıtlar 30 dakikada bir (veya "Yanıtları kontrol et" ile) okunur; gelen kutusu salt okunur açılır, ileti silinmez/taşınmaz.

İlk gerçek gönderimden önce: Ayarlar > İletişim'de **test modu** açıkken test alıcınızı girip birkaç mesaj gönderin; sonra test modunu kapatın.

## 7. WhatsApp

### a) Manuel tıkla-gönder (önerilen başlangıç)
WhatsApp İşlemleri → Yapılandır → "Manuel". API gerekmez. "Sıradakini WhatsApp'ta aç" mesajı WhatsApp uygulamanızda hazır açar; gönder tuşuna siz basar, ardından uygulamada "Gönderdim" dersiniz.

### b) WhatsApp Business Platform (Cloud API)
1. https://business.facebook.com → Meta Business hesabı; https://developers.facebook.com → uygulama oluşturun → **WhatsApp** ürünü ekleyin.
2. İşletme telefon numaranızı ekleyip doğrulayın; **Phone number ID** ve **WhatsApp Business Account ID (WABA ID)** değerlerini alın.
3. **System User** oluşturup `whatsapp_business_messaging` ve `whatsapp_business_management` izinleriyle **kalıcı erişim anahtarı** üretin.
4. WhatsApp Manager → **Message templates** → "Marketing" veya "Utility" kategorisinde bir tanışma şablonu oluşturup onaya gönderin. Gövdede `{{1}}` değişkeni varsa uygulamada "Şablon gövde değişkenleri"ne `{sirket}` yazın.
5. Uygulamada Cloud API modunu seçin, kimlikleri, şablon adını/dilini ve anahtarı girin → Test et (numara kalitesi, mesajlaşma limiti ve şablon onay durumu gösterilir).

Sınırlamalar: İlk temas yalnızca onaylı şablonla yapılabilir. Teslim/okunma bildirimleri ve gelen mesajlar Meta webhook'u ile gelir; bunun için herkese açık bir HTTPS sunucusu gerekir ve bu sürümde yoktur.

## 8. Sorun giderme

| Mesaj | Çözüm |
|---|---|
| "Yetkilendirme hatası (HTTP 403)" | API'nin projede etkin olduğunu ve anahtar kısıtlamalarını kontrol edin |
| "API kotası doldu (HTTP 429)" | Sağlayıcı panelinden kotayı artırın veya bekleyin; araştırma eldeki sonuçlarla tamamlanır |
| "Tarayıcı başlatılamadı" | Microsoft Edge veya Google Chrome'u kurun/güncelleyin |
| "SMTP doğrulaması başarısız" | Uygulama şifresi / SMTP AUTH; port ve SSL/STARTTLS seçimi |
| "robots.txt izin vermiyor" | Site otomatik ziyareti istemiyor; analiz yapılmaz (bu sitenin kötü olduğu anlamına gelmez) |

Günlük dosyası: `%APPDATA%\UcaMedya AI Growth Studio\logs\ucamedya-ai.log` (anahtarlar maskelenir).
