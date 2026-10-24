// Ajan tarayıcısı: kullanıcının bilgisayarındaki Google Chrome (veya Microsoft Edge) uygulaması, uygulamaya
// özel AYRI bir profil klasörüyle, görünür pencerede açılır ve Chrome'un kendi geliştirici protokolü (CDP)
// üzerinden yönetilir.
//
// Neden ayrı profil? Chrome 136'dan itibaren varsayılan profile uzaktan hata ayıklama bağlantısı kabul
// edilmiyor; ayrıca kullanıcının asıl profilini (şifreler, kartlar) otomasyona açmak gereksiz risk olur.
// Kullanıcı Google / Gmail / WhatsApp Web'e bu profilde BİR KEZ kendisi giriş yapar; oturum profil klasöründe
// kalır. Uygulama şifre istemez ve saklamaz. CAPTCHA, iki adımlı doğrulama veya güvenlik ekranı çıkarsa
// işlem durur ve kullanıcının tarayıcıda tamamlaması beklenir; bu kontroller asla atlatılmaya çalışılmaz.
//
// Geliştirici protokolü yalnızca 127.0.0.1 üzerinde, rastgele bir portta açılır ve uygulama kapanırken
// tarayıcı kapatılır.

import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'
import type { Browser, BrowserContext, Page } from 'playwright-core'

export type BrowserKind = 'chrome' | 'edge'
export type PageRole = 'google' | 'whatsapp' | 'gmail' | 'site'

export interface AgentEvent {
  state: 'idle' | 'starting' | 'ready' | 'busy' | 'needs_user' | 'closed' | 'error'
  step?: string
  company?: string | null
  detail?: string
  at: string
}

export class NeedsUserError extends Error {}
export class AgentStoppedError extends Error {}

function candidates(kind: BrowserKind): string[] {
  const pf = process.env.ProgramFiles ?? 'C:\\Program Files'
  const pf86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)'
  const local = process.env.LOCALAPPDATA ?? ''
  if (process.platform === 'darwin') {
    return kind === 'chrome' ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'] : ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge']
  }
  if (process.platform === 'win32') {
    return kind === 'chrome'
      ? [join(pf, 'Google\\Chrome\\Application\\chrome.exe'), join(pf86, 'Google\\Chrome\\Application\\chrome.exe'), join(local, 'Google\\Chrome\\Application\\chrome.exe')]
      : [join(pf86, 'Microsoft\\Edge\\Application\\msedge.exe'), join(pf, 'Microsoft\\Edge\\Application\\msedge.exe')]
  }
  return kind === 'chrome' ? ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable'] : ['/usr/bin/microsoft-edge']
}

