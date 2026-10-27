# UcaMedya AI Growth Studio — Özellik Durum Raporu ve Test Raporu

Sürüm **0.2.1** · 2026-10-24 · Windows 11 üzerinde derlendi ve test edildi.

## 0.3.6 — Görsel mesajla birlikte (WhatsApp otomatik yapıştırma, e-posta ek doğrulama)

- WhatsApp masaüstü: sohbet açılınca görsel panoya kopyalanır ve uygulama WhatsApp penceresine Ctrl+V (Mac: Cmd+V) gönderir; WhatsApp görsel önizlemesini açar, metin görselin açıklamasına geçer, Enter kullanıcıda. Güvenlik: tuş yalnızca öndeki pencerenin WhatsApp masaüstü olduğu doğrulanırsa gönderilir (tarayıcılar hariç); değilse hiçbir tuşa basılmaz ve onay penceresi elle yapıştırmayı söyler. Windows odak kilidi için geçici iş parçacığı bağlama; betik EncodedCommand ile (tırnak bozulması yok). Ayar: "Görseli sohbete otomatik yapıştır". ✅ kullanıcının bilgisayarında gerçek WhatsApp'ta doğrulandı (önizleme + açıklama, gönderilmedi). 🟡 Mac'te denenmedi (Erişilebilirlik izni gerekir).
- Webmail: ek gerçekten ek listesinde görünene kadar beklenir; eklenemezse onay penceresinde uyarı. 🟡 canlı webmail'de denenmedi (oturum kapalıydı).

## 0.3.5 — Toplu kuyruğa ekleme ve silme

- E-posta Kampanyaları / WhatsApp İşlemleri: "Seçilenleri kuyruğa ekle" onaylı ve onay bekleyen taslakları tek adımda kuyruğa alır (onay bekleyenler önce onaylanır, sayısı onay penceresinde yazar).
- "Seçilenleri sil" (taslaklar; kuyruktaki/gönderilmiş silinmez) — Stüdyo toplu çubuğunda da "Sil".
- Gönderimler sekmesinde seçerek ya da satırdan "Kuyruktan çıkar" (taslak onaylıya döner).
- Hata düzeltmesi: kuyruk iptal edildikten sonra aynı alıcıya mesaj yeniden kuyruğa alınamıyordu ("zaten bir mesaj kaydı var"); iptal edilmiş, hiç gönderilmemiş kayıt artık engel olmaz. Gönderilmiş mesajlar için tekrar gönderim engeli aynen sürer.
- İletişim uygunluğu sütununda "henüz onaylanmadı" artık engel sayılmaz.

✅ birim testi (servis: ekle → çıkar → iptal → yeniden ekle → sil) + e2e (arayüzden sil).

## 0.3.4 — Stüdyoda toplu onay

AI Mesaj Stüdyosu listesinde her taslakta onay kutusu ve "Tümünü seç"; seçilenler için Onayla / Onayı kaldır / Reddet. Onaylamadan önce kaç taslak onaylanacağı ve kaçında gönderim engeli olduğu sorulur; ret listesindekiler ve kuyruktakiler atlanır, sayısı bildirilir. ✅ e2e (gerçek arayüzde tümünü seç → onayla).

## 0.3.3 — Taslak düzenleme düzeltmeleri

- Stüdyo'da Kaydet sonrası metnin eski hâline dönmesi düzeltildi (kayıt veritabanına yapılıyordu, ekran eski listeyle yeniden doluyordu). ✅ e2e (gerçek arayüzde yaz → Kaydet → metin korunuyor).
- Şablon, ret satırı ya da imza değişince elle düzenlenmemiş gönderilmemiş taslaklar kendiliğinden yenilenir; elle düzenlenenlere dokunulmaz (ret satırı kapatıldıysa yalnızca o satır çıkarılır, kuyruktaki mesajlardan da). Yeni sürüm ilk açılışta bir kez yeniler. ✅ e2e + kullanıcı veritabanında doğrulandı.
- "Engel var" etiketi artık yalnızca onay dışındaki gerçek engellerde görünür; üzerine gelince nedenler listelenir.
- Kullanıcı isteğiyle "Her mesaja ret bilgisi ekle" kapatıldı. Not: 6563 sayılı Kanun ticari elektronik iletilerde kolay ret imkânı sunulmasını ister; karar kullanıcıya aittir.

## 0.3.2 — Mesaja görsel ekleme

Ayarlar → Mesaj gönderimi → Mesaj şablonları → **Mesaj görseli** (PNG/JPG, en fazla 5 MB; kanal bazında aç/kapat).

