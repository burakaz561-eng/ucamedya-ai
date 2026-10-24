import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { AgentBrowser, detectBrowsers } from '../src/main/automation/agent-browser'
import { GoogleBrowserSearch } from '../src/main/automation/google-browser'
import { WhatsAppWeb } from '../src/main/automation/whatsapp-web'
import { GmailWeb } from '../src/main/automation/gmail-web'

// Gerçek Chrome açar ve Google'da arama yapar: LIVE=1 ile çalıştırılır.
describe.runIf(process.env.LIVE === '1')('canlı tarayıcı otomasyonu', () => {
  it('Google araması + oturum tespitleri', async () => {
    const agent = new AgentBrowser(join(__dirname, '.tmp', 'live-agent'), (e) => console.log('·', e.state, e.step ?? ''), () => undefined)
    const kind = detectBrowsers()[0].kind
    await agent.start(kind)
    try {
      const g = new GoogleBrowserSearch(agent)
      const hits = await g.search(process.env.QUERY ?? 'Kocaeli inşaat firmaları', { limit: 15, maxPages: 1 })
      console.log(JSON.stringify(hits.map((h) => [h.name, h.district, h.city, h.phone, h.website, h.types?.[0]]), null, 0))
      expect(hits.length).toBeGreaterThan(3)
      expect(hits.filter((h) => h.website).length).toBeGreaterThan(1)
      const wa = new WhatsAppWeb(agent)
      const st = await agent.run(() => wa.status())
      console.log('whatsapp', st)
      expect(['qr', 'logged_in']).toContain(st)
      const gm = await new GmailWeb(agent).status()
      console.log('gmail', gm)
      expect(typeof gm.loggedIn).toBe('boolean')
    } finally {
      await agent.close()
    }
  }, 240000)
})
