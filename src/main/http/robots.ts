// robots.txt (RFC 9309) ayrıştırma ve önbellek.
// 4xx → kısıtlama yok; 5xx / bağlantı hatası → geçici olarak tüm erişim yasak sayılır.

interface Rule {
  allow: boolean
  pattern: string
}

export interface RobotsRules {
  rules: Rule[]
  crawlDelay: number | null
}

export function parseRobots(txt: string, agentToken: string): RobotsRules {
  const groups: { agents: string[]; rules: Rule[]; delay: number | null }[] = []
  let cur: { agents: string[]; rules: Rule[]; delay: number | null } | null = null
  let lastWasAgent = false
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim()
    if (!line) continue
    const idx = line.indexOf(':')
    if (idx < 0) continue
    const key = line.slice(0, idx).trim().toLowerCase()
    const val = line.slice(idx + 1).trim()
    if (key === 'user-agent') {
      if (!cur || !lastWasAgent) {
        cur = { agents: [], rules: [], delay: null }
        groups.push(cur)
      }
      cur.agents.push(val.toLowerCase())
      lastWasAgent = true
      continue
    }
    lastWasAgent = false
    if (!cur) continue
    if (key === 'allow' || key === 'disallow') {
      if (key === 'disallow' && val === '') continue
      cur.rules.push({ allow: key === 'allow', pattern: val })
    } else if (key === 'crawl-delay') {
      const n = parseFloat(val)
      if (!isNaN(n)) cur.delay = n
    }
  }
  const token = agentToken.toLowerCase()
  const specific = groups.filter((g) => g.agents.some((a) => a !== '*' && token.includes(a)))
  const chosen = specific.length ? specific : groups.filter((g) => g.agents.includes('*'))
  return {
    rules: chosen.flatMap((g) => g.rules),
    crawlDelay: chosen.find((g) => g.delay != null)?.delay ?? null
  }
}

function matches(pattern: string, path: string): number {
  // Eşleşirse desen uzunluğunu (öncelik), eşleşmezse -1 döner.
  const anchored = pattern.endsWith('$')
  const p = anchored ? pattern.slice(0, -1) : pattern
  const re = new RegExp('^' + p.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + (anchored ? '$' : ''))
  return re.test(path) ? pattern.length : -1
}

export function isPathAllowed(rules: RobotsRules, pathWithQuery: string): boolean {
  let best = -1
  let allow = true
  for (const r of rules.rules) {
    const m = matches(r.pattern, pathWithQuery)
    if (m > best || (m === best && m >= 0 && r.allow)) {
      best = m
      allow = r.allow
    }
  }
  return best < 0 ? true : allow
}

export class RobotsCache {
  private cache = new Map<string, { at: number; rules: RobotsRules | 'deny-all' | 'allow-all' }>()

  constructor(
    private get: (url: string) => Promise<{ status: number; text: string }>,
    private agent: string,
    private ttlMs = 24 * 3600 * 1000
  ) {}

  async rulesFor(origin: string) {
    const c = this.cache.get(origin)
    if (c && Date.now() - c.at < this.ttlMs) return c.rules
    let rules: RobotsRules | 'deny-all' | 'allow-all'
    try {
      const r = await this.get(`${origin}/robots.txt`)
      if (r.status >= 200 && r.status < 300) rules = parseRobots(r.text, this.agent.split('/')[0])
      else if (r.status >= 400 && r.status < 500) rules = 'allow-all'
      else rules = 'deny-all'
    } catch {
      rules = 'deny-all'
    }
    // Hata durumunu kısa süre önbelleğe al
    this.cache.set(origin, { at: rules === 'deny-all' ? Date.now() - this.ttlMs + 15 * 60 * 1000 : Date.now(), rules })
    return rules
  }

  async isAllowed(url: string): Promise<boolean> {
    const u = new URL(url)
    const rules = await this.rulesFor(u.origin)
    if (rules === 'allow-all') return true
    if (rules === 'deny-all') return false
    return isPathAllowed(rules, u.pathname + u.search)
  }
}
