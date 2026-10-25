# Web sitesi entegrasyonu — UcaMedya Bağlantı eklentisi

ucamedya.com.tr'deki teklif formu ve ücretsiz ön analiz aracından gelen talepler, UcaMedya AI'daki **Web Sitesi Talepleri** ekranına otomatik düşer.

## Kurulum (bir kez, ~5 dakika)

1. UcaMedya AI → **Web Sitesi Talepleri → Bağlantı ayarları → Eklentiyi indir**. Bu, `ucamedya-baglanti.zip` dosyasını kaydeder.
2. WordPress yönetim paneli → **Eklentiler → Yeni ekle → Eklenti yükle** → zip'i seçin → **Şimdi kur** → **Etkinleştir**.
3. WordPress → **Ayarlar → UcaMedya Bağlantı**:
   - **KVKK aydınlatma metni sayfası**: formlardaki onay kutusunda bağlantı olarak gösterilir. Metnin içeriğini hukuk danışmanınızla hazırlayın.
   - **Yeni talep bildirimi e-postası**: isteğe bağlı.
   - **Bağlantı anahtarı**: kopyalayın.
4. Sayfalara kısa kodları ekleyin:
   - Teklif formu: `[ucamedya_teklif_formu]`. Belirli bir hizmetle açmak için `[ucamedya_teklif_formu hizmet="seo"]` ya da sayfa adresine `?hizmet=seo` ekleyin. Hizmet kodları: `web_design`, `ecommerce`, `seo`, `graphic`, `identity`, `social`, `video`, `maintenance`.
   - Ücretsiz ön analiz: `[ucamedya_on_analiz]`.
5. UcaMedya AI → **Bağlantı ayarları**:
   - Site adresini girin (`https://ucamedya.com.tr/`) ve bağlantı anahtarını yapıştırın.
   - **Yeni talepleri otomatik kontrol et** kutusunu işaretleyin → **Kaydet** → **Bağlantıyı test et**.

## Nasıl çalışır?

- Ziyaretçi formu gönderir. Talep WordPress veritabanında (`wp_uca_requests`) saklanır.
- Uygulama açıkken, ayarlanan aralıkla (varsayılan 5 dakika) yeni talepleri HTTPS ile çeker ve aldıklarını siteye "alındı" olarak bildirir.
- Her talep müşteri havuzunda eşleştirilir:
  - **Kesin eşleşme** (aynı e-posta, telefon ya da web sitesi): talep mevcut müşteri kartına eklenir.
  - **Yalnızca ad benzerliği**: yeni kart açılır, olası eşleşme Müşteri Havuzu → *Yinelenenleri bul* ekranında onayınızı bekler.
  - **Eşleşme yok**: "İnceleme bekliyor" aşamasında yeni kart açılır.
- Her talep için şunlar yapılır:
  - "Web sitesi talebini incele" görevi oluşturulur.
  - Masaüstü bildirimi gösterilir.
  - İletişim geçmişine kayıt düşülür.
  - Ziyaretçinin onay kaydı (aydınlatma metni, pazarlama izni, tarih) izin kaydı olarak saklanır.
- Uygulamaya aktarılan talepler, sitede ayarlanan sürenin (varsayılan 30 gün) sonunda WordPress'ten silinir.

## Güvenlik

- **Anahtar zorunlu**: talepleri okuyan uçlar (`/wp-json/ucamedya/v1/requests`, `/ping`, `/requests/ack`) anahtar olmadan 401 döner. Anahtar uygulamada işletim sisteminin güvenli deposunda tutulur. Site adresi `https://` olmalıdır.
- **Spam koruması**: gizli tuzak alanı, en az 3 saniyelik doldurma süresi, saatlik gönderim sınırı. Ziyaretçi IP'si yalnızca tuzlanmış özet olarak tutulur.
- **Ön analiz motoru**:
  - Yalnızca herkese açık adreslere istek atar. Reddedilenler: `localhost`, özel ağlar (10.x, 192.168.x, 172.16–31.x), bağlantı-yerel adresler (169.254.x, bulut meta veri servisi dahil), IPv6 yerel adresler, standart dışı portlar, kullanıcı adı/şifre içeren adresler.
  - Yönlendirmelerin her adımı yeniden doğrulanır. İndirme boyutu ve süresi sınırlıdır.
  - Aynı ziyaretçi saatte en fazla 6 analiz yapabilir (ayarlanabilir).
- **Veri saklama**: ön analiz sonuçları, ziyaretçi iletişim bırakmadıkça saklanmaz.

## Test durumu

- ✅ Yerel WordPress'te (Playground, PHP 8.2, WordPress son sürüm) uçtan uca test edildi:
  - form gönderimi, zorunlu alan ve KVKK kontrolü, spam tuzağı;
  - 11 farklı yerel/özel adresin engellenmesi;
  - example.com ön analizi ve iletişim talebi;
  - anahtarsız ve yanlış anahtarlı erişimin reddi;
  - masaüstü uygulamasının talepleri çekip mevcut kartla eşleştirmesi ve onaylaması.
- 🟡 Canlı ucamedya.com.tr'de henüz kurulmadı. Temanızın stilleriyle görünüm ve sunucunuzun dış bağlantı izinleri canlıda kontrol edilmeli.
- Not: Sitenizdeki tema (v6) zaten kendi teklif hesaplayıcısını ve PageSpeed tabanlı analiz bölümünü içeriyordu. Eklenti bunlardan bağımsızdır; hangisini kullanacağınıza siz karar verirsiniz.
