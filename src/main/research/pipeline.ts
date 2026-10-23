// AI Müşteri Bulucu araştırma hattı: sorgu hazırlama → keşif → tekrar kontrolü → site doğrulama/analiz →
// iletişim bilgileri → puanlama → taslak → rapor. Her şirketin aşaması research_results satırında
// saklanır; görev duraklatılabilir, iptal edilebilir ve yarıda kalırsa tamamlananları atlayarak devam eder.

import type { Db } from '../database/db'
import { j } from '../database/db'
import type { JobContext } from '../jobs/engine'
import { mapLimit } from '../jobs/engine'
import type { CompanyService } from '../services/companies'
import type { AnalysisService } from '../services/analysis-service'
import type { SearchProvider } from '../integrations/search/providers'
import { QuotaError } from '../integrations/search/providers'
import type { SettingsService } from '../services/settings'
import type { SearchHit } from '@shared/types'
import { SECTOR_QUERY_HINTS } from '@shared/constants'

export interface ResearchStats {
  queriesRun?: string[]
  discoveryDone?: boolean
  found?: number
  duplicates?: number
  skippedClosed?: number
  providerErrors?: string[]
  quotaHit?: boolean
}

export function buildQueries(sectors: string[], locations: { city: string; district?: string }[], extra: string[], max: number): string[] {
  const out: string[] = []
  const locs = locations.length ? locations : [{ city: 'Türkiye' }]
  const secs = sectors.length ? sectors : ['firma']
  for (const s of secs) {
    const hints = SECTOR_QUERY_HINTS[s] ?? [s]
    for (const l of locs) {
      for (const h of hints.slice(0, 2)) out.push(`${h} ${l.district ? `${l.district} ` : ''}${l.city}`.trim())
    }
  }
  for (const e of extra) for (const l of locs) out.push(`${e} ${l.district ?? ''} ${l.city}`.replace(/\s+/g, ' ').trim())
  return [...new Set(out)].slice(0, Math.max(1, max))
}

export class ResearchPipeline {
  constructor(
    private db: Db,
    private companies: CompanyService,
    private analysis: AnalysisService,
    private settings: SettingsService,
    private getProvider: (key?: string) => SearchProvider | null,
    private createDrafts: (companyId: number, channels: ('email' | 'whatsapp')[], tone: string) => Promise<void>,
    private makeReport: (researchId: number) => Promise<string>,
    private emitChange: (scope: string, id?: number) => void
  ) {}

  private setResult(id: number, patch: { phase?: string; status?: string; message?: string | null; error?: string | null; company_id?: number }) {
    const sets: string[] = []
    const vals: (string | number | null)[] = []
    for (const [k, v] of Object.entries(patch)) {
      sets.push(`${k} = ?`)
      vals.push(v as string | number | null)
    }
    this.db.run(`UPDATE research_results SET ${sets.join(', ')}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`, ...vals, id)
  }

  private stats(researchId: number): ResearchStats {
    return j(this.db.get<{ stats: string }>('SELECT stats FROM research_projects WHERE id = ?', researchId)?.stats, {})
  }

  private saveStats(researchId: number, s: ResearchStats) {
    this.db.run('UPDATE research_projects SET stats = ? WHERE id = ?', JSON.stringify(s), researchId)
  }

  /** Bir arama sonucunu kaydeder: tekrar ise mevcut şirkete bağlar, değilse yeni şirket oluşturur. */
  ingestHit(researchId: number, hit: SearchHit & { email?: string; sector?: string }, sector: string | null, source: string): 'new' | 'duplicate' | 'skipped' | 'closed' {
    if (!hit.name?.trim()) return 'skipped'
    if (hit.businessStatus === 'CLOSED_PERMANENTLY') {
      this.db.run("INSERT INTO research_results(research_id, raw_name, raw, phase, status, message) VALUES (?,?,?, 'skipped', 'skipped', 'Arama sağlayıcısına göre kalıcı olarak kapalı')", researchId, hit.name, JSON.stringify(hit))
      return 'closed'
    }
    const dup = this.companies.findDuplicate({ name: hit.name, website: hit.website, phone: hit.phone, sourceRef: hit.sourceRef, city: hit.city, email: hit.email })
    if (dup) {
      if (this.db.get('SELECT 1 FROM research_results WHERE research_id = ? AND company_id = ?', researchId, dup.id)) return 'skipped'
      this.db.run("INSERT INTO research_results(research_id, company_id, raw_name, raw, phase, status, duplicate_of, message) VALUES (?,?,?,?, 'found', 'duplicate', ?, ?)", researchId, dup.id, hit.name, JSON.stringify(hit), dup.id, `Yinelenen kayıt: ${dup.reason}`)
      return 'duplicate'
    }
    const id = this.companies.create({ ...hit, sector: hit.sector ?? sector, source })
    this.db.run("UPDATE companies SET stage_key = 'researching' WHERE id = ?", id)
    this.db.run("INSERT INTO research_results(research_id, company_id, raw_name, raw, phase, status, message) VALUES (?,?,?,?, 'found', 'pending', 'Şirket bulundu')", researchId, id, hit.name, JSON.stringify(hit))
    return 'new'
  }

