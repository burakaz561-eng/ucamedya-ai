// Analizi çalıştırır ve sonuçlarını kalıcı hâle getirir: website_analyses (sürümlü), bulgular,
// ekran görüntüleri, şirket iletişim bilgileri, analysis.json, isteğe bağlı AI özeti ve PDF raporu.

import { join } from 'node:path'
import type { Db } from '../database/db'
import { j } from '../database/db'
import type { FileStore } from '../files/folders'
import type { CompanyService } from './companies'
import type { SettingsService } from './settings'
import { SiteAnalyzer, type AnalysisOutput } from '../analysis/analyzer'
import { ruleSummary } from '../analysis/rules'
import type { PageSpeedClient } from '../integrations/pagespeed'
import type { AiProvider } from '../integrations/ai/ai-client'
import { aiAnalysisSummary } from '../outreach/drafting'
import { analysisReportHtml, type AnalysisReportData } from '../reports/templates'
import { brandForPdf, htmlToPdf, imageDataUri } from '../reports/pdf'
import { computeOpportunity } from '../research/scoring'
import { FINDING_CATEGORIES } from '@shared/constants'
import { normalizeWebsite } from '@shared/text'

const SHOT_LABEL: Record<string, string> = {
  'home-desktop': 'Ana sayfa — masaüstü', 'home-desktop-full': 'Ana sayfa (tam) — masaüstü', 'home-mobile': 'Ana sayfa — mobil', 'home-mobile-full': 'Ana sayfa (tam) — mobil',
  'services-desktop': 'Hizmetler sayfası', 'about-desktop': 'Hakkımızda sayfası', 'contact-desktop': 'İletişim sayfası', 'issue-image': 'Sorunlu görsel bölümü', 'issue-overflow': 'Mobil taşma bölümü'
}

export class AnalysisService {
  constructor(
    private db: Db,
    private files: FileStore,
    private companies: CompanyService,
    private settings: SettingsService,
    private analyzer: SiteAnalyzer,
    private getPagespeed: () => PageSpeedClient | null,
    private getAi: () => AiProvider | null,
    private emitChange: (scope: string) => void
  ) {}

  /** Bir şirketin sitesini analiz eder. Aynı şirket yeniden analiz edilirse yeni sürüm oluşturulur. */
  async analyzeCompany(companyId: number, opts: { researchId?: number | null; pdf?: boolean; signal?: AbortSignal; onStep?: (m: string) => void } = {}) {
    const c = this.db.get<{ id: number; name: string; website: string | null }>('SELECT id, name, website FROM companies WHERE id = ?', companyId)
    if (!c) throw new Error('Şirket bulunamadı')
    if (!c.website) {
      this.db.run("UPDATE companies SET website_status = 'none' WHERE id = ?", companyId)
      this.rescore(companyId)
      return { status: 'no_website' as const, analysisId: null }
    }
    const version = (this.db.get<{ v: number }>('SELECT MAX(version) AS v FROM website_analyses WHERE company_id = ?', companyId)?.v ?? 0) + 1
    const dir = this.files.analysisDir(companyId, version)
    const r = this.db.run("INSERT INTO website_analyses(company_id, research_id, version, url, status, folder_path, started_at) VALUES (?,?,?,?, 'running', ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))", companyId, opts.researchId ?? null, version, c.website, dir)
    const analysisId = r.lastInsertRowid
    this.emitChange('analyses')
    const out = await this.runAndStore(analysisId, c.website, dir, companyId, opts)
    if (opts.pdf !== false && out.status === 'done') {
      opts.onStep?.('PDF raporu hazırlanıyor')
      await this.generatePdf(analysisId).catch((e) => this.db.run('UPDATE website_analyses SET error = ? WHERE id = ?', `PDF oluşturulamadı: ${(e as Error).message}`, analysisId))
    }
    return { status: out.status, analysisId }
  }

  /** Şirket kaydı olmadan tek bir adresi analiz eder ("Web Sitesi Analizi" ekranındaki hızlı analiz). */
  async analyzeUrl(url: string, opts: { signal?: AbortSignal; onStep?: (m: string) => void; pdf?: boolean } = {}) {
    const u = normalizeWebsite(url)
    if (!u) throw new Error('Geçerli bir web adresi girin (ör. https://ornek.com.tr)')
    const r = this.db.run("INSERT INTO website_analyses(company_id, version, url, status, started_at) VALUES (NULL, 1, ?, 'running', strftime('%Y-%m-%dT%H:%M:%fZ','now'))", u)
    const id = r.lastInsertRowid
    const dir = this.files.looseAnalysisDir(id)
    this.db.run('UPDATE website_analyses SET folder_path = ? WHERE id = ?', dir, id)
    const out = await this.runAndStore(id, u, dir, null, opts)
    if (opts.pdf !== false && out.status === 'done') await this.generatePdf(id).catch(() => undefined)
    return { status: out.status, analysisId: id }
  }

