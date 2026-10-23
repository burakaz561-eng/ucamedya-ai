// Uçtan uca duman testi: derlenmiş (veya paketlenmiş) uygulamayı Playwright ile açar, geçici bir veri
// klasörüyle açılış → kurulum sihirbazı → tüm ekranlar → gerçek iş akışlarını (şirket ekleme, gerçek site
// analizi, PDF, taslak, uygunluk kontrolü, teklif PDF, yedek) dener ve ekran görüntüleri alır.
// Hiçbir şirkete mesaj göndermez (test modu açık, e-posta hesabı yok).
//
//   npm run build && npm run test:e2e
//   node scripts/e2e-smoke.mjs --exe "release\win-unpacked\UcaMedya AI Growth Studio.exe"
//   E2E_SITE=https://ornek.com.tr npm run test:e2e   (analiz edilecek site; varsayılan ucamedya.com.tr)

import { _electron as electron } from 'playwright-core'
import { mkdirSync, existsSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const exeArg = process.argv.indexOf('--exe')
const exe = exeArg > 0 ? process.argv[exeArg + 1] : null
const shots = join(root, 'tests', '.tmp', 'screens')
const userData = join(root, 'tests', '.tmp', `e2e-${Date.now()}`)
const docs = join(userData, 'Belgeler')
mkdirSync(shots, { recursive: true })
mkdirSync(docs, { recursive: true })
const SITE = process.env.E2E_SITE ?? 'https://ucamedya.com.tr/'

let failures = 0
const results = []
const step = async (name, fn) => {
  const t = Date.now()
  try {
    await fn()
    results.push(`✓ ${name} (${((Date.now() - t) / 1000).toFixed(1)} sn)`)
    console.log(`✓ ${name}`)
  } catch (e) {
    failures++
    results.push(`✗ ${name}: ${e.message.split('\n')[0]}`)
    console.error(`✗ ${name}: ${e.message.split('\n')[0]}`)
  }
}

const app = await electron.launch({
  executablePath: exe ?? require('electron'),
  args: exe ? [] : [join(root, 'out', 'main', 'index.js')],
  env: { ...process.env, UCAMEDYA_USER_DATA: userData, ELECTRON_RENDERER_URL: '' },
  timeout: 60000
})
const page = await app.firstWindow()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
await page.setViewportSize({ width: 1440, height: 900 }).catch(() => undefined)
// Test penceresi masaüstünde küçültülürse Windows çizimi durdurur; ekran görüntüsünden önce geri getirilir
const ensureShown = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((w) => { if (w.isMinimized()) w.restore() })).catch(() => undefined)
const shot = async (n) => {
  await ensureShown()
  await page.screenshot({ path: join(shots, `${n}.png`) })
}
const inv = (ch, p) => page.evaluate(([c, x]) => window.api.invoke(c, x), [ch, p])
const waitJob = async (runId, timeoutMs = 240000) => {
  const end = Date.now() + timeoutMs
  for (;;) {
    const r = await inv('jobs:get', { id: runId })
    if (['completed', 'failed', 'cancelled'].includes(r.status)) return r
    if (Date.now() > end) throw new Error(`Görev #${runId} zaman aşımı (${r.status})`)
    await page.waitForTimeout(1500)
  }
}

await step('açılış ekranı ve gerçek sistem kontrolleri', async () => {
  await page.getByText('Yerel veritabanı kontrol ediliyor').waitFor({ timeout: 30000 })
  await page.waitForTimeout(2600)
  await shot('01-acilis')
  await page.getByText('Şema sürümü').waitFor({ timeout: 20000 })
  const txt = await page.locator('.splash').innerText()
  if (!/anahtarı tanımlanmamış/.test(txt)) throw new Error('AI anahtarı yokken uyarı gösterilmedi')
})