  async run(ctx: JobContext) {
    const researchId = Number(ctx.payload.researchId)
    const rp = this.db.get<{ id: number; name: string; sectors: string; locations: string; customer_types: string; analysis_types: string; outputs: string; target_count: number; provider: string | null; queries: string; status: string }>('SELECT * FROM research_projects WHERE id = ?', researchId)
    if (!rp) throw new Error('Araştırma bulunamadı')
    const cfg = j<{ steps?: { analyze: boolean; screenshots: boolean; pdf: boolean; drafts: boolean }; channels?: ('email' | 'whatsapp')[]; tone?: string; extraQueries?: string[] }>(rp.outputs, {})
    const steps = cfg.steps ?? { analyze: true, screenshots: true, pdf: true, drafts: true }
    const sectors = j<string[]>(rp.sectors, [])
    const locations = j<{ city: string; district?: string }[]>(rp.locations, [])
    const customerTypes = j<string[]>(rp.customer_types, [])
    this.db.run("UPDATE research_projects SET status = 'running', error = NULL, started_at = COALESCE(started_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = ?", researchId)
    this.emitChange('research', researchId)

    // ---------- 1–5: Keşif ----------
    const st = this.stats(researchId)
    if (!st.discoveryDone && rp.provider !== 'manual') {
      const provider = this.getProvider(rp.provider ?? undefined)
      if (!provider) throw new Error('Arama sağlayıcısı yapılandırılmamış. Entegrasyonlar sayfasından Google Places, SerpAPI veya Brave anahtarı ekleyin ya da CSV ile manuel içe aktarma yapın.')
      const queries = j<string[]>(rp.queries, []).length ? j<string[]>(rp.queries, []) : buildQueries(sectors, locations, cfg.extraQueries ?? [], this.settings.get().search.maxQueriesPerResearch)
      this.db.run('UPDATE research_projects SET queries = ? WHERE id = ?', JSON.stringify(queries), researchId)
      st.queriesRun ??= []
      st.found ??= 0
      st.duplicates ??= 0
      st.skippedClosed ??= 0
      st.providerErrors ??= []
      const sectorOf = (q: string) => sectors.find((s) => (SECTOR_QUERY_HINTS[s] ?? [s]).some((h) => q.startsWith(h))) ?? sectors[0] ?? null
      for (const q of queries) {
        await ctx.checkpoint()
        if (st.found >= rp.target_count) break
        if (st.queriesRun.includes(q)) continue
        ctx.progress(st.found, rp.target_count, `Aranıyor: "${q}"`)
        let hits: SearchHit[] = []
        try {
          hits = await provider.search(q, { limit: Math.min(60, rp.target_count * 2), signal: ctx.signal })
        } catch (e) {
          if (e instanceof QuotaError) {
            st.quotaHit = true
            st.providerErrors.push((e as Error).message)
            this.saveStats(researchId, st)
            ctx.log(`Kota doldu: ${(e as Error).message}`)
            break
          }
          st.providerErrors.push(`"${q}": ${(e as Error).message}`)
          ctx.log(`Sorgu hatası "${q}": ${(e as Error).message}`)
          if (st.providerErrors.length >= 3 && st.found === 0) {
            this.saveStats(researchId, st)
            throw new Error(`Arama sağlayıcısı art arda hata verdi: ${(e as Error).message}`)
          }
          continue
        }
        for (const h of hits) {
          if (st.found >= rp.target_count) break
          const r = this.ingestHit(researchId, h, sectorOf(q), provider.key)
          if (r === 'new') st.found++
          else if (r === 'duplicate') st.duplicates++
          else if (r === 'closed') st.skippedClosed++
        }
        st.queriesRun.push(q)
        this.saveStats(researchId, st)
        this.emitChange('research', researchId)
        ctx.log(`"${q}": ${hits.length} sonuç; toplam yeni ${st.found}, yinelenen ${st.duplicates}`)
      }
      st.discoveryDone = true
      this.saveStats(researchId, st)
      if (st.found < rp.target_count) ctx.log(`Hedef ${rp.target_count} şirketti; uygun sorgularla ${st.found} yeni şirket bulunabildi.`)
    }

    // ---------- 6–12: Şirket bazında işleme ----------
    const pending = this.db.all<{ id: number; company_id: number }>("SELECT id, company_id FROM research_results WHERE research_id = ? AND status = 'pending' AND company_id IS NOT NULL ORDER BY id", researchId)
    const total = this.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM research_results WHERE research_id = ? AND status IN ('pending','running','done','failed')", researchId)?.n ?? 0
    let done = this.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM research_results WHERE research_id = ? AND status IN ('done','failed')", researchId)?.n ?? 0
    ctx.progress(done, total, `${pending.length} şirket işlenecek`)
    const concurrency = this.settings.get().analysis.concurrency
    await mapLimit(pending, concurrency, async (row) => {
      await ctx.checkpoint()
      const name = this.db.get<{ name: string; website: string | null }>('SELECT name, website FROM companies WHERE id = ?', row.company_id)
      try {
        this.setResult(row.id, { status: 'running', phase: 'website', message: name?.website ? 'Web sitesi tespit edildi' : 'Web sitesi bulunamadı' })
        this.emitChange('research', researchId)
        if (!name?.website) {
          this.db.run("UPDATE companies SET website_status = 'none' WHERE id = ?", row.company_id)
        } else if (steps.analyze) {
          this.setResult(row.id, { phase: 'analyzing', message: 'Web sitesi analiz ediliyor' })
          this.emitChange('research', researchId)
          const res = await this.analysis.analyzeCompany(row.company_id, {
            researchId,
            pdf: steps.pdf,
            signal: ctx.signal,
            onStep: (m) => {
              const phase = /Ekran/.test(m) ? 'screenshots' : /iletişim|İletişim/.test(m) ? 'contacts' : 'analyzing'
              this.setResult(row.id, { phase, message: m })
              this.emitChange('research', researchId)
            }
          })
          if (res.status !== 'done') this.setResult(row.id, { message: res.status === 'unreachable' ? 'Site erişilemedi (kayıt korundu)' : res.status === 'blocked' ? 'robots.txt izin vermiyor' : 'Analiz başarısız' })
        }
        await ctx.checkpoint()
        this.setResult(row.id, { phase: 'profiling', message: 'Müşteri profili hazırlanıyor' })
        this.analysis.rescore(row.company_id, customerTypes)
        if (steps.drafts && !this.companies.isSuppressed(row.company_id)) {
          await this.createDrafts(row.company_id, cfg.channels ?? ['email', 'whatsapp'], cfg.tone ?? 'professional').catch((e) => ctx.log(`${name?.name}: taslak üretilemedi — ${(e as Error).message}`))
        }
        this.db.run("UPDATE companies SET stage_key = CASE WHEN stage_key IN ('new','researching','awaiting_analysis') THEN 'review' ELSE stage_key END WHERE id = ?", row.company_id)
        this.setResult(row.id, { status: 'done', phase: 'done', message: 'İnceleme tamamlandı', error: null })
      } catch (e) {
        if (ctx.signal.aborted) {
          this.setResult(row.id, { status: 'pending', message: 'İptal edildi; devam ettirildiğinde yeniden işlenecek' })
          throw e
        }
        ctx.failItem()
        this.setResult(row.id, { status: 'failed', error: (e as Error).message.slice(0, 500), message: 'Hata oluştu; diğer bilgiler korundu' })
      }
      done++
      ctx.progress(done, total, `${name?.name ?? 'Şirket'}: tamamlandı`)
      this.emitChange('research', researchId)
    })

    // ---------- 13: Rapor ----------
    let reportPath: string | null = null
    if (steps.pdf) {
      try {
        reportPath = await this.makeReport(researchId)
        ctx.addFile(reportPath)
      } catch (e) {
        ctx.log(`Araştırma raporu oluşturulamadı: ${(e as Error).message}`)
      }
    }
    const final = this.stats(researchId)
    this.db.run("UPDATE research_projects SET status = 'completed', finished_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), error = ? WHERE id = ?", final.quotaHit ? 'Arama sağlayıcısının kotası doldu; araştırma eldeki sonuçlarla tamamlandı.' : null, researchId)
    this.emitChange('research', researchId)
    return { researchId, found: final.found ?? 0, duplicates: final.duplicates ?? 0, reportPath }
  }

  /** Başarısız olan şirketleri yeniden işlenmek üzere sıraya alır. */
  resetFailed(researchId: number): number {
    return this.db.run("UPDATE research_results SET status = 'pending', error = NULL, message = 'Yeniden denenecek' WHERE research_id = ? AND status = 'failed'", researchId).changes
  }
}
