// Ekip modu uçtan uca testi: iki ayrı uygulama örneği (A, B) + ekip sunucusu (UcaMedya Bağlantı 2.0).
//   TEAM_URL=http://127.0.0.1:9420/ TEAM_KEY=uca_... node scripts/e2e-team.mjs [--exe "...exe"]
// Sunucu boş olmalı (ilk kurulum A'dan yapılır).

import { _electron as electron } from 'playwright-core'
import { mkdirSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const exeArg = process.argv.indexOf('--exe')
const exe = exeArg > 0 ? process.argv[exeArg + 1] : null
const URL_ = process.env.TEAM_URL ?? 'http://127.0.0.1:9420/'
const KEY = process.env.TEAM_KEY ?? 'uca_testkey_1234567890'
const shots = join(root, 'tests', '.tmp', 'screens')
mkdirSync(shots, { recursive: true })
const base = join(root, 'tests', '.tmp', `e2e-team-${Date.now()}`)

let failures = 0
const results = []
const step = async (name, fn) => {
  try {
    await fn()
    results.push(`✓ ${name}`)
    console.log(`✓ ${name}`)
  } catch (e) {
    failures++
    results.push(`✗ ${name}: ${e.message.split('\n')[0]}`)
    console.error(`✗ ${name}: ${e.message.split('\n')[0]}`)
  }
}

async function launch(name) {
  const userData = join(base, name)
  mkdirSync(join(userData, 'Belgeler'), { recursive: true })
  const app = await electron.launch({ executablePath: exe ?? require('electron'), args: exe ? [] : [join(root, 'out', 'main', 'index.js')], env: { ...process.env, UCAMEDYA_USER_DATA: userData, ELECTRON_RENDERER_URL: '' }, timeout: 60000 })
  const page = await app.firstWindow()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.setViewportSize({ width: 1440, height: 900 }).catch(() => undefined)
  const inv = (ch, p) => page.evaluate(([c, x]) => window.api.invoke(c, x), [ch, p])
  await page.waitForFunction(() => !!window.api, null, { timeout: 30000 })
  await inv('settings:update', { setupCompleted: true, showIntro: false, dataDir: join(userData, 'Belgeler', 'UcaMedya AI Data') })
  await page.reload()
  await page.getByRole('button', { name: /Atla/ }).click({ timeout: 20000 }).catch(() => undefined)
  await page.locator('.nav-item').first().waitFor({ timeout: 30000 })
  const shot = async (n) => {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((w) => w.isMinimized() && w.restore())).catch(() => undefined)
    await page.screenshot({ path: join(shots, `${n}.png`) })
  }
  return { app, page, inv, errors, shot }
}
const until = async (fn, ms = 40000, every = 1500) => {
  const end = Date.now() + ms
  for (;;) {
    const v = await fn()
    if (v) return v
    if (Date.now() > end) throw new Error('zaman aşımı')
    await new Promise((r) => setTimeout(r, every))
  }
}

const A = await launch('A')
let B = null

await step('A: ekip sunucusunu arayüzden kur (ilk admin)', async () => {
  await A.page.locator('.nav-item', { hasText: 'Ekip ve Kullanıcılar' }).click()
  const server = A.page.getByLabel('Sunucu (web siteniz)')
  await server.fill(URL_)
  await A.page.getByText('Henüz kurulmamış').waitFor({ timeout: 15000 })
  await A.page.getByLabel('Adınız').fill('Burak Çelik')
  await A.page.getByLabel('E-posta (giriş adı)').fill('burak@ucamedya.com.tr')
  await A.page.getByLabel('Şifre (en az 8 karakter)').fill('Guclu-Sifre-123')
  await A.page.getByLabel('Şifre (tekrar)').fill('Guclu-Sifre-123')
  await A.page.getByLabel('Bağlantı anahtarı').fill(KEY)
  await A.page.getByRole('button', { name: 'Ekip sunucusunu kur' }).click()
  await A.page.getByText('Eşitleme durumu').waitFor({ timeout: 30000 })
  await A.page.locator('.team-chip', { hasText: 'Burak Çelik · Admin' }).waitFor({ timeout: 15000 })
  await A.shot('20-ekip-kuruldu')
})

await step('A: şirket ekler, arayüzden üye oluşturur', async () => {
  await A.inv('companies:create', { name: 'Ekip Testi Lojistik A.Ş.', city: 'İstanbul', website: 'https://ekiptesti.com.tr', phone: '0532 000 11 22' })
  await A.page.getByRole('button', { name: 'Kullanıcı ekle' }).click()
  await A.page.getByLabel('Ad soyad').fill('Ayşe Yılmaz')
  await A.page.getByLabel('E-posta', { exact: true }).fill('ayse@ucamedya.com.tr')
  await A.page.getByLabel('Geçici şifre (en az 8)').fill('Ayse-Sifre-456')
  await A.page.getByRole('button', { name: 'Ekle', exact: true }).click()
  await A.page.locator('table.dt', { hasText: 'ayse@ucamedya.com.tr' }).waitFor({ timeout: 15000 })
  await A.inv('team:syncNow')
  await A.shot('21-ekip-kullanicilar')
})

