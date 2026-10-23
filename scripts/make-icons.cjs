// Uygulama simgesini SVG'den üretir: resources/icon.png (512px), build/icon.png ve build/icon.ico
// Çalıştırma: npm run icons   (Electron'un görünmez penceresiyle SVG → PNG dönüştürür)

const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

// Simge, resmî UcaMedya logosunun (açık sürüm) antrasit zemin üzerine yerleştirilmesiyle üretilir; yeni logo çizilmez.
const LOGO = fs.readFileSync(path.join(__dirname, '..', 'resources', 'brand', 'uca-medya-logo-light.svg'), 'utf8').replace(/<\?xml[^>]*>/, '').replace(/<svg([^>]*?) width="[^"]*"/, '<svg$1 width="380"').replace(/<svg([^>]*?) height="[^"]*"/, '<svg$1 height="184"')
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs><radialGradient id="g" cx=".75" cy=".2" r="1"><stop offset="0" stop-color="#3a2216"/><stop offset=".55" stop-color="#161618"/></radialGradient></defs>
  <rect x="16" y="16" width="480" height="480" rx="112" fill="url(#g)"/>
  <g transform="translate(66 164)">${LOGO}</g>
</svg>`

function ico(pngs) {
  // ICO kapsayıcısı: PNG verilerini doğrudan gömer (Windows Vista+ destekler)
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(pngs.length, 4)
  const dir = Buffer.alloc(16 * pngs.length)
  let offset = 6 + dir.length
  pngs.forEach(({ size, data }, i) => {
    const o = i * 16
    dir.writeUInt8(size >= 256 ? 0 : size, o)
    dir.writeUInt8(size >= 256 ? 0 : size, o + 1)
    dir.writeUInt8(0, o + 2)
    dir.writeUInt8(0, o + 3)
    dir.writeUInt16LE(1, o + 4)
    dir.writeUInt16LE(32, o + 6)
    dir.writeUInt32LE(data.length, o + 8)
    dir.writeUInt32LE(offset, o + 12)
    offset += data.length
  })
  return Buffer.concat([header, dir, ...pngs.map((p) => p.data)])
}

app.whenReady().then(async () => {
  const root = path.join(__dirname, '..')
  setTimeout(() => { console.error('Zaman aşımı: simge üretilemedi'); app.exit(1) }, 20000)
  const win = new BrowserWindow({ show: false, width: 512, height: 512, frame: false, transparent: true, backgroundColor: '#00000000', webPreferences: { paintWhenInitiallyHidden: true } })
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<html><body style="margin:0;overflow:hidden;background:transparent">${SVG}</body></html>`))
  await new Promise((r) => setTimeout(r, 300))
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 })
  const sizes = [16, 24, 32, 48, 64, 128, 256]
  const pngs = sizes.map((s) => ({ size: s, data: img.resize({ width: s, height: s, quality: 'best' }).toPNG() }))
  fs.mkdirSync(path.join(root, 'build'), { recursive: true })
  fs.mkdirSync(path.join(root, 'resources'), { recursive: true })
  fs.writeFileSync(path.join(root, 'build', 'icon.png'), img.resize({ width: 1024, height: 1024, quality: 'best' }).toPNG())
  fs.writeFileSync(path.join(root, 'resources', 'icon.png'), img.resize({ width: 512, height: 512, quality: 'best' }).toPNG())
  fs.writeFileSync(path.join(root, 'build', 'icon.ico'), ico(pngs))
  fs.writeFileSync(path.join(root, 'build', 'icon.svg'), SVG)
  console.log('Simgeler üretildi: build/icon.ico, build/icon.png, resources/icon.png')
  app.quit()
})