| Kanal | Nasıl | Durum |
|---|---|---|
| E-posta (webmail / Gmail / SMTP) | Görsel ek olarak eklenir (PDF raporla birlikte de olabilir) | ✅ kod + birim · 🟡 webmail'de canlı denenmedi (otomasyon tarayıcısında webmail oturumu kapalıydı) |
| WhatsApp masaüstü uygulaması | Uygulama dışarıdan dosya eklemeye izin vermez: görsel panoya PNG olarak kopyalanır, kullanıcı sohbette Ctrl/Cmd+V ile yapıştırıp gönderir; onay penceresi görseli ve talimatı gösterir | ✅ panoya PNG yazımı e2e ile doğrulandı · 🟡 WhatsApp'ta yapıştırma kullanıcı ekranında denenmedi |
| WhatsApp Web | Görsel ekleme yok; onay penceresinde belirtilir | ⬜ |

Ayarlar'da "Panoya kopyala (dene)" ile yapıştırma önceden denenebilir.

## 0.3.1 — Temanın Gelen Mesajları uygulamaya aktarılır

Kullanıcı mevcut site formunu kullanmaya devam etmek istedi. Eklenti 1.1, UCA Medya temasının `uca_mesaj` kayıtlarını (iletişim formu + talebe çevrilen canlı destek) okur ve aktarıldı olarak işaretler; tema ve mesajlar değişmez. Masaüstünde "İletişim formu" talebi olarak görünür, e-posta için "yalnızca talebe yanıt" izin kaydı oluşur (tema formunda ayrı onay kutusu yok). ✅ Temanın v5.17 kopyasıyla yerel WordPress'te: temanın kendi formu (admin-ajax uca_contact) → eklenti → masaüstü uçtan uca; 61 birim testi. 🟡 Canlı sitede tema v6; mesaj saklama yapısı aynı olmalı, kurulumda "Bağlantıyı test et" bekleyen tema mesajı sayısını gösterir.

## 0.3.0 — Ek geliştirme paketi (2026-10-25)

Plan ve modül-dosya eşlemesi: `docs/GELISTIRME-0.3-PLANI.md`. Web sitesi kurulumu: `docs/WEB-SITESI-ENTEGRASYONU.md`.

| Modül | Durum |
|---|---|
| 1. Fırsat puanı — grup adları istenen 5 gruba uyarlandı (Öncelikli fırsat / Yüksek hizmet uyumu / Ek inceleme gerekli / Düşük öncelik / İletişim için uygun değil + ayrıca "daha önce iletişim kurulmuş", "iletişim istemiyor"); ağırlıklar Ayarlar'da | ✅ (puanlama 0.1'den beri çalışıyor) |
| 2. Tasarım konsepti — örnek ana sayfa, başlık önerileri, hizmet kartları, iletişim butonları, mobil yerleşim, renk/tipografi, önce/sonra; PDF şirket klasörüne | ✅ birim + e2e (gerçek analizden PDF üretildi, görsel kontrol edildi). Şirket logosu/görselleri konsepte konmaz; bilinmeyen bilgi [köşeli parantez] ile bırakılır |
| 3. CRM — emin olunmayan eşleşmeler için onay kuyruğu ("Farklı şirketler" / birleştir), son görülme, iletişim tercihi, sonraki görev, web sitesi talepleri ve aşama geçmişi kartta | ✅ birim + e2e |
| 4. Satış Panosu — sürükle-bırak, 17 aşama ("Yanıt geldi" eklendi), aşama geçmişi (tetikleyici: her değişiklik tarihle kaydedilir), "İletişim istemiyor"a bırakınca onay + ret listesi | ✅ e2e (sürükle-bırak gerçek arayüzde) |
| 5. Web sitesi entegrasyonu — WordPress eklentisi + anahtarlı güvenli çekme, eşleştirme, bildirim, görev | ✅ yerel WordPress'te uçtan uca · 🟡 canlı sitede kurulmadı |
| 6. Teklif formu — 8 hizmet, hizmete göre değişen kısa sorular, bütçe/teslim isteğe bağlı ("Belirtmek istemiyorum") | ✅ yerel WordPress |
| 7. Ücretsiz ön analiz — erişim, HTTPS, yanıt süresi, başlık/meta, mobil ayarı, H1, SEO etiketleri, görsel boyutu/alt, iletişim kolaylığı; SSRF koruması | ✅ yerel WordPress (11 engel testi + example.com) |
| 8. Analizden teklif taslağı — önerilen hizmetler katalogdan, analiz özeti, sonraki adımlar; fiyatı girilmemiş kalemle "gönderildi" yapılamaz, PDF'te TASLAK uyarısı | ✅ birim + e2e |
| 9. Görevler — ana panelde bugün / geciken, olası eşleşme ve yeni talep kısayolları | ✅ |
| 10. Satış analitiği — 13 metrik, "veri yok" ile 0 ayrımı, tahminî / gerçekleşen gelir ayrı, hizmet/kaynak/sektör dağılımı, dönem filtresi | ✅ birim + e2e |
| 11. Uca asistanı — günlük özet, 9 soru türü kayıtlardan yanıtlanır; gönderme/silme yapmaz; görev oluşturma onayla; yapay zekâ açıksa bilinmeyen sorular özet veriyle | ✅ birim + e2e · 🟡 yapay zekâ yanıtı gerçek anahtarla denenmedi |
| 12. Güvenlik — migration öncesi otomatik tam yedek (geri dönüş noktası), yeni modüller ayrı dosyalarda | ✅ kullanıcı veritabanında: v2→v3, yedek alındı, kayıt sayıları aynı |

