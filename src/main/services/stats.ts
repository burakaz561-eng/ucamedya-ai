// Panel ve rapor istatistikleri. Tüm sayılar veritabanındaki gerçek kayıtlardan hesaplanır;
// veri yoksa sıfır döner (örnek/sahte rakam gösterilmez).

import type { Db } from '../database/db'
import { j } from '../database/db'
import type { ResearchReportData } from '../reports/templates'

const n = (db: Db, sql: string, ...p: (string | number)[]) => db.get<{ n: number }>(sql, ...p)?.n ?? 0

export class StatsService {
  constructor(private db: Db) {}

  dashboard() {
    const d = this.db
    return {
      companies: n(d, 'SELECT COUNT(*) AS n FROM companies WHERE merged_into IS NULL AND archived_at IS NULL'),
      analyzed: n(d, "SELECT COUNT(DISTINCT company_id) AS n FROM website_analyses WHERE status = 'done' AND company_id IS NOT NULL"),
      reviewPending: n(d, "SELECT COUNT(*) AS n FROM companies WHERE stage_key = 'review' AND archived_at IS NULL AND merged_into IS NULL"),
      draftsPending: n(d, "SELECT COUNT(*) AS n FROM outreach_drafts WHERE status = 'draft'"),
      approvedDrafts: n(d, "SELECT COUNT(*) AS n FROM outreach_drafts WHERE status = 'approved'"),
      emailsSent: n(d, "SELECT COUNT(*) AS n FROM outreach_messages WHERE channel = 'email' AND status IN ('sent','delivered','read') AND test_mode = 0"),
      emailsFailed: n(d, "SELECT COUNT(*) AS n FROM outreach_messages WHERE channel = 'email' AND status = 'failed'"),
      whatsappSent: n(d, "SELECT COUNT(*) AS n FROM outreach_messages WHERE channel = 'whatsapp' AND status IN ('sent','delivered','read') AND test_mode = 0"),
      whatsappDelivered: n(d, "SELECT COUNT(*) AS n FROM outreach_messages WHERE channel = 'whatsapp' AND status IN ('delivered','read')"),
      replies: n(d, "SELECT COUNT(DISTINCT company_id) AS n FROM communication_events WHERE kind = 'reply'"),
      positive: n(d, "SELECT COUNT(*) AS n FROM companies WHERE stage_key IN ('meeting','offer_prepared','offer_sent','negotiation','won')"),
      meetings: n(d, "SELECT COUNT(DISTINCT c.id) AS n FROM companies c WHERE c.stage_key = 'meeting' OR EXISTS (SELECT 1 FROM activity_logs a WHERE a.company_id = c.id AND a.action = 'Aşama değişti' AND a.detail LIKE '%Görüşme planlandı%') OR EXISTS (SELECT 1 FROM communication_events e WHERE e.company_id = c.id AND e.kind = 'meeting')"),
      offers: n(d, 'SELECT COUNT(*) AS n FROM offers'),
      won: n(d, "SELECT COUNT(*) AS n FROM companies WHERE stage_key = 'won'"),
      pipelineValue: d.get<{ v: number }>("SELECT COALESCE(SUM(total),0) AS v FROM offers WHERE status IN ('draft','sent','negotiation')")?.v ?? 0,
      wonValue: d.get<{ v: number }>("SELECT COALESCE(SUM(total),0) AS v FROM offers WHERE status = 'won'")?.v ?? 0,
      failedRuns: n(d, "SELECT COUNT(*) AS n FROM automation_runs WHERE status IN ('failed','interrupted')"),
      recentRuns: d.all("SELECT id, type, title, status, progress, done, total, failed, error, created_at, finished_at FROM automation_runs ORDER BY id DESC LIMIT 8"),
      failedTasks: d.all("SELECT id, type, title, status, error, created_at FROM automation_runs WHERE status IN ('failed','interrupted') ORDER BY id DESC LIMIT 5"),
      recentReports: d.all("SELECT f.id, f.name, f.path, f.kind, f.created_at, c.name AS company_name FROM files f LEFT JOIN companies c ON c.id = f.company_id WHERE f.kind IN ('report_pdf','research_report','offer_pdf') ORDER BY f.created_at DESC LIMIT 6"),
      byGroup: d.all("SELECT priority_group AS k, COUNT(*) AS n FROM companies WHERE merged_into IS NULL AND archived_at IS NULL AND priority_group IS NOT NULL GROUP BY priority_group"),
      byStage: d.all("SELECT s.label AS k, COUNT(c.id) AS n FROM stages s LEFT JOIN companies c ON c.stage_key = s.key AND c.merged_into IS NULL AND c.archived_at IS NULL GROUP BY s.key ORDER BY s.position"),
      todayTasks: d.all("SELECT t.id, t.title, t.due_at, t.priority, t.company_id, c.name AS company_name FROM tasks t LEFT JOIN companies c ON c.id = t.company_id WHERE t.status IN ('open','in_progress') AND date(t.due_at, 'localtime') = date('now', 'localtime') ORDER BY t.due_at LIMIT 20"),
      overdueTasks: d.all("SELECT t.id, t.title, t.due_at, t.priority, t.company_id, c.name AS company_name FROM tasks t LEFT JOIN companies c ON c.id = t.company_id WHERE t.status IN ('open','in_progress') AND t.due_at IS NOT NULL AND date(t.due_at, 'localtime') < date('now', 'localtime') ORDER BY t.due_at LIMIT 20"),
      pendingMatches: n(d, "SELECT COUNT(*) AS n FROM match_candidates WHERE status = 'pending'"),
      newLeads: n(d, "SELECT COUNT(*) AS n FROM inbound_requests WHERE status = 'new'"),
      upcomingTasks: d.all("SELECT t.id, t.title, t.due_at, t.priority, c.name AS company_name FROM tasks t LEFT JOIN companies c ON c.id = t.company_id WHERE t.status IN ('open','in_progress') ORDER BY t.due_at IS NULL, t.due_at LIMIT 6")
    }
  }

