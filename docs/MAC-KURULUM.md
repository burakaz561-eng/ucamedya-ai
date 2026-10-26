# macOS kurulumu

## DMG dosyasını üretmek (GitHub ile, Mac gerekmez)

1. GitHub'da depo sayfası → **Actions** → solda **macOS DMG** → **Run workflow** → **Run workflow**.
2. Yaklaşık 10–15 dakika sürer; yeşil tik çıkınca çalışmaya tıklayın → en altta **Artifacts → UcaMedyaAI-mac** → indirin (zip).
3. Zip'in içinde iki dosya vardır:
   - `UcaMedyaAI-x.y.z-arm64.dmg` → Apple Silicon (M1, M2, M3, M4) Mac'ler
   - `UcaMedyaAI-x.y.z-x64.dmg` → Intel işlemcili Mac'ler
   Mac'inizin hangisi olduğunu görmek için: sol üstte  → **Bu Mac Hakkında** → "Çip: Apple M…" yazıyorsa arm64, "İşlemci: Intel" yazıyorsa x64.

## Mac'e kurmak

1. DMG'yi çift tıklayın, açılan pencerede **UcaMedya AI Growth Studio** simgesini **Applications (Uygulamalar)** klasörüne sürükleyin.
2. İlk açılış: Uygulamalar klasöründe simgeye **sağ tık → Aç → Aç**. (Uygulama Apple tarafından imzalı olmadığı için çift tıklayınca "geliştirici doğrulanamadı" uyarısı çıkar; bu bir kez yapılır.)
   - macOS 15 ve sonrasında "Aç" seçeneği çıkmazsa: **Sistem Ayarları → Gizlilik ve Güvenlik** → aşağıda "UcaMedya AI Growth Studio engellendi" → **Yine de Aç**.
3. Gerekenler: **Google Chrome** (Google araması ve webmail için) ve WhatsApp kullanacaksanız **WhatsApp masaüstü uygulaması**.

## Notlar

- Veriler Mac'te `~/Library/Application Support/UcaMedya AI Growth Studio` klasöründe tutulur; Windows'taki verileriniz otomatik taşınmaz (Ayarlar → Yedekler → Dışa aktar / Geri yükle ile taşınabilir).
- API anahtarları ve bağlantı anahtarı Mac'in Anahtar Zinciri'nde saklanır; Mac'te yeniden girilmeleri gerekir.
- Uyarısız açılış için Apple Developer hesabı (yıllık ücretli) ile imzalama ve notarization gerekir; `electron-builder.yml` içinde hazırlık notları var.
- Durum: 🟡 Mac'te henüz çalıştırılmadı; ilk kullanımda Google araması, webmail taslağı ve WhatsApp sohbeti açma birlikte kontrol edilmeli.
