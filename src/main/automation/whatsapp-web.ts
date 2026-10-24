// WhatsApp Web üzerinden sohbet açma ve mesaj gönderme (kullanıcının ajan tarayıcısındaki oturumu ile).
//
// Güvenlik ve doğruluk ilkeleri:
//  - Sohbet, WhatsApp'ın resmî "tıkla-sohbet" adresiyle açılır (web.whatsapp.com/send?phone=…&text=…).
//  - Göndermeden önce: sohbet başlığındaki numara alıcıyla karşılaştırılır; yazma alanındaki metnin taslakla
//    aynı olduğu doğrulanır. Uyuşmazlıkta GÖNDERİLMEZ ve kuyruk duraklatılır.
//  - Gönderim ancak gönderilen mesaj balonu ve "iletildi" işareti (tik) görülürse "gönderildi" sayılır.
//  - Robot algısını gizleme, rastgele bekleme, kısıtlama atlatma gibi hiçbir mekanizma yoktur.
//  - WhatsApp'ın arayüzü değişirse işlem "arayüz tanınmadı" hatasıyla durur.
//
// Not: Resmî olmayan otomasyon WhatsApp kullanım koşullarına aykırı sayılabilir ve hesabın kısıtlanmasına yol
// açabilir. Varsayılan mod her mesaj için kullanıcı onayıdır.

import type { Page } from 'playwright-core'
import type { AgentBrowser } from './agent-browser'

const SEL = {
  loggedIn: '#pane-side, [aria-label="Sohbet listesi"], [aria-label="Chat list"], div[data-testid="chat-list"]',
  qr: 'canvas[aria-label], div[data-ref] canvas, [data-testid="qrcode"], canvas',
  compose: 'footer div[contenteditable="true"], div[contenteditable="true"][data-tab="10"], [aria-label="Bir mesaj yazın"], [aria-label="Type a message"]',
  header: '#main header',
  sendBtn: 'button[aria-label="Gönder"], button[aria-label="Send"], [data-icon="send"], [data-icon="wds-ic-send-filled"]',
  invalid: 'div[role="dialog"], [data-animate-modal-popup="true"]',
  outMsgs: 'div.message-out, [data-testid="msg-container"] .message-out'
}

export type WaPrepareResult =
  | { ok: true; headerText: string; recipientVerified: boolean; reason?: string }
  | { ok: false; code: 'not_logged_in' | 'invalid_number' | 'ui_changed' | 'text_mismatch'; reason: string }

const digits = (s: string) => s.replace(/\D/g, '')
const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Sohbet başlığının alıcı numarasına ait olup olmadığı (saf fonksiyon, birim testli). */
export function headerMatchesPhone(header: string, phoneKey: string): boolean {
  const h = digits(header)
  if (h.length < 10) return false
  return h.endsWith(phoneKey.slice(-10)) || phoneKey.endsWith(h.slice(-10))
}

export class WhatsAppWeb {
  constructor(private agent: AgentBrowser) {}

  async status(page?: Page): Promise<'logged_in' | 'qr' | 'loading' | 'unknown'> {
    const p = page ?? (await this.agent.page('whatsapp'))
    if (!/web\.whatsapp\.com/.test(p.url())) {
      await p.goto('https://web.whatsapp.com/', { waitUntil: 'domcontentloaded', timeout: 45000 })
    }
    for (let i = 0; i < 40; i++) {
      if (await p.locator(SEL.loggedIn).count()) return 'logged_in'
      if ((await p.locator(SEL.qr).count()) && /tarayın|scan|QR|bağlayın|link/i.test(await p.locator('body').innerText().catch(() => ''))) return 'qr'
      await sleep(1000)
    }
    return 'loading'
  }

  /** Oturum açık değilse kullanıcının QR ile giriş yapmasını bekler. */
  async ensureLoggedIn(company?: string | null) {
    return this.agent.run(async () => {
      const page = await this.agent.page('whatsapp')
      this.agent.touch(page)
      const st = await this.status(page)
      if (st === 'logged_in') return true
      await this.agent.waitForUser(page, 'WhatsApp Web oturumu kapalı. Telefonunuzdaki WhatsApp ile QR kodu taratın (Bağlı cihazlar → Cihaz bağla).', async () => (await page.locator(SEL.loggedIn).count()) > 0, 5 * 60 * 1000, company)
      return true
    })
  }

