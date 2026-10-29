// Roundcube Webmail üzerinden e-posta taslağı ve kontrollü gönderim (hosting firmanızın webmail'i, ör.
// ucamedya.com.tr/webmail). Kullanıcı otomasyon tarayıcısında bir kez giriş yapar; şifre uygulamaya girilmez.
// Yeni ileti Roundcube'un resmî compose adresiyle açılır (_to, _subject), gövde düz metin alanına yazılır;
// taslak ve gönderim Roundcube'un kendi komutlarıyla (savedraft / send) yapılır ve sonuçları doğrulanır.
// Roundcube 1.7 (Elastic teması) üzerinde gerçek hesapla incelendi.

import type { Page } from 'playwright-core'
import type { AgentBrowser } from './agent-browser'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export type WebmailPrepareResult =
  | { ok: true; account: string | null; recipientVerified: boolean; attachWarning?: string | null }
  | { ok: false; code: 'not_logged_in' | 'ui_changed' | 'recipient_mismatch' | 'no_url'; reason: string }

export function webmailBase(url: string): string | null {
  try {
    const u = new URL(url.trim())
    if (!/^https?:$/.test(u.protocol)) return null
    return `${u.origin}${u.pathname.replace(/\/?(index\.php)?$/, '/')}`
  } catch {
    return null
  }
}

export class RoundcubeWeb {
  constructor(
    private agent: AgentBrowser,
    private getUrl: () => string
  ) {}

  private base(): string {
    const b = webmailBase(this.getUrl())
    if (!b) throw new Error('Webmail adresi tanımlanmamış (Ayarlar → Mesaj gönderimi → Webmail adresi).')
    return b
  }

  private async state(page: Page): Promise<{ loggedIn: boolean; action: string | null; account: string | null }> {
    return (await page
      .evaluate(
        `(() => { const r = window.rcmail; const login = !!document.querySelector('#rcmloginuser');
          const u = document.querySelector('.header-title.username, .username, #topline .username');
          return { loggedIn: !!r && !login && r.env.task !== 'login', action: r ? (r.env.action || null) : null, account: u ? u.textContent.trim() : null } })()`
      )
      .catch(() => ({ loggedIn: false, action: null, account: null }))) as { loggedIn: boolean; action: string | null; account: string | null }
  }

  async status(): Promise<{ loggedIn: boolean; account: string | null }> {
    return this.agent.run(async () => {
      const page = await this.agent.page('gmail')
      if (!page.url().startsWith(this.base())) await page.goto(`${this.base()}?_task=mail&_mbox=INBOX`, { waitUntil: 'domcontentloaded', timeout: 45000 })
      await sleep(1500)
      const s = await this.state(page)
      return { loggedIn: s.loggedIn, account: s.account }
    })
  }

  async ensureLoggedIn(company?: string | null) {
    return this.agent.run(async () => {
      const page = await this.agent.page('gmail')
      this.agent.touch(page)
      // Zaten webmail'de ve oturum açıksa sayfa yeniden yüklenmez (her mesajda birkaç saniye kazandırır)
      if (page.url().startsWith(this.base()) && (await this.state(page)).loggedIn) return true
      await page.goto(`${this.base()}?_task=mail&_mbox=INBOX`, { waitUntil: 'domcontentloaded', timeout: 45000 })
      for (let i = 0; i < 10 && !(await this.state(page)).loggedIn; i++) await sleep(300)
      if ((await this.state(page)).loggedIn) return true
      await this.agent.waitForUser(page, 'Webmail oturumu kapalı. Lütfen açılan tarayıcıda e-posta adresiniz ve şifrenizle kendiniz giriş yapın (şifre uygulamaya girilmez).', async () => (await this.state(page)).loggedIn, 10 * 60 * 1000, company)
      return true
    })
  }