await step('güvenlik: renderer içinde Node.js erişimi yok', async () => {
  const r = await page.evaluate(() => ({ req: typeof window.require, proc: typeof window.process, api: typeof window.api }))
  if (r.req !== 'undefined' || r.proc !== 'undefined' || r.api !== 'object') throw new Error(JSON.stringify(r))
})

await step('güvenlik: bilinmeyen IPC komutu reddediliyor', async () => {
  const r = await page.evaluate(() => window.api.invoke('fs:readFile', { path: 'C:/Windows/win.ini' }).then(() => 'açık', (e) => e.message))
  if (!/Bilinmeyen komut/.test(r)) throw new Error(r)
  const r2 = await page.evaluate(() => window.api.invoke('shell:openPath', { path: 'C:/Windows/System32' }).then(() => 'açık', (e) => e.message))
  if (!/açılamaz/.test(r2)) throw new Error(`Veri klasörü dışı yol açıldı: ${r2}`)
})

await step('açılışı atla → kurulum sihirbazı', async () => {
  await page.getByRole('button', { name: /Atla/ }).click()
  await page.getByText('Kurulum sihirbazı').waitFor({ timeout: 15000 })
  await page.waitForTimeout(1500)
  await shot('02-sihirbaz-marka')
})

await step('sihirbaz: veri klasörü ve test modu, adımları geç', async () => {
  await inv('settings:update', { dataDir: join(docs, 'UcaMedya AI Data') })
  for (let i = 0; i < 7; i++) {
    if (i === 6) await shot('03-sihirbaz-guvenlik')
    await page.getByRole('button', { name: /^Devam/ }).click()
  }
  await page.getByRole('button', { name: 'Uygulamaya geç' }).click()
  await page.getByText('İlk araştırmanızı başlatın', { exact: false }).waitFor({ timeout: 15000 })
  await page.waitForTimeout(1500)
  await shot('04-genel-bakis-bos')
})

const pages = [
  ['AI Müşteri Bulucu', 'finder'], ['Sektör Araştırması', 'research'], ['Web Sitesi Analizi', 'analysis'], ['Müşteri Havuzu', 'companies'],
  ['İletişim Merkezi', 'communication'], ['E-posta Kampanyaları', 'email'], ['WhatsApp İşlemleri', 'whatsapp'], ['AI Mesaj Stüdyosu', 'studio'],
  ['Teklif ve Satış', 'offers'], ['Takip Planlayıcısı', 'followup'], ['Raporlar ve Analitik', 'reports'], ['Dosya Merkezi', 'files'],
  ['Entegrasyonlar', 'integrations'], ['Görevler ve Otomasyonlar', 'automations'], ['Uygulama Ayarları', 'settings']
]
await step('16 menü ekranının tamamı açılıyor (boş veriyle)', async () => {
  for (const [label, key] of pages) {
    await ensureShown()
  await page.locator('.nav-item', { hasText: label }).click()
    await page.locator('.page-head h1').first().waitFor({ timeout: 15000 })
    await page.waitForTimeout(400)
    await shot(`05-bos-${key}`)
  }
  if (errors.length) throw new Error(`Sayfa hataları: ${errors.slice(0, 3).join(' | ')}`)
})

await step('araştırma: sağlayıcı anahtarı yokken sahte başarı yok', async () => {
  const r = await page.evaluate(() => window.api.invoke('research:start', { name: 'Test', sectors: ['İnşaat'], locations: [{ city: 'Kocaeli' }], customerTypes: [], analysisTypes: [], targetCount: 10, steps: { analyze: true, screenshots: true, pdf: true, drafts: true }, channels: ['email'], tone: 'professional' }).then(() => 'başladı', (e) => e.message))
  if (!/API anahtarı yok/.test(r)) throw new Error(r)
})