  /** Sohbeti açar ve mesajı yazma alanına yerleştirir; GÖNDERMEZ. */
  async prepare(phoneKey: string, text: string, company?: string | null): Promise<WaPrepareResult> {
    return this.agent.run(async () => {
      const page = await this.agent.page('whatsapp')
      this.agent.touch(page)
      await page.bringToFront().catch(() => undefined)
      this.agent.report({ state: 'busy', step: 'WhatsApp sohbeti açılıyor', company, detail: `+${phoneKey}` })
      await page.goto(`https://web.whatsapp.com/send?phone=${encodeURIComponent(phoneKey)}&text=${encodeURIComponent(text)}`, { waitUntil: 'domcontentloaded', timeout: 45000 })
      const end = Date.now() + 45000
      while (Date.now() < end) {
        if (await page.locator(SEL.compose).count()) break
        const body = await page.locator('body').innerText().catch(() => '')
        if (/geçersiz|invalid|kullanmıyor|isn.t on WhatsApp|not on WhatsApp/i.test(body) && (await page.locator(SEL.invalid).count())) {
          return { ok: false, code: 'invalid_number', reason: 'Bu numara WhatsApp kullanmıyor veya geçersiz (WhatsApp bildirdi).' }
        }
        if ((await page.locator(SEL.qr).count()) && /tarayın|scan/i.test(body)) return { ok: false, code: 'not_logged_in', reason: 'WhatsApp Web oturumu kapalı.' }
        await sleep(800)
      }
      const compose = page.locator(SEL.compose).last()
      if (!(await compose.count())) return { ok: false, code: 'ui_changed', reason: 'WhatsApp arayüzü tanınmadı (mesaj yazma alanı bulunamadı). Arayüz değişmiş olabilir.' }
      await sleep(800)
      const typed = norm(await compose.innerText().catch(() => ''))
      if (!typed) {
        // Adres metni doldurmadıysa elle yazılır
        await compose.click()
        for (const [i, line] of text.split('\n').entries()) {
          if (i) await page.keyboard.press('Shift+Enter')
          if (line) await page.keyboard.insertText(line)
        }
        await sleep(400)
      }
      const finalText = norm(await compose.innerText().catch(() => ''))
      if (finalText !== norm(text)) return { ok: false, code: 'text_mismatch', reason: 'Yazma alanındaki metin taslakla birebir aynı değil; gönderilmedi.' }
      const headerText = norm(await page.locator(SEL.header).first().innerText().catch(() => ''))
      const verified = headerMatchesPhone(headerText, phoneKey)
      this.agent.report({ state: 'busy', step: 'Mesaj yazıldı, onay bekleniyor', company, detail: verified ? 'alıcı numarası doğrulandı' : `sohbet başlığı: ${headerText.slice(0, 40)}` })
      return { ok: true, headerText: headerText.slice(0, 120), recipientVerified: verified, reason: verified ? undefined : 'Sohbet başlığında numara yerine kişi adı görünüyor (numara rehberinizde kayıtlı olabilir); alıcıyı gözle doğrulayın.' }
    })
  }

  /** Yazma alanını temizler (test sırasında yazılan metin sohbette taslak olarak kalmasın). */
  async clearCompose() {
    return this.agent.run(async () => {
      const page = await this.agent.page('whatsapp')
      const compose = page.locator(SEL.compose).last()
      if (!(await compose.count())) return
      await compose.click()
      await page.keyboard.press('Control+A')
      await page.keyboard.press('Meta+A').catch(() => undefined)
      await page.keyboard.press('Delete')
    })
  }

  /** prepare() ile hazırlanan mesajı gönderir ve gönderildiğini doğrular. */
  async send(text: string, company?: string | null): Promise<{ status: 'sent' | 'unverified'; detail: string }> {
    return this.agent.run(async () => {
      const page = await this.agent.page('whatsapp')
      this.agent.touch(page)
      const compose = page.locator(SEL.compose).last()
      const current = norm(await compose.innerText().catch(() => ''))
      if (current !== norm(text)) throw new Error('Gönderim iptal edildi: yazma alanındaki metin değişmiş.')
      const before = await page.locator(SEL.outMsgs).count()
      const btn = page.locator(SEL.sendBtn).last()
      if (await btn.count()) await btn.click()
      else await compose.press('Enter')
      this.agent.report({ state: 'busy', step: 'WhatsApp mesajı gönderiliyor', company })
      const head = norm(text).slice(0, 30)
      const end = Date.now() + 30000
      while (Date.now() < end) {
        // Sayfa içi betik metin olarak verilir (paketleyici yardımcıları sayfa bağlamında yoktur)
        const res = (await page.evaluate(
          `(() => { const all = [...document.querySelectorAll(${JSON.stringify(SEL.outMsgs)})]; if (all.length <= ${before}) return null;
            const last = all[all.length - 1]; const txt = (last.innerText || '').replace(/\\s+/g, ' ');
            const ic = last.querySelector('[data-icon]'); return { match: txt.includes(${JSON.stringify(head)}), icon: ic ? ic.getAttribute('data-icon') : '' } })()`
        )) as { match: boolean; icon: string } | null
        if (res?.match && /check|dblcheck|read/.test(res.icon)) return { status: 'sent' as const, detail: res.icon }
        await sleep(1000)
      }
      return { status: 'unverified' as const, detail: 'Mesaj gönderildi olarak doğrulanamadı (iletildi işareti görülmedi). Tekrar gönderilmeyecek; WhatsApp’ta kontrol edin.' }
    })
  }
}