  private async runAndStore(analysisId: number, url: string, dir: string, companyId: number | null, opts: { signal?: AbortSignal; onStep?: (m: string) => void }) {
    const s = this.settings.get()
    let out: AnalysisOutput
    try {
      out = await this.analyzer.analyze(url, {
        dir,
        maxPages: s.analysis.maxPages,
        respectRobots: s.analysis.respectRobots,
        timeoutSec: s.analysis.timeoutSec,
        pagespeed: s.analysis.pagespeed ? this.getPagespeed() : null,
        signal: opts.signal,
        onStep: opts.onStep
      })
    } catch (e) {
      out = { status: 'failed', url, finalUrl: null, error: (e as Error).message, findings: [], scores: null, overall: null, tests: [], shots: [], contacts: [], metrics: {}, psi: null, pages: [] }
    }
    const summary = out.status === 'done' ? ruleSummary(out.findings, out.overall) : out.error ?? null
    this.db.tx(() => {
      this.db.run(
        "UPDATE website_analyses SET status = ?, final_url = ?, scores = ?, metrics = ?, tests = ?, summary = ?, error = ?, finished_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
        out.status, out.finalUrl, JSON.stringify({ ...(out.scores ?? {}), overall: out.overall }), JSON.stringify({ ...out.metrics, psi: out.psi, pages: out.pages }), JSON.stringify(out.tests), summary, out.error ?? null, analysisId
      )
      const shotIds = new Map<string, number>()
      const cname = companyId ? this.db.get<{ name: string }>('SELECT name FROM companies WHERE id = ?', companyId)?.name : null
      for (const sh of out.shots) {
        const sr = this.db.run(
          'INSERT INTO screenshots(analysis_id, company_id, company_name, site_url, page_url, page_kind, viewport, width, height, finding_code, file_path, bytes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
          analysisId, companyId, cname ?? null, out.finalUrl ?? url, sh.pageUrl, sh.pageKind, sh.viewport, sh.width, sh.height, sh.findingCode ?? null, sh.file, sh.bytes
        )
        shotIds.set(sh.key, sr.lastInsertRowid)
        this.files.register({ path: sh.file, kind: 'screenshot', companyId, analysisId })
      }
      for (const f of out.findings) {
        this.db.run(
          'INSERT INTO analysis_findings(analysis_id, category, code, title, detail, evidence, severity, certainty, recommendation, service_key, screenshot_id, page_url) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
          analysisId, f.category, f.code, f.title, f.detail ?? null, f.evidence ?? null, f.severity, f.certainty, f.recommendation ?? null, f.serviceKey ?? null,
          f.screenshotKey ? shotIds.get(f.screenshotKey) ?? null : null, f.pageUrl ?? null
        )
      }
      if (companyId) {
        const wsStatus = out.status === 'done' ? 'ok' : out.status === 'blocked' ? 'blocked_robots' : out.status === 'unreachable' ? 'unreachable' : 'error'
        this.db.run("UPDATE companies SET website_status = ?, last_analysis_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), analysis_summary = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?", wsStatus, summary, companyId)
        for (const ct of out.contacts) {
          this.companies.addContact(companyId, { type: ct.type, value: ct.value, sourceUrl: ct.sourceUrl, sourceType: 'website', verified: true })
        }
        const stage = this.db.get<{ stage_key: string }>('SELECT stage_key FROM companies WHERE id = ?', companyId)?.stage_key
        if (stage && ['new', 'researching', 'awaiting_analysis'].includes(stage)) this.db.run("UPDATE companies SET stage_key = ? WHERE id = ?", out.status === 'done' ? 'review' : 'awaiting_analysis', companyId)
        this.companies.log(companyId, out.status === 'done' ? 'Web sitesi analizi tamamlandı' : 'Web sitesi analizi yapılamadı', out.status === 'done' ? `${out.findings.length} bulgu, genel puan ${out.overall ?? '—'}` : out.error, 'system', 'analysis', analysisId)
      }
    })
    this.files.writeJson(join(dir, 'analysis.json'), { analysisId, url, finalUrl: out.finalUrl, status: out.status, error: out.error, overall: out.overall, scores: out.scores, findings: out.findings, tests: out.tests, psi: out.psi, pages: out.pages, metrics: out.metrics, createdAt: new Date().toISOString() })
    this.files.register({ path: join(dir, 'analysis.json'), kind: 'analysis_json', companyId, analysisId })

    // Yapay zekâ özeti (isteğe bağlı; başarısız olursa kural tabanlı özet kalır)
    const ai = this.settings.get().ai.enabled ? this.getAi() : null
    if (ai && out.status === 'done' && out.findings.length) {
      try {
        opts.onStep?.('Yapay zekâ değerlendirmesi yazılıyor')
        const name = companyId ? this.db.get<{ name: string }>('SELECT name FROM companies WHERE id = ?', companyId)?.name ?? url : url
        const sc = Object.fromEntries(Object.entries(out.scores ?? {}).map(([k, v]) => [FINDING_CATEGORIES[k as keyof typeof FINDING_CATEGORIES] ?? k, v.score]))
        const text = await aiAnalysisSummary(ai, name, out.findings.map((f) => ({ code: f.code, category: f.category, title: f.title, evidence: f.evidence ?? null, severity: f.severity, recommendation: f.recommendation ?? null, certainty: f.certainty })), sc)
        this.db.run('UPDATE website_analyses SET ai_summary = ? WHERE id = ?', text, analysisId)
        if (companyId) this.db.run('UPDATE companies SET analysis_summary = ? WHERE id = ?', text, companyId)
      } catch (e) {
        this.db.run('UPDATE website_analyses SET tests = ? WHERE id = ?', JSON.stringify([...out.tests, { key: 'ai_summary', label: 'Yapay zekâ özeti', status: 'failed', note: (e as Error).message }]), analysisId)
      }
    }
    if (companyId) {
      this.rescore(companyId)
      this.files.syncCompanyFiles(companyId)
    }
    this.emitChange('analyses')
    return out
  }

