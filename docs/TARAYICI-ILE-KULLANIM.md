# API'siz Kullanım: Tarayıcı ile Çalışma (v0.2)

UcaMedya AI, Google araması, Gmail ve WhatsApp Web işlemlerini bilgisayarınızdaki **Google Chrome** (veya Microsoft Edge) üzerinden yapar. API anahtarı, geliştirici hesabı veya OAuth ayarı gerekmez.

## Nasıl çalışır?

- Uygulama Chrome'u **kendine ayrılmış bir profil** ile, görünür bir pencerede açar. Profil klasörü: `%APPDATA%\UcaMedya AI Growth Studio\otomasyon-profili-chrome`.
- Asıl Chrome profilinize, kayıtlı şifrelerinize ve kartlarınıza **erişmez**. Chrome da güvenlik nedeniyle ana profilin dışarıdan yönetilmesine izin vermez.
- Google, Gmail ve WhatsApp Web'e bu profilde **bir kez kendiniz giriş yaparsınız**. Oturum, profil klasöründe kalır. Uygulama şifrenizi sormaz ve saklamaz.
- Tarayıcı, Chrome'un kendi kontrol bağlantısı (yalnızca bu bilgisayardan erişilebilen yerel bir port) ile yönetilir. Fare ve klavye ele geçirilmez; Windows'ta ya da macOS'ta ek izin gerekmez.
- CAPTCHA, iki adımlı doğrulama veya güvenlik ekranı çıkarsa işlem durur. Tarayıcı öne gelir ve ekranın altında "sizi bekliyor" uyarısı çıkar. Doğrulamayı siz tamamlar, **Tamamladım** dersiniz.

## İlk kurulum (bir kez)

1. **Canlı Kontrol Merkezi → Tarayıcıyı başlat**.
2. **Google hesabı → Giriş yap**: açılan pencerede Google hesabınıza girin.
3. **WhatsApp Web → Giriş yap**: telefonunuzda WhatsApp → Ayarlar → Bağlı cihazlar → Cihaz bağla ile QR kodu taratın.
4. **Oturumlar → Kontrol et**: üçü de "Açık" görünmeli.
5. **Kurulum testleri**:
   - *Ara*: Google'da test araması yapar, bulunan şirketleri listeler.
   - *Taslak oluştur*: kendi Gmail adresinize **gönderilmeyen** bir taslak oluşturur.
   - *Sohbeti aç*: kendi numaranızla sohbet açar, test metnini yazıp siler.

## Günlük kullanım

1. **AI Müşteri Bulucu** → sektör, il/ilçe ve hedef sayıyı seçin. "Arama sağlayıcısı" **Google (tarayıcı ile)** olsun.
2. Uygulama, her şehir ve sektör için Google'a yazar ve "Daha fazla işletme" listesini açar. Firma adı, ilçe/il, telefon, web sitesi ve kategori okunur, aynı firma ikinci kez eklenmez. Sonra siteler analiz edilir, iletişim bilgileri taranır ve taslaklar hazırlanır. İlerlemeyi **Canlı Kontrol Merkezi**'nde canlı görüntüyle izleyebilirsiniz.
3. **Müşteri Havuzu** ve **AI Mesaj Stüdyosu**'nda taslakları inceleyip **Onayla**.
4. **E-posta Kampanyaları** veya **WhatsApp İşlemleri** → taslakları seçin → **Onaylananları kuyruğa ekle** → **Kuyruğu başlat**.

## Webmail (Roundcube) ve WhatsApp masaüstü uygulaması (0.2.1)

- **Webmail**: Ayarlar → Mesaj gönderimi → E-posta kanalı "Webmail — Roundcube", adres `https://ucamedya.com.tr/webmail/`. Otomasyon tarayıcısında webmail'e bir kez giriş yapın. Taslak ve gönderim Roundcube'un kendi komutlarıyla yapılır.
- **WhatsApp masaüstü uygulaması** (önerilen): WhatsApp kanalı "WhatsApp masaüstü uygulaması". Uygulama sohbeti bilgisayarınızdaki WhatsApp/WhatsApp Business'ta açar ve mesajı kutuya yazar; **Enter'a siz basarsınız**, sonra UcaMedya AI'da "WhatsApp'ta gönderdim" dersiniz. Giriş gerekmez, hesap kısıtlama riski en düşüktür.

## Gönderim modları (Ayarlar → Mesaj gönderimi)

| Mod | Ne olur |
|---|---|
| **Taslak** | E-posta Gmail taslaklarına kaydedilir, WhatsApp metni sohbete yazılır. **Hiçbir şey gönderilmez**; gönder tuşuna siz basarsınız. |
| **Onaylı gönderim** (varsayılan) | Her mesaj tarayıcıda hazırlanır, uygulamada önizleme penceresi açılır (alıcı, metin, tarayıcı görüntüsü). **Gönder** / **Bunu atla** / **Kuyruğu durdur**. |
| **Onaylanmış kuyruk** | Önceden onayladığınız mesajlar sırayla gönderilir. Alıcı doğrulanamazsa, beklenmeyen bir ekran ya da hata olursa kuyruk durur ve size sorar. |

Her gönderimden önce:
- WhatsApp sohbet başlığındaki numara alıcıyla, yazma alanındaki metin taslakla karşılaştırılır.
- Gmail'de alıcı alanı kontrol edilir.
- Ret listesi, izin durumu, günlük sınır ve tekrar gönderim engeli yeniden kontrol edilir.

Gönderim ancak WhatsApp'ta mesaj balonunda tik, Gmail'de "İleti gönderildi" bildirimi görülürse "Gönderildi" sayılır. Görülmezse kayıt "Doğrulanamadı" olur ve **tekrar gönderilmez**.

**Test modu** açıkken tüm mesajlar Ayarlar'daki test alıcısına gider.

## Önemli uyarılar

- **WhatsApp**: Resmî olmayan otomasyon WhatsApp kullanım koşullarına aykırı sayılabilir ve hesabınız kısıtlanabilir. Uygulama spam kontrollerini atlatmaya ya da robot olduğunu gizlemeye çalışmaz. Günlük sınırı düşük tutun (varsayılan 20) ve "Onaylı gönderim" modunu kullanın.
- **Google**: Otomatik aramada Google zaman zaman doğrulama isteyebilir. Uygulama sorgu ve sayfa sayısını sınırlar (Ayarlar → Analiz), sayfalar arasında bekler ve doğrulama istendiğinde durur.
- **Arayüz değişiklikleri**: Gmail ya da WhatsApp sayfa yapısını değiştirirse ilgili adım "arayüz tanınmadı" hatasıyla durur; yanlış kişiye gönderim yapılmaz.
- **Hukuk**: Kurumsal iletişim bilgisinin yayımlanmış olması pazarlama iletişimine izin anlamına gelmez. Uygulama hukuki uygunluğu garanti etmez.

## Yapay zekâ (isteğe bağlı)

Varsayılan olarak kapalıdır. Mesaj taslakları analiz bulgularına dayalı hazır şablonlarla yazılır. Daha doğal metin için:
- **Yerel model (ücretsiz, veriler bilgisayardan çıkmaz)**: https://ollama.com adresinden Ollama'yı kurun, terminalde `ollama pull qwen3:8b` çalıştırın, ardından Entegrasyonlar → Yapay zekâ → "Yerel model — Ollama" seçin.
- **API** (Claude / OpenAI): ayrıntılar `API-YAPILANDIRMA.md` dosyasında.
