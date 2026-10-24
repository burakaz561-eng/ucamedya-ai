# UcaMedya AI Growth Studio

UcaMedya için yapay zekâ destekli müşteri bulma, web sitesi analizi, satış otomasyonu ve ajans yönetimi masaüstü uygulaması (Windows / macOS).

- **API gerekmez (0.2):** Google araması, Gmail ve WhatsApp Web bilgisayarınızdaki Chrome üzerinden, kendi oturumlarınızla — canlı izlenebilir, onaylı gönderim
- Sektör + konum bazlı şirket keşfi (tarayıcı veya isteğe bağlı API), tekrar kaydı engeli
- Masaüstü + mobil site analizi: ~45 ölçüt, ekran görüntüsü kanıtı, PageSpeed/Core Web Vitals, PDF rapor
- Gerekçeli fırsat puanı, CRM (16 aşama), birleştirme, Excel/CSV
- Yalnızca doğrulanmış bulgulara dayanan AI mesaj taslakları (Claude / OpenAI), 10 düzenleme eylemi
- Onaylı, ret listesine ve izinlere saygılı e-posta ve WhatsApp gönderim kuyruğu (test modu, duraklat/devam/iptal, tekrar gönderim engeli)
- Teklif (KDV, indirim, PDF), görevler, hatırlatıcılar, raporlar
- UcaMedya'nın resmî logosu, 3D robot maskotu "Uca" ve sinematik açılış

| Belge | İçerik |
|---|---|
| [docs/MIMARI.md](docs/MIMARI.md) | Teknik mimari, veri modeli, ekran planı, riskler |
| [docs/DURUM-RAPORU.md](docs/DURUM-RAPORU.md) | **Her özelliğin gerçek durumu**, test raporu, bilinen sınırlamalar |
| [docs/TARAYICI-ILE-KULLANIM.md](docs/TARAYICI-ILE-KULLANIM.md) | **API'siz kullanım:** tarayıcı profili, girişler, gönderim modları, riskler |
| [docs/KURULUM.md](docs/KURULUM.md) | Kurulum, derleme ve test komutları |
| [docs/KULLANIM-KILAVUZU.md](docs/KULLANIM-KILAVUZU.md) | Günlük kullanım |
| [docs/API-YAPILANDIRMA.md](docs/API-YAPILANDIRMA.md) | İsteğe bağlı API'ler (Google Places, PageSpeed, Claude/OpenAI, SMTP, WhatsApp Business) |

Hızlı başlangıç (geliştirici): `npm ci && npm run dev` · Windows paketi: `npm run dist` → `release/UcaMedyaAI-Setup-<sürüm>.exe`