  /** Şirketin fırsat puanını en son analize göre yeniden hesaplar. */
  rescore(companyId: number, customerTypes?: string[]) {
    const c = this.db.get<{ website_status: string; business_status: string | null; rating_count: number | null; stage_key: string }>('SELECT website_status, business_status, rating_count, stage_key FROM companies WHERE id = ?', companyId)
    if (!c) return
    const a = this.db.get<{ id: number; scores: string; metrics: string }>("SELECT id, scores, metrics FROM website_analyses WHERE company_id = ? AND status = 'done' ORDER BY id DESC LIMIT 1", companyId)
    const findings = a ? this.db.all<{ category: string; severity: string; service_key: string | null; code: string }>('SELECT category, severity, service_key, code FROM analysis_findings WHERE analysis_id = ?', a.id) : []
    const types = customerTypes ?? j<string[]>(this.db.get<{ customer_types: string }>('SELECT rp.customer_types FROM research_results rr JOIN research_projects rp ON rp.id = rr.research_id WHERE rr.company_id = ? ORDER BY rr.id DESC LIMIT 1', companyId)?.customer_types, [])
    const res = computeOpportunity(
      {
        websiteStatus: c.website_status,
        overall: a ? (j<{ overall?: number | null }>(a.scores, {}).overall ?? null) : null,
        findings: findings.map((f) => ({ category: f.category, severity: f.severity, serviceKey: f.service_key, code: f.code })),
        businessStatus: c.business_status,
        ratingCount: c.rating_count,
        copyrightYear: a ? (j<{ desktop?: { legacy?: { copyrightYear?: number } } }>(a.metrics, {}).desktop?.legacy?.copyrightYear ?? null) : null,
        contacts: this.db.all<{ type: string; kind: string; source_type: string | null }>('SELECT type, kind, source_type FROM company_contacts WHERE company_id = ?', companyId).map((x) => ({ type: x.type, kind: x.kind, sourceType: x.source_type })),
        customerTypes: types,
        stageKey: c.stage_key,
        suppressed: this.companies.isSuppressed(companyId),
        contactedBefore: !!this.db.get("SELECT 1 FROM outreach_messages WHERE company_id = ? AND status IN ('sent','delivered','read','manual_opened')", companyId),
        isCustomer: c.stage_key === 'won'
      },
      this.settings.get().scoring
    )
    const svcNames = res.services.map((k) => this.db.get<{ name: string }>('SELECT name FROM services WHERE key = ?', k)?.name ?? k)
    this.db.run('UPDATE companies SET opportunity_score = ?, priority_group = ?, score_reasons = ?, potential_services = ? WHERE id = ?', res.score, res.group, JSON.stringify(res.reasons), JSON.stringify(svcNames), companyId)
  }

