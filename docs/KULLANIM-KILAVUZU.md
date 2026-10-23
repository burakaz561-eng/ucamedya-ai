# Kullanım Kılavuzu

## Günlük iş akışı (özet)

1. **Araştır** — AI Müşteri Bulucu → sektör, şehir/ilçe, müşteri türü ve hedef sayıyı seçin → *Araştırmayı başlat*. (Arama anahtarı yoksa *CSV içe aktar* ile kendi listenizi yükleyin.)
2. **İzle** — Sağ panelde her şirketin aşaması canlı görünür: bulundu → site tespit → analiz → ekran görüntüleri → profil → tamamlandı. Duraklat / devam / iptal her an mümkündür.
3. **İncele** — Müşteri Havuzu'nda şirketler fırsat puanına göre sıralanır. Bir satıra tıklayınca müşteri kartı açılır: puan gerekçeleri, analiz bulguları ve ekran görüntüleri, iletişim bilgilerinin **kaynağı**, izin kayıtları.
4. **Mesajı hazırla** — AI Mesaj Stüdyosu'nda taslağı düzenleyin; *Kısalt, Daha samimi yap, Analiz bulgularını ekle…* gibi 10 eylem vardır. Sağdaki "Doğrulanmış bulgular" paneli mesajın hangi ölçüme dayandığını gösterir.
5. **Onayla** — *Onayla*. Onaysız taslak hiçbir kanaldan gönderilemez.
6. **Gönder** — E-posta Kampanyaları veya WhatsApp İşlemleri → taslakları seçin → *Onaylananları kuyruğa ekle* → *Kuyruğu başlat*. Her mesajdan önce ret listesi ve izinler yeniden kontrol edilir.
7. **Yanıtları yönet** — E-posta yanıtları şirket kartına otomatik eklenir ve "Müşterinin yanıtını değerlendir" görevi açılır. "İSTEMİYORUM" yanıtı şirketi ret listesine alır. Telefon/WhatsApp yanıtlarını kartta *Yanıt / görüşme kaydet* ile ekleyin.
8. **Teklif ver** — Müşteri kartı → *Teklif hazırla* → katalogdan hizmet ekleyin, fiyat/KDV/indirim girin → *Kaydet ve PDF*.
9. **Takip et ve raporla** — Takip Planlayıcısı (görevler, hatırlatıcılar), Raporlar ve Analitik (huni, sorunlar, kanal performansı), toplu araştırma PDF'i.

## Ekranlar

| Menü | Ne işe yarar |
|---|---|
| Genel Bakış | Gerçek kayıtlardan sayılar, günlük/haftalık/aylık etkinlik, öncelik grupları, son görevler ve raporlar |
| AI Müşteri Bulucu | Yeni araştırma, kayıtlı profiller, CSV içe aktarma, canlı ilerleme |
| Sektör Araştırması | Tüm araştırmalar, şirket bazlı aşamalar, hataları yeniden deneme, toplu rapor |
| Web Sitesi Analizi | Tek bir adresi hızlı analiz (şirket kaydı oluşturmaz), analiz geçmişi, bulgular, puan gerekçeleri, ekran görüntüleri, ölçüm kapsamı, PDF |
| Müşteri Havuzu | Filtreler (grup, aşama, sektör, şehir, site durumu, puan, etiket), kayıtlı filtreler, toplu analiz/taslak/aşama/arşiv, yinelenen bulma ve birleştirme, Excel/CSV |
| İletişim Merkezi | Tüm kanalların özeti, son gönderimler, ret listesi |
| E-posta Kampanyaları | Hesaplar, e-posta kuyruğu, gönderim sonuçları |
| WhatsApp İşlemleri | Yöntem (manuel / resmî API), WhatsApp kuyruğu |
| AI Mesaj Stüdyosu | Taslak düzenleyici, ton, 10 yeniden yazma eylemi, uygunluk kontrolü |
| Teklif ve Satış | Teklifler, satış hunisi, düzenlenebilir hizmet kataloğu |
| Takip Planlayıcısı | Görevler (sorumlu, tarih, öncelik, durum), hatırlatıcılar |
| Raporlar ve Analitik | Satış hunisi, en sık sorunlar, kanal performansı, sektör/şehir dağılımı |
| Dosya Merkezi | Tüm dosyalar; arama, tür ve tarih filtresi; klasörde göster; diskle senkronize et |
| Entegrasyonlar | Her servisin durumu, testi, bağlantı kesme |
| Görevler ve Otomasyonlar | Arka plan görevleri (duraklat/devam/iptal/yeniden dene/günlük), otomasyon profilleri |
| Uygulama Ayarları | Marka, tema ve robot, analiz, puanlama ağırlıkları, müşteri aşamaları, iletişim kuralları, yedekleme, güvenlik |

## Puanlar nasıl okunur?

- **Site analiz puanı (kategori başına 0–100)**: ölçülen ölçütlerin ağırlıklı karşılanma oranı. Ölçülemeyen ölçüt (○) hesaba girmez; *güven düzeyi* kaç ölçütün ölçülebildiğini gösterir. Gerekçeler "Puan gerekçeleri" sekmesindedir.
- **Fırsat puanı (0–100)**: sitenin geliştirme ihtiyacı, hizmet uyumu, aktiflik işaretleri, iletişim kanalı ve hedef fırsat eşleşmesinden hesaplanır. Şirketin bütçesini veya satın alma niyetini **göstermez**.
- **"Sezgisel"** bulgular kesin tespit değildir; mesajlarda soru veya ihtiyatlı dille kullanılır.

## Klasör yapısı

```
UcaMedya AI Data/
  2026/İnşaat/Kocaeli/Örnek İnşaat-12/
    company.json
    analyses/v1-2026-10-24/  analysis.json · website-report.pdf · screenshots/
    analyses/v2-…            (yeniden analiz eskisini silmez)
    contact/contact-details.json
    outreach/email-draft.txt · whatsapp-draft.txt
    offers/teklif-uca-2026-0001.pdf
    history/activity-log.json
  Araştırma Raporları/ · Hızlı Analizler/ · Dışa Aktarımlar/ · _Silinenler/
```

## Güvenlik ve veri

- Test modu açıkken (üst çubukta **TEST MODU**) hiçbir şirkete mesaj gitmez.
- Kalıcı silme: teklifi olan veya kazanılmış şirket silinemez; silinen şirketin klasörü `_Silinenler`'e taşınır; ret listesi kaydı **asla** silinmez.
- Yedek: Ayarlar > Yedekleme (otomatik yedek varsayılan olarak 24 saatte bir). Geri yüklemeden önce mevcut veritabanının yedeği otomatik alınır.
- Uygulama kilidi: Ayarlar > Güvenlik ve veri.

## Kısayollar

Ctrl+K genel arama · Ctrl+N yeni araştırma · Ctrl+B menüyü daralt · Alt+1…9 menü sayfaları · Esc pencereyi kapat / açılışı atla.