  /** Yeni ileti açar, alıcı/konu/gövdeyi doldurur, isteğe bağlı ek yükler; GÖNDERMEZ. */
  async prepare(m: { to: string; subject: string; body: string; attachment?: string | string[] | null }, company?: string | null): Promise<WebmailPrepareResult> {
    return this.agent.run(async () => {
      let base: string
      try {
        base = this.base()
      } catch (e) {
        return { ok: false, code: 'no_url', reason: (e as Error).message }
      }
      const page = await this.agent.page('gmail')
      this.agent.touch(page)
      await page.bringToFront().catch(() => undefined)
      this.agent.report({ state: 'busy', step: 'Webmail’de yeni ileti oluşturuluyor', company })
      await page.goto(`${base}?_task=mail&_action=compose&_to=${encodeURIComponent(m.to)}&_subject=${encodeURIComponent(m.subject)}`, { waitUntil: 'domcontentloaded', timeout: 45000 })
      const body = page.locator('#composebody')
      for (let i = 0; i < 20 && !(await body.count()); i++) await sleep(500)
      const st = await this.state(page)
      if (!st.loggedIn) return { ok: false, code: 'not_logged_in', reason: 'Webmail oturumu kapalı.' }
      if (!(await body.count()) || st.action !== 'compose') return { ok: false, code: 'ui_changed', reason: 'Webmail yeni ileti ekranı tanınmadı.' }
      const isHtml = (await page.evaluate(`!!(window.rcmail && rcmail.editor && rcmail.editor.is_html && rcmail.editor.is_html())`).catch(() => false)) as boolean
      if (isHtml) await page.evaluate(`rcmail.command('toggle-editor', { id: 'composebody', html: false })`).catch(() => undefined)
      await body.fill(m.body)
      const subj = page.locator('#compose-subject')
      if ((await subj.inputValue().catch(() => '')) !== m.subject) await subj.fill(m.subject)
      let attachWarning: string | null = null
      if (m.attachment && (!Array.isArray(m.attachment) || m.attachment.length)) {
        this.agent.report({ state: 'busy', step: 'Ekler ekleniyor', company })
        const files = Array.isArray(m.attachment) ? m.attachment : [m.attachment]
        const count = () => page.locator('#attachment-list li').count().catch(() => 0)
        const before = await count()
        await page.locator('#uploadformInput, input[type="file"][name="_attachments[]"]').first().setInputFiles(files).catch(() => undefined)
        for (let i = 0; i < 60; i++) {
          await sleep(500)
          const busy = await page.evaluate(`!!(window.rcmail && rcmail.busy)`).catch(() => false)
          if (!busy && (await count()) >= before + files.length) break
        }
        const added = (await count()) - before
        if (added < files.length) attachWarning = `${files.length} ekten ${Math.max(0, added)} tanesi eklenebildi; webmail penceresinde kontrol edin.`
      }
      const toVal = ((await page.locator('#_to').inputValue().catch(() => '')) || '').toLowerCase()
      const verified = toVal.split(/[,;\s]+/).filter(Boolean).some((x) => x.replace(/^.*</, '').replace(/>$/, '') === m.to.toLowerCase())
      if (!verified) return { ok: false, code: 'recipient_mismatch', reason: `Alıcı alanı doğrulanamadı (${m.to}).` }
      this.agent.report({ state: 'busy', step: 'E-posta hazır, onay bekleniyor', company, detail: m.to })
      return { ok: true, account: st.account, recipientVerified: true, attachWarning }
    })
  }

  /** Hazırlanan iletiyi Taslaklar'a kaydeder ve kaydedildiğini doğrular. */
  async saveDraft(company?: string | null) {
    return this.agent.run(async () => {
      const page = await this.agent.page('gmail')
      await page.evaluate(`rcmail.command('savedraft')`)
      for (let i = 0; i < 40; i++) {
        const ok = await page.evaluate(`!!(window.rcmail && rcmail.env.draft_id && !rcmail.busy)`).catch(() => false)
        if (ok) {
          this.agent.report({ state: 'ready', step: 'Webmail taslağı kaydedildi', company })
          return
        }
        await sleep(500)
      }
      throw new Error('Webmail taslağı kaydedildiği doğrulanamadı.')
    })
  }

  /** Hazırlanan iletiyi gönderir; Roundcube yeni ileti ekranından çıkarsa (yalnızca başarıda olur) gönderildi sayılır. */
  async send(company?: string | null): Promise<{ status: 'sent' | 'unverified'; detail: string }> {
    return this.agent.run(async () => {
      const page = await this.agent.page('gmail')
      this.agent.touch(page)
      // Sayfa o an meşgul olabilir: kısa süre yeniden bakılır
      for (let i = 0; i < 6 && (await this.state(page)).action !== 'compose'; i++) await sleep(500)
      if ((await this.state(page)).action !== 'compose') throw new Error('Gönderilecek ileti penceresi bulunamadı.')
      this.agent.report({ state: 'busy', step: 'E-posta gönderiliyor', company })
      await page.evaluate(`rcmail.command('send')`)
      for (let i = 0; i < 60; i++) {
        await sleep(500)
        const s = await this.state(page)
        const msg = (await page.evaluate(`(document.querySelector('#messagestack')||{}).innerText||''`).catch(() => '')) as string
        if (s.action !== 'compose' || /gönderildi|sent successfully/i.test(msg)) return { status: 'sent' as const, detail: 'Webmail: ileti gönderildi' }
        if (/hata|error|failed|başarısız/i.test(msg)) throw new Error(`Webmail gönderim hatası: ${msg.trim().slice(0, 200)}`)
        // Konu boş uyarısı gibi bir onay penceresi açılırsa gönderim yapılmaz
        if (await page.locator('.ui-dialog:visible, .popover:visible').count()) throw new Error('Webmail bir onay penceresi gösterdi; gönderim yapılmadı.')
      }
      return { status: 'unverified' as const, detail: 'Webmail gönderim sonucu doğrulanamadı. Gönderilmiş klasörünü kontrol edin; tekrar gönderilmeyecek.' }
    })
  }
}