  detail(analysisId: number) {
    const a = this.db.get('SELECT * FROM website_analyses WHERE id = ?', analysisId)
    if (!a) throw new Error('Analiz bulunamadı')
    return {
      ...a,
      scores: j(a.scores, {}),
      metrics: j(a.metrics, {}),
      tests: j(a.tests, []),
      findings: this.db.all('SELECT f.*, s.name AS service_name, sc.file_path AS screenshot_path FROM analysis_findings f LEFT JOIN services s ON s.key = f.service_key LEFT JOIN screenshots sc ON sc.id = f.screenshot_id WHERE f.analysis_id = ? ORDER BY CASE f.severity WHEN \'high\' THEN 0 WHEN \'medium\' THEN 1 WHEN \'low\' THEN 2 ELSE 3 END, f.id', analysisId),
      screenshots: this.db.all('SELECT * FROM screenshots WHERE analysis_id = ? ORDER BY id', analysisId),
      company: a.company_id ? this.db.get('SELECT id, name, sector, city FROM companies WHERE id = ?', a.company_id as number) : null
    }
  }

  async generatePdf(analysisId: number): Promise<string> {
    const a = this.detail(analysisId) as Record<string, unknown> & { findings: Record<string, unknown>[]; screenshots: Record<string, unknown>[]; scores: Record<string, unknown>; tests: { label: string; status: string; note?: string }[]; metrics: { psi?: AnalysisReportData['psi'] } }
    if (a.status !== 'done') throw new Error('Yalnızca tamamlanmış analizler için rapor oluşturulabilir')
    const comp = a.company_id ? this.db.get<{ name: string; sector: string | null; city: string | null; district: string | null; address: string | null; website: string | null }>('SELECT name, sector, city, district, address, website FROM companies WHERE id = ?', a.company_id as number) : null
    const shotUri = new Map<number, string | null>()
    const uri = (id: number | null, path: string | null) => {
      if (!id || !path) return null
      if (!shotUri.has(id)) shotUri.set(id, imageDataUri(path, 1100))
      return shotUri.get(id) ?? null
    }
    const brand = this.settings.get().brand
    const svcKeys = [...new Set(a.findings.filter((f) => f.severity === 'high' || f.severity === 'medium').map((f) => f.service_key as string).filter(Boolean))]
    const data: AnalysisReportData = {
      company: comp ?? { name: new URL(String(a.url)).hostname, sector: null, city: null, district: null, address: null, website: String(a.url) },
      analysis: { id: analysisId, version: Number(a.version), url: String(a.url), finalUrl: (a.final_url as string) ?? null, date: String(a.finished_at ?? a.created_at), summary: (a.summary as string) ?? null, aiSummary: (a.ai_summary as string) ?? null, overall: ((a.scores as { overall?: number }).overall ?? null) as number | null },
      scores: a.scores as AnalysisReportData['scores'],
      findings: a.findings.map((f) => ({ category: String(f.category), title: String(f.title), detail: (f.detail as string) ?? null, evidence: (f.evidence as string) ?? null, severity: String(f.severity), certainty: String(f.certainty), recommendation: (f.recommendation as string) ?? null, service: (f.service_name as string) ?? null, shot: f.screenshot_id && !/^home-(desktop|mobile)$/.test(String(f.screenshot_path ?? '').split(/[\\/]/).pop()?.replace(/\.\w+$/, '') ?? '') ? uri(f.screenshot_id as number, f.screenshot_path as string) : null })),
      shots: a.screenshots
        .filter((s) => /home-(desktop|mobile)\.png$/.test(String(s.file_path)))
        .map((s) => ({ label: SHOT_LABEL[String(s.file_path).split(/[\\/]/).pop()!.replace(/\.\w+$/, '')] ?? 'Ekran görüntüsü', uri: uri(s.id as number, s.file_path as string) ?? '', viewport: String(s.viewport) }))
        .filter((s) => s.uri),
      tests: a.tests,
      psi: a.metrics.psi ?? null,
      services: svcKeys.map((k) => this.db.get<{ name: string; description: string }>('SELECT name, description FROM services WHERE key = ? AND active = 1', k)).filter(Boolean) as { name: string; description: string }[]
    }
    const html = analysisReportHtml(brandForPdf(brand), data)
    const out = join(String(a.folder_path), 'website-report.pdf')
    await htmlToPdf(html, out)
    this.db.run('UPDATE website_analyses SET report_path = ? WHERE id = ?', out, analysisId)
    this.files.register({ path: out, kind: 'report_pdf', companyId: (a.company_id as number) ?? null, analysisId })
    if (a.company_id) this.companies.log(a.company_id as number, 'PDF analiz raporu oluşturuldu', out, 'system')
    this.emitChange('files')
    return out
  }
}
