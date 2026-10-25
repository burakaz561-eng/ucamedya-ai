// WordPress eklentisini (wordpress/ucamedya-baglanti) kurulabilir zip'e paketler:
// resources/wordpress/ucamedya-baglanti.zip (uygulama içinden "Eklentiyi indir" ile verilir).
import { readdirSync, readFileSync, statSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'wordpress', 'ucamedya-baglanti')
const out = join(root, 'resources', 'wordpress', 'ucamedya-baglanti.zip')

const zip = new JSZip()
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p)
    else zip.file(`ucamedya-baglanti/${relative(src, p).split('\\').join('/')}`, readFileSync(p), { date: new Date('2026-01-01T00:00:00Z') })
  }
}
walk(src)
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } }))
console.log(`WordPress eklentisi paketlendi: ${relative(root, out)} (${Object.keys(zip.files).filter((f) => !zip.files[f].dir).length} dosya)`)
