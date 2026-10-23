import { describe, it, expect } from 'vitest'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { SiteAnalyzer } from '../src/main/analysis/analyzer'
import { PoliteFetcher } from '../src/main/http/fetcher'
import { closeBrowser } from '../src/main/analysis/browser'

const LIVE = process.env.LIVE === '1'
describe.runIf(LIVE)('canlı site analizi', () => {
  it('ucamedya.com.tr analiz edilir', async () => {
    const dir = join(__dirname, '.tmp', 'live-analysis')
    mkdirSync(join(dir, 'screenshots'), { recursive: true })
    const a = new SiteAnalyzer(new PoliteFetcher(fetch, 300))
    const r = await a.analyze(process.env.SITE ?? 'https://ucamedya.com.tr/', { dir, maxPages: 4, respectRobots: true, timeoutSec: 40, pagespeed: null, onStep: (m) => console.log('·', m) })
    await closeBrowser()
    console.log(JSON.stringify({ status: r.status, error: r.error, overall: r.overall, pages: r.pages, scores: Object.fromEntries(Object.entries(r.scores ?? {}).map(([k, v]) => [k, `${v.score} (${v.confidence}) ${v.reason}`])), findings: r.findings.map((f) => `[${f.severity}] ${f.title} — ${f.evidence}`), shots: r.shots.map((s) => `${s.key} ${s.width}x${s.height} ${Math.round(s.bytes / 1024)}KB`), contacts: r.contacts, tests: r.tests }, null, 1))
    expect(r.status).toBe('done')
  }, 240000)
})
