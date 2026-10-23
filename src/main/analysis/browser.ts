// Sistemde yüklü Microsoft Edge / Google Chrome'u başsız (headless) modda kullanır; ek tarayıcı
// indirilmez. Windows'ta Edge her zaman yüklüdür; macOS'ta Chrome veya Edge gerekir.

import type { Browser } from 'playwright-core'
import { existsSync } from 'node:fs'

let browserPromise: Promise<Browser> | null = null
let users = 0
let closeTimer: NodeJS.Timeout | null = null

const MAC_PATHS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Chromium.app/Contents/MacOS/Chromium'
]

async function launch(): Promise<Browser> {
  const { chromium } = await import('playwright-core')
  const errors: string[] = []
  for (const channel of ['msedge', 'chrome'] as const) {
    try {
      return await chromium.launch({ channel, headless: true, args: ['--disable-dev-shm-usage', '--hide-scrollbars'] })
    } catch (e) {
      errors.push(`${channel}: ${(e as Error).message.split('\n')[0]}`)
    }
  }
  if (process.platform === 'darwin') {
    for (const p of MAC_PATHS) if (existsSync(p)) return chromium.launch({ executablePath: p, headless: true })
  }
  throw new Error(`Tarayıcı başlatılamadı. Microsoft Edge veya Google Chrome yüklü olmalı. (${errors.join(' | ')})`)
}

export async function acquireBrowser(): Promise<Browser> {
  users++
  if (closeTimer) {
    clearTimeout(closeTimer)
    closeTimer = null
  }
  if (!browserPromise) {
    browserPromise = launch()
    browserPromise.catch(() => {
      browserPromise = null
    })
  }
  try {
    const b = await browserPromise
    if (!b.isConnected()) {
      browserPromise = launch()
      return await browserPromise
    }
    return b
  } catch (e) {
    users--
    throw e
  }
}

export function releaseBrowser() {
  users = Math.max(0, users - 1)
  if (users === 0) {
    if (closeTimer) clearTimeout(closeTimer)
    closeTimer = setTimeout(() => void closeBrowser(), 60000)
  }
}

export async function closeBrowser() {
  const b = await browserPromise?.catch(() => null)
  browserPromise = null
  await b?.close().catch(() => undefined)
}

export async function browserCheck(): Promise<{ ok: boolean; message: string }> {
  try {
    const b = await acquireBrowser()
    const v = b.version()
    releaseBrowser()
    return { ok: true, message: `Tarayıcı hazır (${v}).` }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}
