// HTML → PDF (Electron printToPDF). Gizli, ağ erişimi kapalı bir pencerede render edilir.

import { BrowserWindow, nativeImage, app } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { join, extname } from 'node:path'
import { tmpdir } from 'node:os'
import type { BrandForPdf } from './templates'

export function resourcesDir() {
  return app.isPackaged ? process.resourcesPath : join(__dirname, '../../resources')
}

let fontCssCache: string | null = null
export function fontCss(): string {
  if (fontCssCache) return fontCssCache
  const dir = join(resourcesDir(), 'fonts')
  const face = (family: string, weight: number, file: string, range: string) => {
    const p = join(dir, file)
    if (!existsSync(p)) return ''
    return `@font-face{font-family:'${family}';font-weight:${weight};font-style:normal;src:url(data:font/woff2;base64,${readFileSync(p).toString('base64')}) format('woff2');unicode-range:${range};}`
  }
  const LATIN = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'
  const EXT = 'U+0100-02AF,U+0304,U+0308,U+0329,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF'
  fontCssCache = [
    face('Outfit', 600, 'outfit-latin-600-normal.woff2', LATIN), face('Outfit', 600, 'outfit-latin-ext-600-normal.woff2', EXT),
    face('Outfit', 700, 'outfit-latin-700-normal.woff2', LATIN), face('Outfit', 700, 'outfit-latin-ext-700-normal.woff2', EXT),
    face('Inter Tight', 400, 'inter-tight-latin-400-normal.woff2', LATIN), face('Inter Tight', 400, 'inter-tight-latin-ext-400-normal.woff2', EXT),
    face('Inter Tight', 600, 'inter-tight-latin-600-normal.woff2', LATIN), face('Inter Tight', 600, 'inter-tight-latin-ext-600-normal.woff2', EXT)
  ].join('\n')
  return fontCssCache
}

/** Görseli PDF'e gömmek için küçültür ve JPEG veri URI'sine çevirir. */
export function imageDataUri(path: string, maxWidth = 1100): string | null {
  try {
    if (!existsSync(path)) return null
    const ext = extname(path).toLowerCase()
    if (ext === '.svg') return `data:image/svg+xml;base64,${readFileSync(path).toString('base64')}`
    let img = nativeImage.createFromPath(path)
    if (img.isEmpty()) return null
    const { width } = img.getSize()
    if (width > maxWidth) img = img.resize({ width: maxWidth, quality: 'good' })
    return `data:image/jpeg;base64,${img.toJPEG(82).toString('base64')}`
  } catch {
    return null
  }
}

export function brandLogoUri(logoPath: string): string | null {
  const custom = logoPath && existsSync(logoPath) ? logoPath : null
  const p = custom ?? join(resourcesDir(), 'brand', 'uca-medya-logo-dark.svg')
  if (!existsSync(p)) return null
  if (extname(p).toLowerCase() === '.svg') return `data:image/svg+xml;base64,${readFileSync(p).toString('base64')}`
  return `data:image/png;base64,${nativeImage.createFromPath(p).toPNG().toString('base64')}`
}

export function brandForPdf(brand: { name: string; website: string; email: string; phone: string; address: string; logoPath: string }): BrandForPdf {
  return { ...brand, logoDataUri: brandLogoUri(brand.logoPath), fontCss: fontCss() }
}

export async function htmlToPdf(html: string, outPath: string): Promise<void> {
  const tmp = mkdtempSync(join(tmpdir(), 'ucapdf-'))
  const htmlPath = join(tmp, 'report.html')
  writeFileSync(htmlPath, html, 'utf8')
  const win = new BrowserWindow({ show: false, width: 1240, height: 1754, webPreferences: { sandbox: true, javascript: false, offscreen: false, partition: 'pdf-render' } })
  // Rapor penceresi hiçbir dış adrese istek atamaz
  win.webContents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_d, cb) => cb({ cancel: true }))
  try {
    await win.loadFile(htmlPath)
    await new Promise((r) => setTimeout(r, 250))
    const pdf = await win.webContents.printToPDF({ pageSize: 'A4', printBackground: true, margins: { top: 0, bottom: 0, left: 0, right: 0 }, preferCSSPageSize: true })
    writeFileSync(outPath, pdf)
  } finally {
    win.destroy()
    rmSync(tmp, { recursive: true, force: true })
  }
}
