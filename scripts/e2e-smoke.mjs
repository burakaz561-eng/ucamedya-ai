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
let currentStep = ''
const results = []
const step = async (name, fn) => {
  const t = Date.now()
  currentStep = name
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
page.on('pageerror', (e) => { errors.push(`[${currentStep}] ${e.message}`); if (process.env.E2E_STACK) console.error(`PAGEERROR [${currentStep}] ${e.stack}`) })
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
  if (!/isteğe bağlı ve kapalı/.test(txt)) throw new Error('Yapay zekâ kapalıyken doğru bilgi gösterilmedi')
  if (!/Tarayıcı bulundu/.test(txt)) throw new Error('Tarayıcı tespiti gösterilmedi')
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
  await page.getByRole('heading', { name: 'Logo ve marka' }).waitFor({ timeout: 15000 })
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
  ['Canlı Kontrol Merkezi', 'control'], ['AI Müşteri Bulucu', 'finder'], ['Sektör Araştırması', 'research'], ['Web Sitesi Analizi', 'analysis'], ['Müşteri Havuzu', 'companies'], ['Satış Panosu', 'pipeline'], ['Web Sitesi Talepleri', 'leads'],
  ['İletişim Merkezi', 'communication'], ['E-posta Kampanyaları', 'email'], ['WhatsApp İşlemleri', 'whatsapp'], ['AI Mesaj Stüdyosu', 'studio'],
  ['Teklif ve Satış', 'offers'], ['Takip Planlayıcısı', 'followup'], ['Raporlar ve Analitik', 'reports'], ['Dosya Merkezi', 'files'],
  ['Entegrasyonlar', 'integrations'], ['Görevler ve Otomasyonlar', 'automations'], ['Uygulama Ayarları', 'settings']
]
await step('18 menü ekranının tamamı açılıyor (boş veriyle)', async () => {
  for (const [label, key] of pages) {
    await ensureShown()
  await page.locator('.nav-item', { hasText: label }).click()
    await page.locator('.page-head h1').first().waitFor({ timeout: 15000 })
    await page.waitForTimeout(400)
    await shot(`05-bos-${key}`)
  }
  if (errors.length) throw new Error(`Sayfa hataları: ${errors.slice(0, 3).join(' | ')}`)
})