Testler: 60 birim testi, 27 adımlı uçtan uca test (paketli uygulamada), canlı web sitesi talebi testi (`tests/live-website-leads.test.ts`), eklenti testi (`tests/.tmp/wp-plugin-test.mjs`).

Bilinen sınırlar:
- macOS paketi hâlâ bir Mac'te derlenmeli; Mac'te hiç çalıştırılmadı.
- Eklenti WordPress Playground'da test edildi; Playground DNS'i her alanı sahte özel IP'ye çözdüğü için dış site analizi testinde yalnızca test kopyasında bu IP'ye izin verildi (kaynak koddaki koruma değişmedi).
- Masaüstü uygulaması kapalıyken talepler sitede bekler; uygulama açılınca çekilir (bildirim e-postası ayarlanabilir).

## 0.2.4 — Firmanın yayımladığı Gmail adresleri engellenmiyor

- Ücretsiz e-posta (gmail, hotmail vb.) firmanın kendi sitesinde veya Google işletme kaydında yayımlanmışsa firmanın iş adresi (kurumsal) sayılır. CSV ya da elle eklenen ücretsiz adresler kişisel kalır. Veritabanı şeması 2: mevcut kayıtlar da düzeltildi. ✅ birim testi + kullanıcının veritabanında doğrulandı (emlaxogayrimenkul@gmail.com → kurumsal).
- "Yanıtları kontrol et": IMAP hesabı yoksa artık başarısız bir görev başlatmak yerine açıklayıcı mesaj verir. Webmail ile otomatik yanıt takibi yok; yanıtlar Roundcube gelen kutusunda görülür. ⬜ Roundcube üzerinden otomatik yanıt okuma yapılmadı.

## 0.2.3 — WhatsApp masaüstünde sohbet şirketin numarasıyla açılır

Kullanıcı isteğiyle: WhatsApp masaüstü kanalında sohbet, test modu açık olsa da şirketin gerçek numarasıyla açılır ve mesaj kutuya yazılır. Uygulama hiçbir şey göndermez; mesaj ancak kullanıcı WhatsApp'ta Enter'a basarsa gider. "WhatsApp'ta gönderdim" denirse kayıt gerçek gönderim olarak işlenir (şirket "yanıt bekleniyor" aşamasına geçer, tekrar gönderim engellenir). Webmail ve WhatsApp Web için test modu yönlendirmesi aynen sürüyor. ✅ kod + birim testleri; 🟡 kullanıcının ekranında henüz denenmedi.

## 0.2.2 — Kurumsal mesaj şablonları ve otomatik alıcı seçimi

| Özellik | Durum |
|---|---|
| Kurumsal "UCA Radar" metni varsayılan şablon (e-posta konusu, e-posta, WhatsApp) | ✅ birim testli |
| Ayarlar → Mesaj gönderimi → Mesaj şablonları: düzenleme, örnek önizleme, varsayılana dönme | ✅ (paketli uygulamada derlendi; ekranda kullanıcı denemesi bekliyor) |
| Gönderilmemiş taslakları yeni şablonla yenileme ("Kaydet ve gönderilmemiş taslakları yenile") | ✅ kod; 🟡 gerçek verilerle denenmedi |
| Mesajda kısa şirket adı ("RAMADİ YAPI İNŞAAT \| Gebze…" → "RAMADİ YAPI İNŞAAT") | ✅ birim testli |
| Alıcı seçimi — WhatsApp: sitedeki wa.me bağlantısı → iletişim sayfasındaki cep → sitedeki cep → Google kaydındaki cep → sabit hat | ✅ birim testli |
| Alıcı seçimi — e-posta: şirketin kendi alan adındaki adres (iletişim sayfası önce) → diğer kurumsal → ücretsiz/kişisel | ✅ birim testli |
| Aynı numara hem Google'da hem sitede bulunursa kaynak "web sitesi" olarak güncellenir | ✅ |
| Onay penceresinde şirketin gerçek numarası/adresi + kaynağı; test modunda "mesajın gideceği yer: test alıcınız" | ✅ kod; 🟡 canlı ekranda kullanıcı denemesi bekliyor |

