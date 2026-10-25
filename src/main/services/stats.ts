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

  /**
   * Satış analitiği. Her metrik gerçek kayıtlardan hesaplanır; hesaplamak için gereken veri kaynağı yoksa
   * value=null ve açıklama döner (0 ile "veri yok" ayrı tutulur). days verilirse yalnızca o dönem.
   */
  salesMetrics(days?: number) {
    const d = this.db
    const since = days ? new Date(Date.now() - days * 86400000).toISOString() : '0000'
    const cnt = (sql: string, ...p: (string | number)[]) => d.get<{ n: number }>(sql, ...p)?.n ?? 0
    const imap = !!d.get("SELECT 1 FROM email_accounts WHERE status = 'ok' AND imap_host IS NOT NULL")
    const sentAny = cnt("SELECT COUNT(*) AS n FROM outreach_messages WHERE status IN ('sent','delivered','read') AND test_mode = 0")
    const site = d.get<{ value: string }>("SELECT value FROM app_settings WHERE key = 'settings'")?.value ?? ''
    const leadsOn = !!d.get('SELECT 1 FROM inbound_requests LIMIT 1') || /"siteUrl":"https?:/.test(site)
    const m = (key: string, label: string, value: number | null, note?: string) => ({ key, label, value, note: note ?? null })
    const sent = cnt("SELECT COUNT(*) AS n FROM outreach_messages WHERE status IN ('sent','delivered','read') AND test_mode = 0 AND COALESCE(sent_at, queued_at) >= ?", since)
    const verified = cnt("SELECT COUNT(*) AS n FROM outreach_messages WHERE test_mode = 0 AND COALESCE(sent_at, queued_at) >= ? AND (status IN ('delivered','read') OR (status = 'sent' AND provider_message_id LIKE 'web:%'))", since)
    const replies = cnt("SELECT COUNT(DISTINCT company_id) AS n FROM communication_events WHERE kind = 'reply' AND occurred_at >= ?", since)
    const reachedStage = (keys: string[]) => cnt(`SELECT COUNT(DISTINCT company_id) AS n FROM stage_history WHERE to_key IN (${keys.map(() => '?').join(',')}) AND at >= ?`, ...keys, since)
    const positive = cnt("SELECT COUNT(DISTINCT h.company_id) AS n FROM stage_history h WHERE h.to_key IN ('meeting','offer_prepared','offer_sent','negotiation','won') AND h.at >= ? AND EXISTS (SELECT 1 FROM communication_events e WHERE e.company_id = h.company_id AND e.direction = 'in')", since)
    const metrics = [
      m('found', 'Bulunan şirket', cnt('SELECT COUNT(*) AS n FROM companies WHERE merged_into IS NULL AND created_at >= ?', since)),
      m('analyzed', 'Analizi tamamlanan şirket', cnt("SELECT COUNT(DISTINCT company_id) AS n FROM website_analyses WHERE status = 'done' AND company_id IS NOT NULL AND created_at >= ?", since)),
      m('eligible', 'İletişime uygun şirket', cnt(`SELECT COUNT(*) AS n FROM companies c WHERE c.merged_into IS NULL AND c.archived_at IS NULL AND c.created_at >= ?
          AND COALESCE(c.priority_group, '') NOT IN ('not_suitable','opted_out') AND c.stage_key NOT IN ('do_not_contact','lost','won')
          AND NOT EXISTS (SELECT 1 FROM suppression_list s WHERE s.company_id = c.id)
          AND EXISTS (SELECT 1 FROM company_contacts x WHERE x.company_id = c.id AND x.type IN ('email','phone','whatsapp') AND x.kind = 'corporate')`, since), 'Kurumsal e-posta veya telefonu olan, ret listesinde olmayan, kazanılmamış/kaybedilmemiş şirketler.'),
      m('sent', 'Gönderilen mesaj', sent, 'Test gönderimleri hariç.'),
      m('verified', 'Teslimi doğrulanan mesaj', sentAny ? verified : null, sentAny ? 'Webmail/WhatsApp Web\'de gönderim ekranda doğrulananlar ve teslim bilgisi gelenler. WhatsApp masaüstünde "gönderdim" onayı doğrulama sayılmaz.' : 'Henüz gerçek gönderim yok.'),
      m('replies', 'Gelen yanıt (şirket)', imap || replies ? replies : null, imap ? undefined : 'Otomatik yanıt takibi (IMAP) bağlı değil; yalnızca elle kaydedilen yanıtlar sayılır.'),
      m('positive', 'Olumlu yanıt', imap || replies || positive ? positive : null, 'Bize yazdıktan sonra görüşme, teklif ya da kazanıldı aşamasına geçen şirketler.'),
      m('meetings', 'Planlanan görüşme', reachedStage(['meeting'])),
      m('offers_sent', 'Gönderilen teklif', cnt("SELECT COUNT(*) AS n FROM offers WHERE status IN ('sent','negotiation','won','lost') AND updated_at >= ?", since)),
      m('won', 'Kazanılan müşteri', reachedStage(['won'])),
      m('lost', 'Kaybedilen fırsat', reachedStage(['lost'])),
      m('web_leads', 'Web sitesinden gelen talep', leadsOn ? cnt('SELECT COUNT(*) AS n FROM inbound_requests WHERE received_at >= ?', since) : null, leadsOn ? undefined : 'Web sitesi bağlantısı kurulmadı (Web Sitesi Talepleri → Bağlantı ayarları).'),
      m('google_opps', 'Google araştırmasından gelen fırsat', cnt("SELECT COUNT(*) AS n FROM companies WHERE merged_into IS NULL AND source IN ('google_browser','google_places','serpapi','brave') AND priority_group IN ('priority','high_fit') AND created_at >= ?", since), '"Öncelikli fırsat" ya da "Yüksek hizmet uyumu" grubundakiler.')
    ]
    const offerSum = (statuses: string[]) => d.get<{ v: number; n: number }>(`SELECT COALESCE(SUM(total),0) AS v, COUNT(*) AS n FROM offers WHERE status IN (${statuses.map(() => '?').join(',')}) AND updated_at >= ?`, ...statuses, since)!
    const est = offerSum(['sent', 'negotiation'])
    const won = offerSum(['won'])
    return {
      metrics,
      revenue: {
        estimated: est.n ? est.v : null,
        estimatedCount: est.n,
        realized: won.n ? won.v : null,
        realizedCount: won.n,
        note: 'Tahminî gelir: gönderilmiş ve müzakeredeki tekliflerin toplamı (kazanılacağı anlamına gelmez). Gerçekleşen gelir: "kazanıldı" işaretlenen teklifler. Tahsilat bilgisi tutulmaz.'
      },
      byService: d.all("SELECT COALESCE(service, 'Belirtilmemiş') AS k, COUNT(*) AS n FROM inbound_requests WHERE received_at >= ? GROUP BY k ORDER BY n DESC", since),
      offeredServices: d.all("SELECT i.name AS k, COUNT(DISTINCT i.offer_id) AS n FROM offer_items i JOIN offers o ON o.id = i.offer_id WHERE o.status <> 'draft' AND o.updated_at >= ? GROUP BY i.name ORDER BY n DESC LIMIT 10", since),
      bySource: d.all("SELECT CASE WHEN source = 'website' THEN 'Web sitesi talebi' WHEN source IN ('google_browser','google_places','serpapi','brave') THEN 'Google araştırması' WHEN source = 'import' THEN 'CSV içe aktarma' ELSE 'Elle eklendi' END AS k, COUNT(*) AS n FROM companies WHERE merged_into IS NULL AND created_at >= ? GROUP BY k ORDER BY n DESC", since),
      bySector: d.all("SELECT COALESCE(sector,'Belirtilmemiş') AS k, COUNT(*) AS n FROM companies WHERE merged_into IS NULL AND created_at >= ? GROUP BY k ORDER BY n DESC LIMIT 12", since)
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