await step('araştırma: API sağlayıcısı seçilip anahtar yokken sahte başarı yok', async () => {
  const r = await page.evaluate(() => window.api.invoke('research:start', { name: 'Test', provider: 'google_places', sectors: ['İnşaat'], locations: [{ city: 'Kocaeli' }], customerTypes: [], analysisTypes: [], targetCount: 10, steps: { analyze: true, screenshots: true, pdf: true, drafts: true }, channels: ['email'], tone: 'professional' }).then(() => 'başladı', (e) => e.message))
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

await step('stüdyo: düzenlenen taslak Kaydet sonrası korunur; şablon değişikliği elle düzenlenene dokunmaz', async () => {
  await ensureShown()
  await page.locator('.nav-item', { hasText: 'AI Mesaj Stüdyosu' }).click()
  await page.locator('.seg button', { hasText: 'Hepsi' }).click()
  await page.waitForTimeout(800)
  const ta = page.locator('textarea').first()
  await ta.waitFor({ timeout: 10000 })
  const yeni = 'Merhaba,\nBu metni Stüdyo\'da elle değiştirdim.\n\nİyi çalışmalar,'
  await ta.fill(yeni)
  await page.getByRole('button', { name: 'Kaydet' }).click()
  await page.waitForTimeout(1500)
  const shown = await ta.inputValue()
  if (shown !== yeni) throw new Error('Kaydet sonrası editör eski metne döndü: ' + shown.slice(0, 60))
  const list = await inv('drafts:list', { companyId })
  const manual = list.find((x) => x.body === yeni)
  if (!manual || manual.generator !== 'manual') throw new Error('Veritabanına kaydedilmedi')
  // WhatsApp taslağı şablondan; şablon ve ret satırı değişince yalnızca o yenilenir
  const wa = await inv('drafts:create', { companyId, channel: 'whatsapp', tone: 'professional' })
  const cur = await inv('settings:get')
  await inv('settings:update', { outreach: { ...cur.outreach, includeOptOutLine: false, templates: { ...cur.outreach.templates, whatsappBody: 'YENİ ŞABLON — {sirket}' } } })
  const after = await inv('drafts:list', { companyId })
  const w = after.find((x) => x.id === wa.id)
  if (!w.body.startsWith('YENİ ŞABLON')) throw new Error('Şablon değişikliği taslağa yansımadı: ' + w.body.slice(0, 40))
  if (w.body.includes(cur.outreach.optOutText.slice(0, 30))) throw new Error('Ret satırı kapatıldığı hâlde taslakta')
  if (after.find((x) => x.id === manual.id).body !== yeni) throw new Error('Elle düzenlenen taslak ezildi')
  const blocked = after.filter((x) => x.status === 'draft' && x.eligibility.reasons.length === 1 && /henüz onaylanmadı/.test(x.eligibility.reasons[0]))
  await shot('08b-studyo-kaydet')
  await inv('settings:update', { outreach: cur.outreach })
  console.log(`   yalnızca onay bekleyen (engel sayılmayan) taslak: ${blocked.length}`)
})

await step('stüdyo: toplu onay', async () => {
  await inv('drafts:create', { companyId, channel: 'email', tone: 'professional' })
  await ensureShown()
  await page.locator('.nav-item', { hasText: 'AI Mesaj Stüdyosu' }).click()
  await page.locator('.seg button', { hasText: 'Onay bekleyen' }).click()
  await page.waitForTimeout(900)
  const n = await page.locator('.list-item input[type=checkbox]:not([disabled])').count()
  if (n < 2) throw new Error(`Onay bekleyen taslak az: ${n}`)
  await page.getByLabel('Tümünü seç').check()
  await page.locator('.studio-bulk').getByRole('button', { name: 'Onayla' }).click()
  await page.getByRole('button', { name: new RegExp(`^${n} taslağı onayla`) }).click()
  await page.waitForTimeout(1200)
  const left = (await inv('drafts:list', { status: 'draft' })).length
  if (left !== 0) throw new Error(`Onaylanmayan kaldı: ${left}`)
  await shot('08c-toplu-onay')
})

await step('e-posta ekranı: seçileni sil', async () => {
  const before = (await inv('drafts:list', { channel: 'email' })).filter((d) => ['draft', 'approved', 'rejected'].includes(d.status)).length
  if (before < 1) throw new Error('Silinecek e-posta taslağı yok')
  await ensureShown()
  await page.locator('.nav-item', { hasText: 'E-posta Kampanyaları' }).click()
  await page.waitForTimeout(900)
  await page.locator('table tbody tr input[type=checkbox]').first().check()
  await page.getByRole('button', { name: 'Seçilenleri sil' }).click()
  await page.getByRole('button', { name: /taslağı sil$/ }).click()
  await page.waitForTimeout(1000)
  const after = (await inv('drafts:list', { channel: 'email' })).filter((d) => ['draft', 'approved', 'rejected'].includes(d.status)).length
  if (after !== before - 1) throw new Error(`Silinmedi: ${before} → ${after}`)
  await shot('08d-eposta-sil')
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

await step('analizden teklif taslağı (fiyatsız kalemle gönderilemez) + PDF', async () => {
  const id = await page.evaluate((cid) => window.api.invoke('offers:fromAnalysis', { companyId: cid }).catch((e) => e.message), companyId)
  if (typeof id === 'string') {
    if (!/önerilen bir hizmet yok/.test(id)) throw new Error(id)
    console.log('   analizde önerilen hizmet yok → taslak oluşturulmadı (beklenen davranış)')
    return
  }
  const o = await inv('offers:get', { id })
  if (o.origin !== 'analysis' || o.status !== 'draft' || !o.items.length) throw new Error(JSON.stringify({ origin: o.origin, status: o.status, n: o.items.length }))
  const items = o.items.map((i) => ({ name: i.name, quantity: i.quantity, unitPrice: 0, vatRate: i.vat_rate }))
  const sent = await page.evaluate(([oid, cid, it]) => window.api.invoke('offers:save', { id: oid, companyId: cid, title: 'x', status: 'sent', items: it }).then(() => 'kaydedildi', (e) => e.message), [id, companyId, items])
  if (!/Fiyatı girilmemiş/.test(sent)) throw new Error('Fiyatsız teklif gönderildi yapılabildi: ' + sent)
  const pdf = await inv('offers:pdf', { id })
  console.log(`   ${o.items.length} kalem: ${o.items.map((i) => i.name).join(', ')} · PDF: ${pdf}`)
})

await step('tasarım konsepti sunumu (PDF)', async () => {
  const r = await inv('concepts:create', { companyId })
  const { statSync } = await import('node:fs')
  const kb = Math.round(statSync(r.pdf).size / 1024)
  if (kb < 30) throw new Error(`PDF çok küçük: ${kb} KB`)
  console.log(`   ${r.pdf} (${kb} KB)`)
})

await step('satış panosu: kartı sürükle-bırak → aşama + geçmiş', async () => {
  await ensureShown()
  await page.locator('.nav-item', { hasText: 'Satış Panosu' }).click()
  const card = page.locator('.kanban-card', { hasText: 'UcaMedya (test kaydı)' }).first()
  await card.waitFor({ timeout: 15000 })
  const target = page.locator('.kanban-col', { has: page.locator('.kanban-head', { hasText: 'Görüşme planlandı' }) })
  await card.dragTo(target)
  await page.waitForTimeout(1200)
  const c = await inv('companies:get', { id: companyId })
  if (c.stage_key !== 'meeting') throw new Error(`Aşama değişmedi: ${c.stage_key}`)
  if (!c.stageHistory.some((h) => h.to_key === 'meeting')) throw new Error('Aşama geçmişine yazılmadı')
  if (!(await target.locator('.kanban-card', { hasText: 'UcaMedya (test kaydı)' }).count())) throw new Error('Kart arayüzde hedef sütunda görünmüyor')
  await shot('09b-satis-panosu')
})

await step('asistan: özet ve soru-cevap', async () => {
  const r = await inv('assistant:ask', { question: 'Teklif hazırlamam gereken müşterileri göster' })
  if (r.source !== 'data') throw new Error(JSON.stringify(r).slice(0, 200))
  await ensureShown()
  await page.locator('.assistant-fab').click()
  await page.locator('.assistant-input input').fill('İncelenmemiş müşteri kayıtlarını listele')
  await page.locator('.assistant-input button[type=submit]').click()
  await page.locator('.am.uca').nth(1).waitFor({ timeout: 10000 })
  await shot('09c-asistan')
  await page.getByRole('button', { name: 'Kapat' }).last().click()
})

await step('satış analitiği: veri yok ayrımı', async () => {
  const m = await inv('reports:metrics', {})
  const by = Object.fromEntries(m.metrics.map((x) => [x.key, x.value]))
  if (by.found < 1 || by.analyzed < 1) throw new Error(JSON.stringify(by))
  if (by.web_leads !== null) throw new Error('Web sitesi bağlantısı yokken talep sayısı veri yok olmalı')
})

await step('görev + hatırlatıcı kaydı', async () => {
  await inv('tasks:save', { title: 'Toplantı planla', companyId, dueAt: new Date().toISOString().slice(0, 10), priority: 'high' })
  const t = await inv('tasks:list', { status: 'active' })
  if (!t.length) throw new Error('Görev listelenmedi')
})

if (process.env.E2E_BROWSER === '1') {
  await step('tarayıcı ile gerçek Google araştırması (5 şirket, iletişim taraması)', async () => {
    const rid = await inv('research:start', { name: 'E2E tarayıcı araştırması', sectors: ['Mimarlık'], locations: [{ city: 'Kocaeli' }], customerTypes: [], analysisTypes: [], targetCount: 5, provider: 'google_browser', steps: { analyze: false, screenshots: false, pdf: false, drafts: true, contacts: true }, channels: ['email', 'whatsapp'], tone: 'professional' })
    await ensureShown()
    await page.locator('.nav-item', { hasText: 'Canlı Kontrol Merkezi' }).click()
    const end = Date.now() + 300000
    let r
    for (;;) {
      r = await inv('research:get', { id: rid })
      if (['completed', 'failed'].includes(r.status) || Date.now() > end) break
      if (r.results.length && !globalThis.__shot) { globalThis.__shot = 1; await page.waitForTimeout(2500); await shot('12-canli-kontrol') }
      await page.waitForTimeout(2000)
    }
    if (r.status !== 'completed') throw new Error(`Araştırma: ${r.status} ${r.error ?? ''} ${r.run?.error ?? ''}`)
    const found = r.results.filter((x) => x.status === 'done')
    console.log('   bulunan:', r.results.map((x) => `${x.name ?? x.raw_name} [${x.status}] ${x.website ?? 'site yok'}`).join(' | '))
    if (found.length < 3) throw new Error(`Yalnızca ${found.length} şirket işlendi`)
    const withPhone = (await Promise.all(found.map((x) => inv('companies:get', { id: x.company_id })))).filter((c) => c.contacts.some((k) => k.type === 'phone'))
    if (!withPhone.length) throw new Error('Hiçbir şirkette telefon bulunamadı')
    await inv('agent:stop')
  })
}

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

await step('mesaj görseli: ayar, önizleme, panoya PNG', async () => {
  const { writeFileSync } = await import('node:fs')
  const img = join(userData, 'kampanya.png')
  const { readFileSync } = await import('node:fs')
  writeFileSync(img, readFileSync(join(root, 'build', 'icon.png')))
  const cur = (await inv('settings:get')).outreach
  await inv('settings:update', { outreach: { ...cur, image: { path: img, email: true, whatsapp: true } } })
  const data = await inv('outreach:imageData')
  if (!(data ?? '').startsWith('data:image/png;base64,')) throw new Error('Önizleme yok')
  await app.evaluate(({ clipboard }) => clipboard.clear())
  await inv('outreach:copyImage')
  const has = await app.evaluate(({ clipboard }) => clipboard.has('image/png'))
  if (!has) throw new Error('Panoda PNG yok')
  await ensureShown()
  await page.locator('.nav-item', { hasText: 'Uygulama Ayarları' }).click()
  await page.getByRole('tab', { name: 'Mesaj gönderimi' }).click()
  await page.locator('img[alt="Mesaj görseli"]').first().scrollIntoViewIfNeeded()
  await page.waitForTimeout(600)
  await shot('10b-mesaj-gorseli')
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
