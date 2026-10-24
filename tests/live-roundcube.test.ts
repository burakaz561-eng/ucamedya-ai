import { describe, it, expect } from 'vitest'
import { chromium } from 'playwright-core'
import { RoundcubeWeb } from '../src/main/automation/roundcube-web'

// Açık otomasyon tarayıcısına (CDP_PORT) bağlanır; Roundcube'da taslak oluşturur, GÖNDERMEZ.
describe.runIf(!!process.env.CDP_PORT && !!process.env.WEBMAIL)('canlı Roundcube taslak', () => {
  it('prepare + saveDraft', async () => {
    const b = await chromium.connectOverCDP(`http://127.0.0.1:${process.env.CDP_PORT}`)
    const ctx = b.contexts()[0]
    const page = await ctx.newPage()
    const agent = {
      page: async () => page,
      run: <T,>(f: () => Promise<T>) => f(),
      report: (e: { step?: string }) => console.log('·', e.step),
      touch: () => undefined,
      waitForUser: async () => { throw new Error('oturum kapalı') }
    }
    const rc = new RoundcubeWeb(agent as never, () => process.env.WEBMAIL!)
    const st = await rc.status()
    console.log('status', st)
    expect(st.loggedIn).toBe(true)
    const r = await rc.prepare({ to: process.env.TO ?? 'info@ucamedya.com.tr', subject: 'UcaMedya AI — modül testi (gönderilmedi)', body: 'Bu taslak UcaMedya AI webmail modülü testinde oluşturuldu ve GÖNDERİLMEDİ.\nİkinci satır.' })
    console.log('prepare', r)
    expect(r.ok).toBe(true)
    await rc.saveDraft()
    console.log('draft_id', await page.evaluate('rcmail.env.draft_id'))
    await page.close()
    await b.close().catch(() => undefined)
  }, 120000)
})