  /** Günlük / haftalık / aylık zaman serisi. */
  series(period: 'day' | 'week' | 'month', span = 14) {
    const fmt = period === 'day' ? '%Y-%m-%d' : period === 'week' ? '%Y-%W' : '%Y-%m'
    const since = period === 'day' ? `-${span} days` : period === 'week' ? `-${span * 7} days` : `-${span} months`
    const q = (table: string, col: string, where = '1=1') =>
      Object.fromEntries(this.db.all<{ k: string; n: number }>(`SELECT strftime('${fmt}', ${col}, 'localtime') AS k, COUNT(*) AS n FROM ${table} WHERE ${col} >= datetime('now', '${since}') AND ${where} GROUP BY k`).map((r) => [r.k, r.n]))
    const found = q('companies', 'created_at')
    const analyzed = q('website_analyses', 'finished_at', "status = 'done'")
    const sent = q('outreach_messages', 'sent_at', "status IN ('sent','delivered','read') AND test_mode = 0")
    const replies = q('communication_events', 'occurred_at', "kind = 'reply'")
    const keys: string[] = []
    const now = new Date()
    for (let i = span - 1; i >= 0; i--) {
      const dt = new Date(now)
      if (period === 'day') dt.setDate(dt.getDate() - i)
      else if (period === 'week') dt.setDate(dt.getDate() - i * 7)
      else dt.setMonth(dt.getMonth() - i)
      const y = dt.getFullYear()
      const m = String(dt.getMonth() + 1).padStart(2, '0')
      const dd = String(dt.getDate()).padStart(2, '0')
      if (period === 'day') keys.push(`${y}-${m}-${dd}`)
      else if (period === 'month') keys.push(`${y}-${m}`)
      else {
        const start = new Date(y, 0, 1)
        const wk = Math.floor(((dt.getTime() - start.getTime()) / 86400000 + ((start.getDay() + 6) % 7)) / 7)
        keys.push(`${y}-${String(wk).padStart(2, '0')}`)
      }
    }
    return [...new Set(keys)].map((k) => ({ k, found: found[k] ?? 0, analyzed: analyzed[k] ?? 0, sent: sent[k] ?? 0, replies: replies[k] ?? 0 }))
  }