export function detectBrowsers(): { kind: BrowserKind; label: string; path: string }[] {
  const out: { kind: BrowserKind; label: string; path: string }[] = []
  for (const kind of ['chrome', 'edge'] as BrowserKind[]) {
    const p = candidates(kind).find((x) => existsSync(x))
    if (p) out.push({ kind, label: kind === 'chrome' ? 'Google Chrome' : 'Microsoft Edge', path: p })
  }
  return out
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer()
    s.once('error', reject)
    s.listen(0, '127.0.0.1', () => {
      const a = s.address()
      const port = typeof a === 'object' && a ? a.port : 0
      s.close(() => resolve(port))
    })
  })
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export class AgentBrowser {
  private proc: ChildProcess | null = null
  private browser: Browser | null = null
  private ctx: BrowserContext | null = null
  private pages = new Map<PageRole, Page>()
  private lock: Promise<void> = Promise.resolve()
  private userWait: { resolve: (ok: boolean) => void } | null = null
  private last: AgentEvent = { state: 'idle', at: new Date().toISOString() }
  kind: BrowserKind | null = null

  constructor(
    private profileRoot: string,
    private emit: (ev: AgentEvent) => void,
    private log: (msg: string) => void
  ) {}

  status(): AgentEvent & { running: boolean; kind: BrowserKind | null; profileDir: string | null } {
    return { ...this.last, running: this.isRunning(), kind: this.kind, profileDir: this.kind ? this.profileDir(this.kind) : null }
  }

  report(ev: Omit<AgentEvent, 'at'>) {
    this.last = { ...ev, at: new Date().toISOString() }
    this.emit(this.last)
    if (ev.step) this.log(`[tarayıcı] ${ev.step}${ev.company ? ` — ${ev.company}` : ''}${ev.detail ? ` (${ev.detail})` : ''}`)
  }

  profileDir(kind: BrowserKind) {
    return join(this.profileRoot, `otomasyon-profili-${kind}`)
  }

  isRunning() {
    return !!this.browser?.isConnected()
  }

  async start(kind: BrowserKind): Promise<void> {
    if (this.isRunning() && this.kind === kind) return
    if (this.isRunning()) await this.close()
    const exe = candidates(kind).find((x) => existsSync(x))
    if (!exe) throw new Error(`${kind === 'chrome' ? 'Google Chrome' : 'Microsoft Edge'} bu bilgisayarda bulunamadı.`)
    const dir = this.profileDir(kind)
    mkdirSync(dir, { recursive: true })
    this.report({ state: 'starting', step: `${kind === 'chrome' ? 'Chrome' : 'Edge'} açılıyor` })
    const port = await freePort()
    this.proc = spawn(exe, [`--user-data-dir=${dir}`, `--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1', '--no-first-run', '--no-default-browser-check', '--disable-features=Translate', 'about:blank'], { stdio: 'ignore', detached: false })
    this.proc.once('exit', () => {
      this.browser = null
      this.ctx = null
      this.pages.clear()
      this.report({ state: 'closed', step: 'Tarayıcı kapatıldı' })
    })
    const { chromium } = await import('playwright-core')
    let lastErr: unknown
    for (let i = 0; i < 60; i++) {
      try {
        this.browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 2000 })
        break
      } catch (e) {
        lastErr = e
        if (this.proc.exitCode != null) break
        await sleep(250)
      }
    }
    if (!this.browser) {
      this.proc.kill()
      // Aynı profil başka bir pencerede açıksa Chrome yeni süreci eskisine devreder ve port açılmaz
      throw new Error(`Tarayıcıya bağlanılamadı. Otomasyon profili zaten açık bir pencerede kullanılıyor olabilir; o pencereyi kapatıp tekrar deneyin. (${(lastErr as Error)?.message?.split('\n')[0] ?? ''})`)
    }
    this.kind = kind
    this.ctx = this.browser.contexts()[0] ?? (await this.browser.newContext())
    this.browser.on('disconnected', () => {
      this.browser = null
      this.pages.clear()
    })
    this.report({ state: 'ready', step: 'Tarayıcı hazır' })
  }

  async close() {
    try {
      await this.browser?.close()
    } catch {
      /* zaten kapalı */
    }
    this.proc?.kill()
    this.browser = null
    this.ctx = null
    this.pages.clear()
    this.proc = null
  }

  /** Görev başına ayrılmış sekmeyi döndürür; kullanıcı kapattıysa yenisini açar. */
  async page(role: PageRole): Promise<Page> {
    if (!this.ctx || !this.isRunning()) throw new AgentStoppedError('Otomasyon tarayıcısı açık değil. Canlı Kontrol Merkezi’nden başlatın.')
    const p = this.pages.get(role)
    if (p && !p.isClosed()) return p
    const blank = this.ctx.pages().find((x) => x.url() === 'about:blank' && ![...this.pages.values()].includes(x))
    const np = blank ?? (await this.ctx.newPage())
    this.pages.set(role, np)
    return np
  }

  /** Tarayıcı işlemlerini sıraya koyar: aynı anda tek işlem (kullanıcı neyin yapıldığını her an görür). */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    const prev = this.lock
    let release!: () => void
    this.lock = new Promise((r) => (release = r))
    await prev
    try {
      return await fn()
    } finally {
      release()
    }
  }

  /**
   * Kullanıcı müdahalesi bekler (giriş, CAPTCHA, doğrulama). `check` true dönene kadar 2 sn'de bir kontrol edilir;
   * kullanıcı arayüzden "Tamamladım" veya "Vazgeç" diyebilir. Hiçbir doğrulama otomatik geçilmez.
   */
  async waitForUser(page: Page, reason: string, check: () => Promise<boolean>, timeoutMs = 10 * 60 * 1000, company?: string | null): Promise<void> {
    await page.bringToFront().catch(() => undefined)
    this.report({ state: 'needs_user', step: reason, company })
    const end = Date.now() + timeoutMs
    let cancelled = false
    const manual = new Promise<boolean>((resolve) => (this.userWait = { resolve }))
    manual.then((ok) => (cancelled = !ok))
    try {
      while (Date.now() < end) {
        if (cancelled) throw new NeedsUserError(`Kullanıcı işlemi iptal etti: ${reason}`)
        if (await check().catch(() => false)) {
          this.report({ state: 'busy', step: 'Kullanıcı doğrulaması tamamlandı, devam ediliyor', company })
          return
        }
        const r = await Promise.race([manual.then(() => 'manual'), sleep(2000).then(() => 'tick')])
        if (r === 'manual' && !cancelled) {
          if (await check().catch(() => false)) return
          // "Tamamladım" dendi ama sayfa hâlâ doğrulama istiyor: beklemeye devam
          this.report({ state: 'needs_user', step: `${reason} — sayfa hâlâ doğrulama bekliyor`, company })
          await sleep(1500)
        }
      }
      throw new NeedsUserError(`Zaman aşımı: ${reason}`)
    } finally {
      this.userWait = null
    }
  }

  answerUser(ok: boolean) {
    this.userWait?.resolve(ok)
  }

  /** Canlı önizleme: etkin sekmenin küçük ekran görüntüsü (JPEG veri URI). */
  async preview(): Promise<string | null> {
    if (!this.ctx || !this.isRunning()) return null
    const pages = this.ctx.pages().filter((p) => !p.isClosed())
    const target = this.lastActive && !this.lastActive.isClosed() ? this.lastActive : pages[pages.length - 1]
    if (!target) return null
    try {
      // Doğrudan CDP ile alınır: sayfaya stil eklemez, odak/kaydırma değiştirmez (kullanıcının tıklamalarını bölmez)
      const cdp = await target.context().newCDPSession(target)
      try {
        const r = (await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 50, optimizeForSpeed: true })) as { data: string }
        return `data:image/jpeg;base64,${r.data}`
      } finally {
        await cdp.detach().catch(() => undefined)
      }
    } catch {
      return null
    }
  }

  lastActive: Page | null = null
  touch(p: Page) {
    this.lastActive = p
  }
}