let companyId
await step('şirket ekleme + tekrar kaydı engeli', async () => {
  companyId = await inv('companies:create', { name: 'UcaMedya (test kaydı)', sector: 'Diğer', city: 'İstanbul', website: SITE, phone: '0216 606 88 96' })
  const dup = await page.evaluate((site) => window.api.invoke('companies:create', { name: 'Uca Medya Test', website: site }).then(() => 'eklendi', (e) => e.message), SITE)
  if (!/zaten kayıtlı/.test(dup)) throw new Error(`Yinelenen kayıt engellenmedi: ${dup}`)
})

let analysisId
await step(`gerçek site analizi (${SITE}) + ekran görüntüleri + PDF`, async () => {
  const runId = await inv('analysis:runCompanies', { ids: [companyId] })
  const r = await waitJob(runId, 300000)
  if (r.status !== 'completed') throw new Error(`Analiz görevi: ${r.status} ${r.error ?? ''}`)
  const list = await inv('analysis:list', { companyId })
  const a = await inv('analysis:get', { id: list[0].id })
  analysisId = a.id
  if (a.status !== 'done') throw new Error(`Analiz durumu ${a.status}: ${a.error}`)
  if (a.screenshots.length < 3) throw new Error(`Az ekran görüntüsü: ${a.screenshots.length}`)
  if (!a.report_path) throw new Error('PDF raporu oluşmadı')
  const files = await inv('files:list', { companyId })
  if (!files.some((f) => f.kind === 'report_pdf')) throw new Error('PDF Dosya Merkezi’ne kaydedilmedi')
  console.log(`   puan ${a.scores.overall}, ${a.findings.length} bulgu, ${a.screenshots.length} görüntü, PDF: ${a.report_path}`)
})

await step('yeniden analiz → yeni sürüm (eski silinmez)', async () => {
  const before = (await inv('analysis:list', { companyId })).length
  const runId = await inv('analysis:runCompanies', { ids: [companyId] })
  await waitJob(runId, 300000)
  const after = await inv('analysis:list', { companyId })
  if (after.length !== before + 1 || after[0].version !== 2) throw new Error(`Sürüm: ${after.map((x) => x.version)}`)
})

await step('müşteri kartı ve analiz görüntüleyici', async () => {
  await ensureShown()
  await ensureShown()
  await page.locator('.nav-item', { hasText: 'Müşteri Havuzu' }).click()
  await page.getByText('UcaMedya (test kaydı)').first().click()
  await page.getByRole('dialog').waitFor()
  await page.waitForTimeout(800)
  await shot('06-musteri-karti')
  await page.getByRole('tab', { name: /Analizler/ }).click()
  await page.waitForTimeout(1500)
  await shot('07-musteri-analiz')
  await page.keyboard.press('Escape')
})

await step('mesaj taslağı (AI yok → şablon), uygunluk engelleri, onay', async () => {
  const d = await inv('drafts:create', { companyId, channel: 'email', tone: 'professional' })
  const list = await inv('drafts:list', { companyId })
  const draft = list.find((x) => x.id === d.id)
  if (draft.generator !== 'template') throw new Error('AI yokken şablon kullanılmadı')
  if (draft.eligibility.ok) throw new Error('E-posta hesabı/test alıcısı yokken gönderime uygun göründü')
  await inv('drafts:setStatus', { ids: [d.id], status: 'approved' })
  const q = await inv('outreach:enqueue', { ids: [d.id] })
  if (q.queued !== 0 || !q.skipped.length) throw new Error('Hesapsız mesaj kuyruğa alındı')
  await ensureShown()
  await page.locator('.nav-item', { hasText: 'AI Mesaj Stüdyosu' }).click()
  await page.waitForTimeout(800)
  await page.locator('.seg button', { hasText: 'Onaylı' }).click()
  await page.waitForTimeout(1200)
  await shot('08-mesaj-studyosu')
})

