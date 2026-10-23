# Kurulum

## Windows (hazır paket)

1. `release\UcaMedyaAI-Setup-0.1.0.exe` dosyasını çalıştırın.
2. Paket imzasız olduğu için Windows SmartScreen "Windows bilgisayarınızı korudu" diyebilir → **Ek bilgi → Yine de çalıştır**.
3. Kurulum klasörünü seçin; masaüstü ve Başlat menüsü kısayolu oluşturulur.
4. İlk açılışta kurulum sihirbazı başlar. Her adım atlanabilir.

Gereksinim: Windows 10/11 x64 ve **Microsoft Edge** (Windows'ta her zaman yüklüdür). Web sitesi analizi için sistemdeki Edge başsız modda kullanılır; ek tarayıcı indirilmez.

**Verileriniz nerede?**

| Veri | Konum |
|---|---|
| Veritabanı, ayarlar, şifreli anahtarlar, günlükler | `%APPDATA%\UcaMedya AI Growth Studio` |
| Şirket klasörleri, ekran görüntüleri, PDF'ler, dışa aktarımlar | Sihirbazda seçtiğiniz klasör (varsayılan `Belgeler\UcaMedya AI Data`) |
| Yedekler | Ayarlar > Yedekleme'de seçtiğiniz klasör (varsayılan `%APPDATA%\UcaMedya AI Growth Studio\Yedekler`) |

Yeni sürüm kurulduğunda veriler korunur. Kaldırırken veritabanını silmek isteyip istemediğiniz sorulur (varsayılan: hayır).

## macOS

macOS paketi yalnızca bir Mac üzerinde derlenebilir:

```bash
npm ci
npm run dist:mac
```

`release/UcaMedyaAI-0.1.0-arm64.dmg` (Apple Silicon) ve `-x64.dmg` (Intel) üretilir. Gereksinim: Google Chrome veya Microsoft Edge yüklü olmalı.

İmzalama ve notarization (Gatekeeper uyarısı olmadan dağıtım için):
1. Apple Developer Program üyeliği ve "Developer ID Application" sertifikası anahtar zincirinde olmalı.
2. Ortam değişkenleri: `CSC_NAME`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`.
3. `electron-builder.yml` içinde `mac.notarize: true` yapın.

İmzasız paketi açmak için: Finder'da uygulamaya sağ tıklayın → **Aç**.

## Kaynak koddan çalıştırma (geliştirici)

Gereksinimler: Node.js 22+ (24 ile test edildi), npm 10+, Git.

```bash
npm ci
npm run dev
```

| Komut | Açıklama |
|---|---|
| `npm run dev` | Geliştirme modu (canlı yenileme) |
| `npm run build` | Derleme (`out/`) |
| `npm run typecheck` | TypeScript kontrolü |
| `npm test` | Birim testleri (Vitest) |
| `LIVE=1 npx vitest run tests/live-analyzer.test.ts` | Gerçek bir siteyi analiz eden canlı test (`SITE=https://…`) |
| `npm run test:e2e` | Derlenmiş uygulamayı açıp 21 adımlık uçtan uca test (test penceresi masaüstünde görünür) |
| `node scripts/e2e-smoke.mjs --exe "release\win-unpacked\UcaMedya AI Growth Studio.exe"` | Aynı testi paketlenmiş uygulamayla |
| `npm run icons` | Simgeleri resmî logodan yeniden üretir |
| `npm run dist` | Windows kurulum paketi |
| `npm run dist:mac` | macOS DMG (Mac üzerinde) |

`npm ci` sırasında npm, `esbuild` ve `electron-winstaller` kurulum betiklerini onay isteyebilir: `npm install-scripts approve esbuild electron-winstaller`.

Teknoloji sürümleri: Electron 44, React 19, TypeScript 5.9, Three.js 0.180, Vite 7, electron-vite 5, playwright-core 1.64, Anthropic SDK 0.133, nodemailer 10, imapflow 2, exceljs 4, zod 4. Veritabanı Node'un yerleşik `node:sqlite` modülüdür (yerel derleme gerekmez).

API anahtarları kaynak koda veya `.env` dosyasına yazılmaz; uygulama içinden girilir ve işletim sisteminin güvenli kasasında saklanır. `.env.example` yalnızca geliştirme/test değişkenlerini listeler.