Not: Şirketin sitesinde hiç iletişim bilgisi yoksa ve Google kaydında yalnızca sabit hat varsa, WhatsApp için sabit hat seçilir; sabit hatta WhatsApp olmayabilir. Gerçek gönderim hâlâ hiç yapılmadı, test modu açık.

## 0.2.1 — Webmail (Roundcube) ve WhatsApp masaüstü uygulaması (gerçek hesaplarla test edildi)

| Özellik | Durum | Not |
|---|---|---|
| Webmail (Roundcube) kanalı: oturum tespiti, yeni ileti (alıcı/konu/gövde), alıcı doğrulama, taslak kaydetme | ✅ | info@ucamedya.com.tr hesabıyla, Roundcube 1.7 (Elastic) üzerinde 3 taslak oluşturuldu; hiçbir ileti gönderilmedi |
| Webmail: gönder + gönderim doğrulaması, PDF eki | 🟡 | Kod hazır (Roundcube'un kendi "send" komutu, başarıda ileti ekranından çıkış). Gerçek gönderim yapılmadı |
| WhatsApp masaüstü uygulaması kanalı (whatsapp://send ile sohbet açma, metni kutuya yazma) | ✅ | Kullanıcının WhatsApp Business masaüstü uygulamasında kendi numarasıyla test edildi; metin kutuda göründü, gönderilmedi |
| WhatsApp masaüstü: gönderim | Kullanıcıda | Masaüstü uygulamasının içi okunamadığı için gönderimi (Enter) kullanıcı yapar ve uygulamada "WhatsApp'ta gönderdim" der; otomatik gönderim/doğrulama yok. Kuyruk modu bu kanalda her mesajda onay ister |
| Canlı önizleme doğrudan CDP ile; giriş/doğrulama sırasında önizleme durur | ✅ (kod) | Kullanıcının WhatsApp Web giriş bağlantısına tıklayamaması üzerine değiştirildi |
| Gmail (tarayıcı) kanalı | 🟡 | Kullanıcı Gmail kullanmadığı için gerçek hesapla denenmedi; Webmail kanalı varsayılan seçildi |

---


## 0.2.0 — API'siz çalışma (tarayıcı otomasyonu)

Temel kullanım artık hiçbir API anahtarı gerektirmez. Google, Gmail ve WhatsApp Web, bilgisayardaki Chrome/Edge'in **uygulamaya ayrılmış bir profilinde**, kullanıcının bir kez kendisinin giriş yaptığı oturumlarla, Chrome'un geliştirici protokolü (CDP) üzerinden yönetilir.

| Özellik | Durum | Not |
|---|---|---|
| Chrome/Edge tespiti, ayrı otomasyon profili, başlat/kapat | ✅ | Chrome 156 ile test edildi. Asıl Chrome profiline erişilmez (Chrome 136+ buna zaten izin vermez) |
| Google'da tarayıcı üzerinden arama (kutuya yazma → Enter → "Daha fazla işletme" → sayfalama) | ✅ | Gerçek testte "Kocaeli inşaat firmaları" ile 14, "mimarlık Kocaeli" ile 5 şirket; ad, ilçe/il, telefon, web sitesi, kategori, puan okundu |
| Google yönlendirme bağlantılarından gerçek site adresinin çözülmesi | ✅ | |
| Rehber/belge sitelerinin ve genel başlıkların elenmesi, emoji temizleme | ✅ (birim test) | |
| CAPTCHA / "olağan dışı trafik" / çerez onayı ekranında durup kullanıcıyı bekleme | 🟡 | Kod hazır; testlerde CAPTCHA çıkmadığı için gerçek CAPTCHA ile denenmedi. Çerez ekranında yalnızca "Tümünü reddet" seçilir |
| Site analizi kapalıyken hafif iletişim taraması (ana sayfa + iletişim/hakkımızda) | ✅ | |
| Canlı Kontrol Merkezi: canlı ekran önizlemesi, işlem akışı, başlat/duraklat/devam/iptal, son işlemi tekrar dene, günlükler, çıktı klasörü | ✅ | |
| Oturum kontrolü: Google, Gmail, WhatsApp Web | ✅ (oturum kapalı durumu) / 🟡 (oturum açık durumu) | "Oturum kapalı" (Gmail yönlendirmesi, WhatsApp QR ekranı) gerçek sayfalarda doğrulandı. Oturum açık hâli gerçek hesapla denenmedi |
| Gmail web: yeni ileti, alıcı/konu/gövde doldurma, alıcı doğrulama, PDF eki, taslak kaydetme, gönder + "İleti gönderildi" doğrulaması | 🟡 | Gerçek Gmail hesabıyla **denenmedi** (giriş sizin yapmanız gereken bir adım). İlk kullanımda Canlı Kontrol Merkezi'ndeki "Test Gmail taslağı" ile doğrulayın |
| WhatsApp Web: sohbet açma (resmî send?phone bağlantısı), metin + başlık-numara doğrulaması, gönder + tik doğrulaması, geçersiz numara tespiti | 🟡 | Gerçek WhatsApp hesabıyla **denenmedi**. WhatsApp arayüzü değişirse işlem "arayüz tanınmadı" hatasıyla durur |
| Üç gönderim modu: Taslak / Onaylı gönderim (her mesajda önizleme penceresi) / Onaylanmış kuyruk | ✅ (mantık) / 🟡 (gerçek gönderim) | Kuyruk modunda alıcı doğrulanamazsa, hata veya beklenmeyen ekran olursa kuyruk durur |
| Hazırlık/gönderim ayrımı: uygulama kapanırsa hazırlanmış ama gönderilmemiş mesaj güvenle kuyruğa döner; gönderim anında kapanırsa "durum belirsiz" işaretlenir ve tekrar gönderilmez | ✅ (kod + birim) | |
| Yerel yapay zekâ (Ollama) seçeneği; yapay zekâ varsayılan olarak kapalı (şablon taslaklar) | 🟡 | Ollama bu bilgisayarda kurulu olmadığı için denenmedi |
| Fare/klavye ile masaüstü uygulamalarını yönetme (Yöntem B) | ⬜ | Google/Gmail/WhatsApp için gerekmediğinden eklenmedi; tarayıcı CDP ile yönetiliyor, ek işletim sistemi izni gerekmiyor |
| CAPTCHA, iki adımlı doğrulama, spam kontrolü atlatma / robot algısını gizleme | ⛔ | Bilinçli olarak yapılmadı |

**WhatsApp riski:** WhatsApp, resmî olmayan otomasyonu kullanım koşullarına aykırı sayabilir ve hesabı kısıtlayabilir. Varsayılan mod "Onaylı gönderim", günlük sınır 20'dir.

**Google:** Tarayıcı üzerinden otomatik arama Google'ın kullanım koşullarıyla tam uyumlu değildir; uygulama sorgular arasında bekler, sorgu ve sayfa sayısını sınırlar (varsayılan 6 sorgu × 3 sayfa) ve doğrulama istendiğinde durur. Yoğun kullanımda Google geçici olarak CAPTCHA isteyebilir.

---


Durum etiketleri:

| Etiket | Anlamı |
|---|---|
| ✅ **Tamamlandı ve test edildi** | Kod yazıldı, otomatik testlerle ve/veya gerçek ortamda doğrulandı |
| 🟡 **Tamamlandı, gerçek hesapla test edilmedi** | Kod yazıldı ve hata durumları ele alındı; ancak gerçek bir hesap/anahtar ile uçtan uca denenmedi |
| 🔑 **API anahtarı veya kullanıcı izni bekliyor** | Çalışması için sizin eklemeniz gereken bir anahtar/hesap var |
| ⬜ **Henüz geliştirilmedi** | Bu sürümde yok |
| ⛔ **Teknik/hukuki nedenle desteklenmiyor** | Bilinçli olarak yapılmadı |

## 1. Özellik durumu

### Marka, açılış ve arayüz
| Özellik | Durum | Not |
|---|---|---|
| Resmî UcaMedya logosu (ucamedya.com.tr tema dosyalarından) | ✅ | Uygulama, rapor, teklif ve simgede kullanılıyor; yeni logo çizilmedi |
| Logo yükleme (marka ayarları) | ✅ | PNG/SVG/JPG |
| Marka renkleri / tipografi (Outfit + Inter Tight, Türkçe karakter) | ✅ | Siteyle aynı tokenlar (#E95A1B, antrasit) |
| Açık / koyu tema | ✅ | |
| 3D robot "Uca" (Three.js, PBR malzeme, logo göğüste) | ✅ | Kodla modellendi (GLB dosyası yerine prosedürel model) |
| Sinematik açılış (kamera hareketi, selamlama, ~3 sn, Atla) | ✅ | Ayarlardan kapatılabilir |
| Gerçek sistem kontrolleri açılışta (başarısız olan sahte başarılı gösterilmez) | ✅ | Test: AI anahtarı yokken uyarı gösteriliyor |
| Düşük performans için 2D robot (hafif mod / WebGL yok) | ✅ | |
| Robot olay bildirimleri (analiz bitti, hata, rapor) — kapatılabilir | ✅ | |
| Kurulum sihirbazı (marka, klasör, AI, arama, e-posta, WhatsApp, güvenlik) | ✅ | |
| 16 menülü panel, daraltılabilir menü, genel arama (Ctrl+K), bildirimler | ✅ | |
| Tablolarda sütun gizleme/genişlik ayarı, sıralama, kayıtlı filtreler | ✅ | |
| Klavye kısayolları (Ctrl+K/B/N, Alt+1…9, Esc) | ✅ | |

### Araştırma (AI Müşteri Bulucu)
| Özellik | Durum | Not |
|---|---|---|
| Sektör (16 + özel), il/ilçe (81 il, 973 ilçe), çoklu konum, müşteri türü, hedef sayı | ✅ | |
| Google Places API (New) ile şirket keşfi | 🔑 🟡 | Kod resmî dokümana göre yazıldı; anahtarınızla denenmedi |
| SerpAPI (Google Haritalar) | 🔑 🟡 | |
| Brave Search API | 🔑 🟡 | |
| Manuel CSV içe aktarma | ✅ | Türkçe başlıklar, `;`/`,` ayırıcı |
| Tekrar kaydı engeli (alan adı, telefon, e-posta, ad+şehir, sağlayıcı kimliği) | ✅ | |
| Şirket bazında canlı aşama gösterimi | ✅ | |
| Sitesiz şirketi "web sitesi yok" olarak kaydetme; erişilemeyen siteyi "kötü" saymama | ✅ | |
| Kota dolduğunda bildirme, eldeki sonuçlarla tamamlama | ✅ (birim test) | |
| Duraklat / devam / iptal, uygulama kapanınca kaldığı yerden devam | ✅ | |
| Otomasyon profilleri (6 hazır + kaydet) | ✅ | |

### Web sitesi analizi
| Özellik | Durum | Not |
|---|---|---|
| Masaüstü (1440 px) + mobil (390 px) tarama, sistemdeki Edge/Chrome | ✅ | ucamedya.com.tr üzerinde ~35 sn |
| Görsel tasarım, mobil, UX, performans, SEO, kurumsal güven kontrolleri (≈45 ölçüt) | ✅ | Her bulgu "ölçüldü" / "sezgisel" olarak etiketli |
| Ekran görüntüleri (ana sayfa, hizmetler, hakkımızda, iletişim, sorunlu bölüm) + meta veri | ✅ | Tam sayfa görüntüler JPEG ile küçültülüyor |
| robots.txt'ye uyum, yerel ağ adreslerine erişim engeli (SSRF) | ✅ | |
| Bozuk bağlantı, HTTPS, site haritası, robots.txt, yapılandırılmış veri | ✅ | |
| PageSpeed Insights (Lighthouse, Core Web Vitals) | 🔑 🟡 | Anahtarsız kota çok düşük; yoksa "yapılamadı" yazılır, tahmin üretilmez |
| Puan + gerekçe + güven düzeyi + ölçüm kapsamı | ✅ | Ağırlıklar ayarlardan düzenlenir |
| Yapay zekâ özeti (yalnızca bulgulardan) | 🔑 🟡 | Anthropic/OpenAI anahtarı gerekir |
| Yeniden analizde yeni sürüm (eski silinmez) | ✅ | |
| PDF analiz raporu (14 bölüm, kapak, ekran görüntüleri) | ✅ | |

### CRM, iletişim, satış
| Özellik | Durum | Not |
|---|---|---|
| Müşteri kartı (tüm alanlar), 16 düzenlenebilir aşama, etiket, not, görev, dosya, geçmiş | ✅ | |
| Fırsat puanı (0–100) + gerekçeler + 7 öncelik grubu | ✅ | |
| Birleştirme, yinelenen bulma, arşiv, güvenli kalıcı silme politikası | ✅ | Teklifli/kazanılmış/korumalı kayıt silinemez; klasör "_Silinenler"e taşınır |
| CSV + Excel dışa aktarma | ✅ | |
| AI Mesaj Stüdyosu: 6 ton, 10 düzenleme eylemi, kanıt paneli | 🔑 🟡 | AI anahtarı yoksa şablon taslak (✅ test edildi) |
| İzin/ret kayıtları, kişisel–kurumsal veri ayrımı, ret listesi (silinmez) | ✅ | |
| Gönderim kuyruğu: onay zorunlu, tekrar gönderim engeli, duraklat/devam/iptal, test modu | ✅ (hesapsız kısımlar) | |
| E-posta gönderimi (SMTP: Gmail, Workspace, Outlook, M365, kurumsal) | 🔑 🟡 | Gerçek hesapla gönderim denenmedi |
| E-posta yanıt takibi (IMAP) + "İSTEMİYORUM" yanıtlarını ret listesine alma | 🔑 🟡 | |
| E-posta OAuth (Gmail/Microsoft) | ⬜ | Uygulama şifresiyle SMTP/IMAP kullanılır |
| E-posta açılma/tıklama takibi | ⛔ | Gizlilik/mevzuat ve güvenilirlik nedeniyle yapılmadı |
| WhatsApp manuel tıkla-gönder (wa.me) | ✅ (kod) / 🟡 | Mesaj WhatsApp'ta açılır, göndermeyi kullanıcı yapar |
| WhatsApp Business Platform (Cloud API, şablon mesaj, sağlık/şablon kontrolü) | 🔑 🟡 | Meta hesabı, onaylı şablon gerekir |
| WhatsApp teslim/okunma bilgisi ve gelen mesajlar | ⬜ | Webhook için herkese açık sunucu gerekir |
| WhatsApp Web otomasyonu / spam önleme atlatma | ⛔ | Hesap kısıtlama riski ve kurallar nedeniyle yapılmadı |
| Teklif: hizmet kataloğu (12, fiyatsız), KDV, indirim, geçerlilik, ödeme koşulu, geçmiş, PDF | ✅ | |
| Görevler, hatırlatıcı (masaüstü bildirimi), otomatik "yanıtı değerlendir" görevi | ✅ | |
| Raporlar: huni, sorunlar, kanal performansı, sektör/şehir; toplu araştırma PDF | ✅ | |

### Sistem
| Özellik | Durum | Not |
|---|---|---|
| SQLite + sürümlü migration (30 tablo) | ✅ | |
| Müşteri klasör sistemi (yıl/sektör/il/firma-id) + Dosya Merkezi senkronu | ✅ | |
| Kalıcı görev motoru (eşzamanlılık sınırı, yarıda kalan görev tespiti) | ✅ | |
| Yedek: otomatik/manuel, bütünlük kontrolü, geri yükleme öncesi yedek, dışa aktarma | ✅ | Geri yükleme butonu arayüzde var; e2e'de çalıştırılmadı (uygulamayı yeniden başlatır) |
| API anahtarları/parolalar: Windows DPAPI / macOS Anahtar Zinciri (safeStorage) | ✅ | Günlüklerde maskeleme |
| Uygulama kilidi (scrypt, deneme sınırı) | ✅ (kod) | |
| Güvenli IPC (tek kanal, izinli komut listesi, zod doğrulama), contextIsolation, sandbox, CSP | ✅ | e2e'de doğrulandı |
| Entegrasyon merkezi (12 kart: durum, son kontrol, izinler, eksikler, test, kes, hata) | ✅ | |
| Windows kurulum paketi (NSIS) | ✅ | `release/UcaMedyaAI-Setup-0.1.0.exe`, imzasız |
| macOS DMG (Intel + Apple Silicon) yapılandırması, imza/notarization hazırlığı | 🟡 | Windows'ta derlenemez; bir Mac'te `npm run dist:mac` |
| Harici CRM / bulut depolama entegrasyonu | ⬜ | Excel/CSV ile veri taşınabilir; veri klasörü bulut senkron klasöründe seçilebilir |
| Otomatik güncelleme | ⬜ | |
| Çok kullanıcılı sunucu sürümü | ⬜ | Veri katmanı modüler; SQLite'tan sunucuya taşınabilir |

## 2. Test raporu (2026-10-24)

| Test | Sonuç |
|---|---|
| `npm run typecheck` (ana süreç + arayüz, strict TypeScript) | ✅ hatasız |
| `npm test` — 43 birim testi (0.2: Google sonuç ayrıştırma, WhatsApp alıcı doğrulama, iletişim çıkarma, ad temizleme eklendi); (kurallar, puanlama, uygunluk, tekrar/birleştirme/ret, teklif hesabı, sırlar, ayarlar, yedek, görev motoru, CSV, robots, SSRF) | ✅ 38/38 |
| `LIVE=1` canlı analiz testi (ucamedya.com.tr) | ✅ |
| `npm run test:e2e` — derlenmiş uygulama, 21 adım | ✅ 21/21 |
| `E2E_BROWSER=1 npm run test:e2e` — 22. adım: gerçek Chrome ile Google araştırması (5 şirket, iletişim taraması, taslaklar) | ✅ 22/22 |
| `LIVE=1 npx vitest run tests/live-browser.test.ts` — Google araması + WhatsApp/Gmail oturum kapalı tespiti | ✅ |
| `npm run test:e2e -- --exe …` — **paketlenmiş** uygulama, 21 adım | ✅ 21/21 |

Uçtan uca test adımları: açılış ve gerçek sistem kontrolleri · renderer'da Node erişimi olmadığı · bilinmeyen IPC komutunun ve veri klasörü dışı yolun reddi · kurulum sihirbazı · 16 ekranın boş veriyle açılması · anahtarsız araştırmanın sahte başarı göstermemesi · şirket ekleme + yinelenen engeli · gerçek site analizi + 7 ekran görüntüsü + PDF · yeniden analizde sürüm 2 · müşteri kartı · şablon taslak + hesapsız kuyruğa almanın engellenmesi · ret listesindeki şirkete taslak engeli + silinen şirketin ret kaydının korunması · teklif (50.000 TL, %10 indirim, %20 KDV = 54.000 TL) + PDF · görev · yedek + doğrulama · koyu tema · yakalanmamış arayüz hatası olmaması.

Testlerin bulduğu ve düzeltilen hatalar: Türkçe "İ" harfli butonların (İletişim) tespit edilmemesi (yanlış "teklif butonu yok" bulgusu) · "Proje Başlat" ifadesinin eylem düğmesi sayılmaması · gizli açılır menülerin menü öğesi sayılması · CSV'de "İl" başlığının tanınmaması · koyu temada logo · gece saatinde "Günaydın" · teklif hazırlanan şirketin "toplantıya dönüşen" sayılması.

## 3. Bilinen sınırlamalar

1. **Arama sağlayıcıları**: Google Custom Search JSON API yeni müşterilere kapalı olduğu için kullanılmadı; Google Places API (New) önerilir (ücretli, sorgu başına en fazla 60 sonuç). Hedef sayı garanti değildir.
2. **İletişim bilgileri** yalnızca şirketin kendi sitesinden ve arama sağlayıcısından alınır; rehber/sosyal ağ kazıması yapılmaz. Bu nedenle bazı şirketlerde e-posta bulunamayabilir.
3. **Analiz ölçümleri** test anındaki ağ ve sunucu koşullarını yansıtır; yerel zamanlama ölçümleri tek denemedir. Core Web Vitals yalnızca PageSpeed anahtarıyla ölçülür.
4. **"Sezgisel"** etiketli bulgular (eski tasarım işaretleri, menü yapısı vb.) kesin tespit değildir; raporlarda ve mesajlarda ihtiyatlı dille sunulur.
5. **WhatsApp**: Resmî API'de ilk mesaj yalnızca onaylı şablonla gider; teslim/okunma/gelen mesaj için webhook aktarım sunucusu gerekir (bu sürümde yok).
6. **E-posta**: OAuth yok; Gmail/Workspace için uygulama şifresi, Microsoft 365 için SMTP AUTH izni gerekir. Teslim bilgisi "sunucu kabul etti" düzeyindedir.
7. **Hukuki uygunluk**: Uygulama ret listesi, onay, kişisel veri ayrımı ve tekrar gönderim engeli uygular; 6563 sayılı Kanun / İYS / KVKK uygunluğunu **garanti etmez**.
8. **Kod imzalama**: Windows kurulumu imzasızdır (SmartScreen uyarısı çıkabilir). macOS için Apple Developer hesabı gerekir.
9. **Robot** GLB dosyası olarak değil, kodla modellenmiştir; GLTFExporter ile dışa aktarılabilir ancak bu sürümde dışa aktarma düğmesi yoktur.
10. **Tek kullanıcı**: "Müşteri sorumlusu" alanı serbest metindir; kullanıcı hesapları/yetkilendirme yoktur (uygulama kilidi vardır).