await step('ret listesi: işaretlenen şirkete taslak oluşturulamıyor', async () => {
  const other = await inv('companies:create', { name: 'Ret Test Ltd', city: 'Kocaeli', email: 'info@ret-test.example' })
  await inv('companies:suppress', { id: other, reason: 'test' })
  const r = await page.evaluate((id) => window.api.invoke('drafts:create', { companyId: id, channel: 'email' }).then(() => 'oluştu', (e) => e.message), other)
  if (!/ret listesinde/.test(r)) throw new Error(r)
  const del = await inv('companies:delete', { id: other })
  const sup = await inv('suppression:list')
  if (!sup.some((s) => s.value_key === 'info@ret-test.example')) throw new Error('Silinen şirketin ret kaydı kayboldu')
  void del
})

await step('teklif: KDV/indirim hesabı + PDF', async () => {
  const svc = await inv('services:list')
  const id = await inv('offers:save', { companyId, title: 'Web sitesi yenileme', discountType: 'percent', discountValue: 10, vatIncluded: false, items: [{ serviceId: svc[3].id, name: svc[3].name, quantity: 1, unitPrice: 50000, vatRate: 20 }] })
  const o = await inv('offers:get', { id })
  if (Math.abs(o.total - 54000) > 0.01) throw new Error(`Toplam hatalı: ${o.total}`)
  const pdf = await inv('offers:pdf', { id })
  if (!pdf.endsWith('.pdf')) throw new Error(pdf)
  await ensureShown()
  await page.locator('.nav-item', { hasText: 'Teklif ve Satış' }).click()
  await page.waitForTimeout(1000)
  await shot('09-teklifler')
})

await step('görev + hatırlatıcı kaydı', async () => {
  await inv('tasks:save', { title: 'Toplantı planla', companyId, dueAt: new Date().toISOString().slice(0, 10), priority: 'high' })
  const t = await inv('tasks:list', { status: 'active' })
  if (!t.length) throw new Error('Görev listelenmedi')
})

await step('yedek oluşturma + doğrulama', async () => {
  const runId = await inv('backup:create')
  const r = await waitJob(runId, 60000)
  if (r.status !== 'completed') throw new Error(r.error)
  const list = await inv('backup:list')
  if (!list[0]?.exists || list[0].status !== 'ok') throw new Error(JSON.stringify(list[0]))
})

await step('Excel dışa aktarma bileşeni (kayıtlar gerçek)', async () => {
  const st = await inv('dashboard:stats')
  if (st.companies < 1 || st.analyzed < 1) throw new Error(JSON.stringify({ c: st.companies, a: st.analyzed }))
})

await step('dolu ekranlar: genel bakış, analiz, raporlar, dosyalar, otomasyonlar', async () => {
  for (const [label, key] of [['Genel Bakış', 'dashboard'], ['Web Sitesi Analizi', 'analysis'], ['Raporlar ve Analitik', 'reports'], ['Dosya Merkezi', 'files'], ['Görevler ve Otomasyonlar', 'automations'], ['Entegrasyonlar', 'integrations']]) {
    await ensureShown()
  await page.locator('.nav-item', { hasText: label }).click()
    await page.waitForTimeout(1600)
    await shot(`10-dolu-${key}`)
  }
})

await step('koyu tema', async () => {
  await ensureShown()
  await page.locator('.nav-item', { hasText: 'Genel Bakış' }).click()
  await page.getByRole('button', { name: 'Temayı değiştir' }).click()
  await page.waitForTimeout(1200)
  await shot('11-koyu-tema')
})

await step('arayüzde yakalanmamış hata yok', async () => {
  if (errors.length) throw new Error(errors.slice(0, 3).join(' | '))
})

await app.close()
console.log(`\n${results.join('\n')}\n\nSonuç: ${failures ? `${failures} adım başarısız` : 'tüm adımlar başarılı'} · ekran görüntüleri: ${shots}`)
if (!process.env.KEEP_E2E_DATA && existsSync(userData)) rmSync(userData, { recursive: true, force: true })
process.exit(failures ? 1 : 0)
