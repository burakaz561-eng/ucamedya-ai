// Mesaj görselini sistem panosuna PNG olarak yazar (Electron 44 asenkron pano arayüzü).
import { clipboard, ClipboardItem, nativeImage } from 'electron'

export async function copyImageToClipboard(path: string): Promise<void> {
  const ni = nativeImage.createFromPath(path)
  if (ni.isEmpty()) throw new Error('Görsel okunamadı')
  await clipboard.write([new ClipboardItem({ 'image/png': new Blob([new Uint8Array(ni.toPNG())], { type: 'image/png' }) })])
}
