// Gmail web arayüzü üzerinden e-posta taslağı oluşturma ve kontrollü gönderim (tarayıcıdaki mevcut oturumla).
// Şifre istenmez/saklanmaz. Oturum kapalıysa giriş sayfası açılır ve kullanıcının giriş yapması beklenir;
// iki adımlı doğrulama ve güvenlik kontrolleri kullanıcıya bırakılır.
// Gönderim yalnızca Gmail'in "İleti gönderildi" bildirimi görülürse "gönderildi" sayılır.

import type { Page } from 'playwright-core'
import type { AgentBrowser } from './agent-browser'

const SEL = {
  inbox: 'div[role="main"], div[gh="tl"]',
  composeBtn: 'div[gh="cm"], div[role="button"]:has-text("Oluştur"), div[role="button"]:has-text("Compose")',
  dialog: 'div[role="dialog"]:has(input[name="subjectbox"])',
  to: 'input[aria-label*="Alıcı"], input[aria-label*="To"], input[peoplekit-id], div[name="to"] input, textarea[name="to"]',
  subject: 'input[name="subjectbox"]',
  body: 'div[contenteditable="true"][role="textbox"], div[aria-label*="İleti Gövdesi"], div[aria-label*="Message Body"]',
  send: 'div[role="button"][data-tooltip^="Gönder"], div[role="button"][aria-label^="Gönder"], div[role="button"][data-tooltip^="Send"], div[role="button"][aria-label^="Send"]',
  file: 'input[type="file"][name="Filedata"]',
  sentToast: 'span#link_vsm, span:has-text("İleti gönderildi"), span:has-text("Message sent")',
  close: 'img[aria-label="Kaydet ve kapat"], img[aria-label="Save & close"], img[alt="Kapat"], img[alt="Close"]'
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const norm = (s: string) => s.replace(/\s+/g, ' ').trim()

export type GmailPrepareResult =
  | { ok: true; account: string | null; recipientVerified: boolean }
  | { ok: false; code: 'not_logged_in' | 'ui_changed' | 'recipient_mismatch'; reason: string }

export class GmailWeb {
  constructor(private agent: AgentBrowser) {}

  private async open(page: Page) {
    if (!/mail\.google\.com\/mail/.test(page.url())) await page.goto('https://mail.google.com/mail/u/0/#inbox', { waitUntil: 'domcontentloaded', timeout: 45000 })
  }

  async isLoggedIn(page: Page): Promise<boolean> {
    return /mail\.google\.com\/mail/.test(page.url()) && (await page.locator(SEL.inbox).count()) > 0
  }

  accountFromTitle(title: string): string | null {
    return title.match(/([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i)?.[1]?.toLowerCase() ?? null
  }

  async status(): Promise<{ loggedIn: boolean; account: string | null }> {
    return this.agent.run(async () => {
      const page = await this.agent.page('gmail')
      await this.open(page)
      for (let i = 0; i < 20 && !(await this.isLoggedIn(page)) && /mail\.google\.com/.test(page.url()); i++) await sleep(1000)
      const ok = await this.isLoggedIn(page)
      return { loggedIn: ok, account: ok ? this.accountFromTitle(await page.title()) : null }
    })
  }

  async ensureLoggedIn(company?: string | null) {
    return this.agent.run(async () => {
      const page = await this.agent.page('gmail')
      this.agent.touch(page)
      await this.open(page)
      await sleep(2500)
      if (await this.isLoggedIn(page)) return true
      if (!/accounts\.google/.test(page.url())) await page.goto('https://accounts.google.com/ServiceLogin?service=mail&continue=https://mail.google.com/mail/', { waitUntil: 'domcontentloaded' })
      await this.agent.waitForUser(page, 'Gmail oturumu kapalı. Lütfen açılan tarayıcıda Google hesabınıza kendiniz giriş yapın (şifreniz uygulamaya girilmez).', async () => this.isLoggedIn(page), 10 * 60 * 1000, company)
      return true
    })
  }

  /** Yeni e-posta penceresini açar, alıcı/konu/gövdeyi doldurur, isteğe bağlı ek ekler; GÖNDERMEZ. */
  async prepare(m: { to: string; subject: string; body: string; attachment?: string | string[] | null }, company?: string | null): Promise<GmailPrepareResult> {
    return this.agent.run(async () => {
      const page = await this.agent.page('gmail')
      this.agent.touch(page)
      await page.bringToFront().catch(() => undefined)
      this.agent.report({ state: 'busy', step: 'Gmail açılıyor', company })
      await page.goto('https://mail.google.com/mail/u/0/#inbox', { waitUntil: 'domcontentloaded', timeout: 45000 })
      for (let i = 0; i < 20 && !(await this.isLoggedIn(page)); i++) await sleep(1000)
      if (!(await this.isLoggedIn(page))) return { ok: false, code: 'not_logged_in', reason: 'Gmail oturumu kapalı.' }
      const account = this.accountFromTitle(await page.title())
      this.agent.report({ state: 'busy', step: 'Yeni e-posta oluşturuluyor', company })
      const cbtn = page.locator(SEL.composeBtn).first()
      if (!(await cbtn.count())) return { ok: false, code: 'ui_changed', reason: 'Gmail arayüzü tanınmadı ("Oluştur" düğmesi bulunamadı).' }
      await cbtn.click()
      const dialog = page.locator(SEL.dialog).last()
      await dialog.waitFor({ timeout: 15000 }).catch(() => undefined)
      if (!(await dialog.count())) return { ok: false, code: 'ui_changed', reason: 'Gmail yeni ileti penceresi açılmadı.' }
      const to = dialog.locator(SEL.to).first()
      await to.click()
      await to.fill(m.to)
      await to.press('Tab')
      await dialog.locator(SEL.subject).fill(m.subject)
      const body = dialog.locator(SEL.body).first()
      await body.click()
      for (const [i, line] of m.body.split('\n').entries()) {
        if (i) await page.keyboard.press('Enter')
        if (line) await page.keyboard.insertText(line)
      }
      if (m.attachment && (!Array.isArray(m.attachment) || m.attachment.length)) {
        this.agent.report({ state: 'busy', step: 'Ekler ekleniyor', company })
        await page.locator(SEL.file).last().setInputFiles(Array.isArray(m.attachment) ? m.attachment : [m.attachment]).catch(() => undefined)
        for (let i = 0; i < 60; i++) {
          if (!(await dialog.locator('[role="progressbar"]').count())) break
          await sleep(500)
        }
      }
      await sleep(600)
      const dialogText = norm(await dialog.innerText().catch(() => ''))
      const chipOk = (await dialog.locator(`[email="${m.to}"], [data-hovercard-id="${m.to}"]`).count()) > 0 || dialogText.toLowerCase().includes(m.to.toLowerCase())
      if (!chipOk) return { ok: false, code: 'recipient_mismatch', reason: `Alıcı alanı doğrulanamadı (${m.to}).` }
      this.agent.report({ state: 'busy', step: 'E-posta hazır, onay bekleniyor', company, detail: m.to })
      return { ok: true, account, recipientVerified: true }
    })
  }

  /** Hazırlanan e-postayı taslak olarak bırakır (pencereyi kaydedip kapatır). */
  async saveDraft(company?: string | null) {
    return this.agent.run(async () => {
      const page = await this.agent.page('gmail')
      const close = page.locator(SEL.close).last()
      if (await close.count()) await close.click()
      else await page.keyboard.press('Escape')
      await sleep(1500)
      this.agent.report({ state: 'ready', step: 'Gmail taslağı kaydedildi', company })
    })
  }

  /** Hazırlanan e-postayı gönderir; Gmail "İleti gönderildi" bildirimi görülürse başarılı sayar. */
  async send(company?: string | null): Promise<{ status: 'sent' | 'unverified'; detail: string }> {
    return this.agent.run(async () => {
      const page = await this.agent.page('gmail')
      this.agent.touch(page)
      const dialog = page.locator(SEL.dialog).last()
      if (!(await dialog.count())) throw new Error('Gönderilecek e-posta penceresi bulunamadı.')
      const btn = dialog.locator(SEL.send).first()
      if (await btn.count()) await btn.click()
      else await dialog.locator(SEL.body).first().press('Control+Enter')
      this.agent.report({ state: 'busy', step: 'E-posta gönderiliyor', company })
      for (let i = 0; i < 30; i++) {
        if (await page.locator(SEL.sentToast).count()) return { status: 'sent' as const, detail: 'Gmail: İleti gönderildi' }
        await sleep(500)
      }
      return { status: 'unverified' as const, detail: 'Gmail "İleti gönderildi" bildirimi görülmedi. Gönderilenler klasörünü kontrol edin; tekrar gönderilmeyecek.' }
    })
  }
}