  researchReportData(researchId: number): ResearchReportData {
    const d = this.db
    const rp = d.get<{ name: string; sectors: string; locations: string; target_count: number; provider: string | null }>('SELECT * FROM research_projects WHERE id = ?', researchId)
    if (!rp) throw new Error('Araştırma bulunamadı')
    const ids = `(SELECT company_id FROM research_results WHERE research_id = ${Number(researchId)} AND company_id IS NOT NULL AND status != 'duplicate')`
    const totals = {
      found: n(d, `SELECT COUNT(*) AS n FROM research_results WHERE research_id = ? AND status != 'duplicate' AND status != 'skipped'`, researchId),
      duplicates: n(d, "SELECT COUNT(*) AS n FROM research_results WHERE research_id = ? AND status = 'duplicate'", researchId),
      withWebsite: n(d, `SELECT COUNT(*) AS n FROM companies WHERE id IN ${ids} AND website IS NOT NULL`),
      noWebsite: n(d, `SELECT COUNT(*) AS n FROM companies WHERE id IN ${ids} AND website IS NULL`),
      analyzed: n(d, `SELECT COUNT(DISTINCT company_id) AS n FROM website_analyses WHERE company_id IN ${ids} AND status = 'done'`),
      analysisFailed: n(d, `SELECT COUNT(*) AS n FROM companies WHERE id IN ${ids} AND website_status IN ('unreachable','error','blocked_robots')`),
      reviewPending: n(d, `SELECT COUNT(*) AS n FROM companies WHERE id IN ${ids} AND stage_key = 'review'`),
      approved: n(d, `SELECT COUNT(*) AS n FROM outreach_drafts WHERE company_id IN ${ids} AND status IN ('approved','queued','sent')`),
      sent: n(d, `SELECT COUNT(*) AS n FROM outreach_messages WHERE company_id IN ${ids} AND status IN ('sent','delivered','read') AND test_mode = 0`),
      replies: n(d, `SELECT COUNT(DISTINCT company_id) AS n FROM communication_events WHERE company_id IN ${ids} AND kind = 'reply'`)
    }
    const topIssues = d.all<{ title: string; count: number }>(
      `SELECT f.title, COUNT(DISTINCT a.company_id) AS count FROM analysis_findings f JOIN website_analyses a ON a.id = f.analysis_id
       WHERE a.id IN (SELECT MAX(id) FROM website_analyses WHERE status = 'done' AND company_id IN ${ids} GROUP BY company_id) GROUP BY f.code ORDER BY count DESC LIMIT 10`
    )
    const dist = (col: string) => d.all<{ label: string; count: number }>(`SELECT COALESCE(${col}, 'Belirtilmemiş') AS label, COUNT(*) AS count FROM companies WHERE id IN ${ids} GROUP BY label ORDER BY count DESC LIMIT 12`)
    const svc = new Map<string, number>()
    for (const r of d.all<{ potential_services: string }>(`SELECT potential_services FROM companies WHERE id IN ${ids}`)) for (const s of j<string[]>(r.potential_services, [])) svc.set(s, (svc.get(s) ?? 0) + 1)
    const companies = d.all<{ name: string; city: string | null; website: string | null; stage: string; score: number | null; group: string }>(
      `SELECT c.name, c.city, c.website, s.label AS stage, c.opportunity_score AS score, c.priority_group AS "group" FROM companies c LEFT JOIN stages s ON s.key = c.stage_key WHERE c.id IN ${ids} ORDER BY c.opportunity_score DESC NULLS LAST`
    )
    return {
      name: rp.name,
      date: new Date().toISOString(),
      criteria: { sectors: j(rp.sectors, []), locations: j<{ city: string; district?: string }[]>(rp.locations, []).map((l) => (l.district ? `${l.district}/${l.city}` : l.city)), target: rp.target_count, provider: rp.provider ?? '—' },
      totals,
      topIssues,
      bySector: dist('sector'),
      byCity: dist('city'),
      byService: [...svc.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
      companies: companies.map((c) => ({ name: c.name, city: c.city, website: c.website, status: c.stage, score: c.score, group: c.group }))
    }
  }
}