await step('B: üye olarak ekibe katılır ve A\'nın şirketini görür', async () => {
  B = await launch('B')
  await B.page.locator('.nav-item', { hasText: 'Ekip ve Kullanıcılar' }).click()
  await B.page.getByLabel('Sunucu (web siteniz)').fill(URL_)
  await B.page.getByText('Ekip sunucusu kurulu').waitFor({ timeout: 15000 })
  await B.page.getByLabel('E-posta', { exact: true }).fill('ayse@ucamedya.com.tr')
  await B.page.getByLabel('Şifre', { exact: true }).fill('Ayse-Sifre-456')
  await B.page.getByRole('button', { name: 'Giriş yap' }).click()
  await B.page.locator('.team-chip', { hasText: 'Ayşe Yılmaz' }).waitFor({ timeout: 30000 })
  const row = await until(async () => {
    await B.inv('team:syncNow')
    return (await B.inv('companies:list', { q: 'Ekip Testi' })).rows[0]
  })
  if (row.city !== 'İstanbul') throw new Error(JSON.stringify(row))
  await B.page.locator('.nav-item', { hasText: 'Müşteri Havuzu' }).click()
  await B.page.getByText('Ekip Testi Lojistik A.Ş.').first().waitFor({ timeout: 15000 })
  await B.shot('22-ekip-b-musteri')
})

await step('B (üye): admin işleri engellenir', async () => {
  const id = (await B.inv('companies:list', { q: 'Ekip Testi' })).rows[0].id
  const del = await B.page.evaluate((x) => window.api.invoke('companies:delete', { id: x }).then(() => 'silindi', (e) => e.message), id)
  if (!/admin/.test(del)) throw new Error('Üye kalıcı silme yapabildi: ' + del)
  const set = await B.page.evaluate(() => window.api.invoke('settings:update', { brand: { name: 'Değişti' } }).then(() => 'değişti', (e) => e.message))
  if (!/admin/.test(set)) throw new Error('Üye paylaşılan ayarı değiştirebildi: ' + set)
})

await step('B değişiklik yapar → A görür (kim yaptı bilgisiyle)', async () => {
  const id = (await B.inv('companies:list', { q: 'Ekip Testi' })).rows[0].id
  await B.inv('companies:update', { id, patch: { stage_key: 'meeting', internal_notes: 'Ayşe görüşme ayarladı' } })
  await B.inv('team:syncNow')
  const aRow = await until(async () => {
    await A.inv('team:syncNow')
    const r = (await A.inv('companies:list', { q: 'Ekip Testi' })).rows[0]
    return r?.stage_key === 'meeting' ? r : null
  })
  const detail = await A.inv('companies:get', { id: aRow.id })
  if (detail.internal_notes !== 'Ayşe görüşme ayarladı') throw new Error('not gelmedi')
  if (!detail.activity.some((x) => x.actor === 'Ayşe Yılmaz')) throw new Error('Kim yaptı bilgisi yok: ' + detail.activity.map((x) => x.actor).join(','))
})

await step('A: çıkış → giriş ekranı → tekrar giriş', async () => {
  await A.inv('team:logout')
  await A.page.reload()
  await A.page.getByRole('button', { name: /Atla/ }).click({ timeout: 15000 }).catch(() => undefined)
  await A.page.getByText('Ekip hesabınızla giriş yapın').waitFor({ timeout: 30000 })
  await A.shot('23-ekip-giris-ekrani')
  await A.page.getByLabel('Şifre').fill('Guclu-Sifre-123')
  await A.page.getByRole('button', { name: 'Giriş yap' }).click()
  await A.page.locator('.nav-item').first().waitFor({ timeout: 30000 })
  await A.page.locator('.team-chip', { hasText: 'Burak Çelik' }).waitFor({ timeout: 15000 })
})

await step('arayüzde yakalanmamış hata yok', async () => {
  const errs = [...A.errors, ...(B?.errors ?? [])]
  if (errs.length) throw new Error(errs.slice(0, 3).join(' | '))
})

await A.app.close().catch(() => undefined)
await B?.app.close().catch(() => undefined)
console.log(`\n${results.join('\n')}\n\nSonuç: ${failures ? `${failures} adım başarısız` : 'tüm adımlar başarılı'}`)
if (!process.env.KEEP_E2E_DATA) rmSync(base, { recursive: true, force: true })
process.exit(failures ? 1 : 0)
