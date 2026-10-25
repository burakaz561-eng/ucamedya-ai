// Müşteri havuzu (CRM) işlemleri: tekrar kontrolü, kayıt, filtreleme, birleştirme, silme politikası.

import type { Db, Row } from '../database/db'
import { j } from '../database/db'
import type { FileStore } from '../files/folders'
import type { SearchHit } from '@shared/types'
import { cleanBusinessName, companyNameKey, fold, domainOf, emailKey, isOfficialWebsite, normalizeWebsite, phoneKey, FREE_MAIL } from '@shared/text'
import { shortCompanyName } from '@shared/message-templates'

export class CompanyService {
  constructor(
    private db: Db,
    private files: FileStore
  ) {}

  log(companyId: number | null, action: string, detail?: string, actor = 'user', entity?: string, entityId?: number) {
    this.db.run('INSERT INTO activity_logs(company_id, action, detail, actor, entity, entity_id) VALUES (?,?,?,?,?,?)', companyId, action, detail ?? null, actor, entity ?? null, entityId ?? null)
  }

  /** Aynı şirket var mı? Alan adı, sağlayıcı kimliği, telefon veya ad+şehir ile eşleştirir. */
  /**
   * Yinelenen kayıt arar. certain=true: aynı sağlayıcı kaydı, alan adı, telefon, kurumsal e-posta ya da aynı ad + aynı şehir.
   * certain=false: yalnızca ad benzerliği (şehir bilinmiyor ya da kısa ad eşleşmesi) → kullanıcı onayı gerekir.
   */
  findDuplicate(h: { name: string; website?: string | null; phone?: string | null; sourceRef?: string | null; city?: string | null; email?: string | null }): { id: number; reason: string; certain: boolean } | null {
    if (h.sourceRef) {
      const r = this.db.get<{ id: number }>('SELECT id FROM companies WHERE source_ref = ? AND merged_into IS NULL', h.sourceRef)
      if (r) return { id: r.id, reason: 'aynı sağlayıcı kaydı', certain: true }
    }
    const dom = h.website && isOfficialWebsite(h.website) ? domainOf(h.website) : ''
    if (dom) {
      const r = this.db.get<{ id: number }>('SELECT id FROM companies WHERE domain = ? AND merged_into IS NULL', dom)
      if (r) return { id: r.id, reason: `aynı web sitesi (${dom})`, certain: true }
    }
    const pk = h.phone ? phoneKey(h.phone) : ''
    if (pk) {
      const r = this.db.get<{ company_id: number }>("SELECT cc.company_id FROM company_contacts cc JOIN companies c ON c.id = cc.company_id WHERE cc.type IN ('phone','whatsapp') AND cc.value_key = ? AND c.merged_into IS NULL", pk)
      if (r) return { id: r.company_id, reason: 'aynı telefon numarası', certain: true }
    }
    const ek = h.email ? emailKey(h.email) : ''
    if (ek && !FREE_MAIL.test(ek)) {
      const r = this.db.get<{ company_id: number }>("SELECT company_id FROM company_contacts WHERE type = 'email' AND value_key = ?", ek)
      if (r) return { id: r.company_id, reason: 'aynı e-posta adresi', certain: true }
    }
    const nk = companyNameKey(h.name)
    if (nk.length >= 3) {
      const r = this.db.get<{ id: number; city: string | null }>('SELECT id, city FROM companies WHERE name_key = ? AND merged_into IS NULL ORDER BY (city = ?) DESC, id LIMIT 1', nk, h.city ?? null)
      if (r && h.city && r.city && fold(r.city) === fold(h.city)) return { id: r.id, reason: 'aynı şirket adı ve şehir', certain: true }
      if (r && (!h.city || !r.city)) return { id: r.id, reason: 'aynı şirket adı (şehir bilinmiyor)', certain: false }
    }
    // Kısa ad eşleşmesi: "EmlaXo Türkiye - Kocaeli Emlak Ofisi" ↔ "EmlaXo Türkiye"
    const sk = companyNameKey(shortCompanyName(h.name))
    if (sk.length >= 3) {
      // Birebir kısa ad eşitliği 3+ karakterde; önek araması yanlış eşleşmeyi azaltmak için 5+ karakterde
      const rows = this.db.all<{ id: number; name: string; city: string | null }>("SELECT id, name, city FROM companies WHERE merged_into IS NULL AND (name_key = ? OR (length(?) >= 5 AND name_key LIKE ? || '%')) LIMIT 20", sk, sk, sk)
      const r = rows.find((x) => companyNameKey(shortCompanyName(x.name)) === sk && (!h.city || !x.city || fold(x.city) === fold(h.city)))
      if (r) return { id: r.id, reason: `benzer şirket adı ("${shortCompanyName(r.name)}")`, certain: false }
    }
    return null
  }

  addContact(companyId: number, c: { type: string; value: string; kind?: string; label?: string; sourceUrl?: string | null; sourceType: string; verified?: boolean }) {
    const key = c.type === 'email' ? emailKey(c.value) : c.type === 'phone' || c.type === 'whatsapp' ? phoneKey(c.value) : c.value.trim().toLowerCase()
    if (!key) return
    // Ücretsiz e-posta (gmail vb.) firmanın kendi sitesinde veya Google işletme kaydında yayımlanmışsa
    // firmanın iş iletişim adresidir; aksi halde (CSV, elle, bilinmeyen kaynak) kişisel sayılır.
    const published = c.sourceType === 'website' || c.sourceType === 'provider'
    const kind = c.kind ?? (c.type === 'email' && FREE_MAIL.test(key) && !published ? 'personal' : 'corporate')
    this.db.run(
      `INSERT INTO company_contacts(company_id, type, value, value_key, kind, label, source_url, source_type, verified_at)
       VALUES (?,?,?,?,?,?,?,?,?)
       ON CONFLICT(company_id, type, value_key) DO UPDATE SET verified_at = COALESCE(excluded.verified_at, verified_at),
         source_url = CASE WHEN excluded.source_type = 'website' AND source_type <> 'website' THEN excluded.source_url ELSE COALESCE(source_url, excluded.source_url) END,
         source_type = CASE WHEN excluded.source_type = 'website' AND source_type IN ('provider','import') THEN 'website' ELSE source_type END`,
      companyId, c.type, c.type === 'email' ? key : c.value.trim(), key, kind, c.label ?? null, c.sourceUrl ?? null, c.sourceType, c.verified ? new Date().toISOString() : null
    )
  }

  create(h: SearchHit & { sector?: string | null; email?: string; source: string; description?: string }): number {
    h = { ...h, name: cleanBusinessName(h.name) || h.name }
    const site = normalizeWebsite(h.website)
    const official = site && isOfficialWebsite(site) ? site : null
    const r = this.db.run(
      `INSERT INTO companies(name, name_key, sector, city, district, address, website, domain, website_status, source, source_ref, business_status, rating, rating_count, description)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      h.name.trim().slice(0, 200), companyNameKey(h.name), h.sector ?? null, h.city ?? null, h.district ?? null, h.address ?? null,
      official, official ? domainOf(official) : null, official ? 'unknown' : 'none', h.source, h.sourceRef ?? null, h.businessStatus ?? null,
      h.rating ?? null, h.ratingCount ?? null, h.description ?? null
    )
    const id = r.lastInsertRowid
    if (h.phone) this.addContact(id, { type: 'phone', value: h.phone, sourceType: h.source === 'import' || h.source === 'manual' ? h.source : 'provider', sourceUrl: h.mapsUrl ?? null })
    if (h.email) this.addContact(id, { type: 'email', value: h.email, sourceType: h.source === 'import' ? 'import' : 'manual' })
    if (site && !official) this.addContact(id, { type: 'social', value: site, sourceType: 'provider' })
    this.log(id, 'Şirket kaydı oluşturuldu', `Kaynak: ${h.source}`, 'system')
    return id
  }

  list(f: { q?: string; stage?: string; group?: string; sector?: string; city?: string; tag?: string; minScore?: number; websiteStatus?: string; archived?: boolean; researchId?: number; sort?: string; dir?: 'asc' | 'desc'; limit?: number; offset?: number }) {
    const where: string[] = ['c.merged_into IS NULL']
    const p: (string | number)[] = []
    where.push(f.archived ? 'c.archived_at IS NOT NULL' : 'c.archived_at IS NULL')
    if (f.q) {
      where.push("(c.name LIKE ? OR c.domain LIKE ? OR c.city LIKE ? OR EXISTS (SELECT 1 FROM company_contacts x WHERE x.company_id = c.id AND x.value LIKE ?))")
      const q = `%${f.q}%`
      p.push(q, q, q, q)
    }
    if (f.stage) where.push('c.stage_key = ?'), p.push(f.stage)
    if (f.group) where.push('c.priority_group = ?'), p.push(f.group)
    if (f.sector) where.push('c.sector = ?'), p.push(f.sector)
    if (f.city) where.push('c.city = ?'), p.push(f.city)
    if (f.websiteStatus) where.push('c.website_status = ?'), p.push(f.websiteStatus)
    if (f.minScore != null) where.push('c.opportunity_score >= ?'), p.push(f.minScore)
    if (f.tag) where.push('EXISTS (SELECT 1 FROM company_tags ct JOIN tags t ON t.id = ct.tag_id WHERE ct.company_id = c.id AND t.name = ?)'), p.push(f.tag)
    if (f.researchId) where.push('EXISTS (SELECT 1 FROM research_results rr WHERE rr.company_id = c.id AND rr.research_id = ?)'), p.push(f.researchId)
    const sorts: Record<string, string> = { score: 'c.opportunity_score', name: 'c.name', sector: 'c.sector', city: 'c.city', analysis: 'c.last_analysis_at', created: 'c.created_at', stage: 'c.stage_key' }
    const order = `${sorts[f.sort ?? 'created'] ?? 'c.created_at'} ${f.dir === 'asc' ? 'ASC' : 'DESC'} NULLS LAST, c.id DESC`
    const sql = `SELECT c.*, s.label AS stage_label, s.color AS stage_color,
      (SELECT value FROM company_contacts x WHERE x.company_id = c.id AND x.type = 'email' ORDER BY x.kind = 'corporate' DESC, x.id LIMIT 1) AS email,
      (SELECT value FROM company_contacts x WHERE x.company_id = c.id AND x.type IN ('phone','whatsapp') ORDER BY x.type = 'whatsapp' DESC, x.id LIMIT 1) AS phone,
      (SELECT group_concat(t.name, ',') FROM company_tags ct JOIN tags t ON t.id = ct.tag_id WHERE ct.company_id = c.id) AS tags
      FROM companies c LEFT JOIN stages s ON s.key = c.stage_key WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ? OFFSET ?`
    const rows = this.db.all(sql, ...p, f.limit ?? 500, f.offset ?? 0)
    const total = this.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM companies c WHERE ${where.join(' AND ')}`, ...p)?.n ?? 0
    return { rows: rows.map((r) => ({ ...r, score_reasons: j(r.score_reasons, []), potential_services: j(r.potential_services, []) })), total }
  }

  detail(id: number) {
    const c = this.db.get('SELECT c.*, s.label AS stage_label FROM companies c LEFT JOIN stages s ON s.key = c.stage_key WHERE c.id = ?', id)
    if (!c) throw new Error('Şirket bulunamadı')
    const analyses = this.db.all('SELECT id, version, url, final_url, status, scores, summary, ai_summary, error, report_path, folder_path, created_at, finished_at FROM website_analyses WHERE company_id = ? ORDER BY id DESC', id).map((a) => ({ ...a, scores: j(a.scores, {}) }))
    return {
      ...c,
      score_reasons: j(c.score_reasons, []),
      potential_services: j(c.potential_services, []),
      contacts: this.db.all('SELECT * FROM company_contacts WHERE company_id = ? ORDER BY type, id', id),
      permissions: this.db.all('SELECT * FROM outreach_permissions WHERE company_id = ?', id),
      tags: this.db.all<{ name: string }>('SELECT t.name FROM company_tags ct JOIN tags t ON t.id = ct.tag_id WHERE ct.company_id = ?', id).map((t) => t.name),
      notes: this.db.all('SELECT * FROM notes WHERE company_id = ? ORDER BY id DESC', id),
      analyses,
      drafts: this.db.all('SELECT * FROM outreach_drafts WHERE company_id = ? ORDER BY id DESC', id),
      messages: this.db.all('SELECT * FROM outreach_messages WHERE company_id = ? ORDER BY id DESC', id),
      events: this.db.all('SELECT * FROM communication_events WHERE company_id = ? ORDER BY occurred_at DESC LIMIT 200', id),
      offers: this.db.all('SELECT id, number, title, status, total, currency, created_at FROM offers WHERE company_id = ? ORDER BY id DESC', id),
      tasks: this.db.all('SELECT * FROM tasks WHERE company_id = ? ORDER BY status = \'done\', due_at', id),
      files: this.db.all('SELECT * FROM files WHERE company_id = ? ORDER BY created_at DESC LIMIT 300', id),
      activity: this.db.all('SELECT * FROM activity_logs WHERE company_id = ? ORDER BY id DESC LIMIT 200', id),
      researches: this.db.all('SELECT rp.id, rp.name, rr.status, rr.phase FROM research_results rr JOIN research_projects rp ON rp.id = rr.research_id WHERE rr.company_id = ? ORDER BY rr.id DESC', id),
      suppressed: this.isSuppressed(id),
      stageHistory: this.db.all("SELECT h.*, f.label AS from_label, t.label AS to_label FROM stage_history h LEFT JOIN stages f ON f.key = h.from_key LEFT JOIN stages t ON t.key = h.to_key WHERE h.company_id = ? ORDER BY h.id DESC LIMIT 100", id),
      inbound: this.db.all('SELECT * FROM inbound_requests WHERE company_id = ? ORDER BY id DESC', id).map((r) => ({ ...r, answers: j(r.answers, {}), consent: j(r.consent, {}) })),
      concepts: this.db.all('SELECT id, analysis_id, pdf_path, created_at FROM concepts WHERE company_id = ? ORDER BY id DESC', id),
      nextTask: this.db.get("SELECT id, title, due_at, priority FROM tasks WHERE company_id = ? AND status IN ('open','in_progress') ORDER BY due_at IS NULL, due_at, id LIMIT 1", id) ?? null,
      pendingMatches: this.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM match_candidates WHERE status = 'pending' AND (company_id = ? OR candidate_id = ?)", id, id)!.n
    }
  }

  update(id: number, patch: Record<string, unknown>) {
    const allowed = ['name', 'sector', 'city', 'district', 'address', 'website', 'description', 'stage_key', 'owner', 'next_action', 'next_action_at', 'internal_notes', 'contact_purpose', 'protected', 'priority_group', 'contact_preference']
    const sets: string[] = []
    const vals: (string | number | null)[] = []
    for (const [k, v] of Object.entries(patch)) {
      if (!allowed.includes(k)) continue
      if (k === 'website') {
        const w = normalizeWebsite(v as string)
        sets.push('website = ?', 'domain = ?', 'website_status = ?')
        vals.push(w, w ? domainOf(w) : null, w ? 'unknown' : 'none')
        continue
      }
      if (k === 'name') {
        sets.push('name_key = ?')
        vals.push(companyNameKey(String(v)))
      }
      sets.push(`${k} = ?`)
      vals.push(typeof v === 'boolean' ? (v ? 1 : 0) : (v as string | number | null))
    }
    if (!sets.length) return
    const before = this.db.get<{ stage_key: string }>('SELECT stage_key FROM companies WHERE id = ?', id)
    this.db.run(`UPDATE companies SET ${sets.join(', ')}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`, ...vals, id)
    if (patch.stage_key && before?.stage_key !== patch.stage_key) {
      const lbl = this.db.get<{ label: string }>('SELECT label FROM stages WHERE key = ?', patch.stage_key as string)?.label
      this.log(id, 'Aşama değişti', `${before?.stage_key} → ${lbl ?? patch.stage_key}`)
      if (patch.stage_key === 'do_not_contact') this.suppressCompany(id, 'Aşama: İletişim istemiyor', 'user')
    } else this.log(id, 'Şirket bilgileri güncellendi', Object.keys(patch).join(', '))
  }

  setTags(id: number, tags: string[]) {
    this.db.tx(() => {
      this.db.run('DELETE FROM company_tags WHERE company_id = ?', id)
      for (const t of [...new Set(tags.map((x) => x.trim()).filter(Boolean))].slice(0, 30)) {
        this.db.run('INSERT OR IGNORE INTO tags(name) VALUES (?)', t.slice(0, 40))
        const tid = this.db.get<{ id: number }>('SELECT id FROM tags WHERE name = ?', t.slice(0, 40))!.id
        this.db.run('INSERT OR IGNORE INTO company_tags(company_id, tag_id) VALUES (?,?)', id, tid)
      }
    })
  }

  addNote(id: number, body: string, author?: string) {
    this.db.run('INSERT INTO notes(company_id, body, author) VALUES (?,?,?)', id, body.slice(0, 10000), author ?? null)
    this.log(id, 'Not eklendi')
  }

  // ---------- Ret listesi ----------
  isSuppressed(companyId: number): boolean {
    const c = this.db.get<{ domain: string | null; stage_key: string }>('SELECT domain, stage_key FROM companies WHERE id = ?', companyId)
    if (!c) return false
    if (c.stage_key === 'do_not_contact') return true
    if (c.domain && this.db.get("SELECT 1 FROM suppression_list WHERE type = 'domain' AND value_key = ?", c.domain)) return true
    if (this.db.get("SELECT 1 FROM outreach_permissions WHERE company_id = ? AND status = 'opted_out'", companyId)) return true
    return !!this.db.get(
      `SELECT 1 FROM company_contacts cc JOIN suppression_list s ON s.value_key = cc.value_key AND ((s.type = 'email' AND cc.type = 'email') OR (s.type = 'phone' AND cc.type IN ('phone','whatsapp'))) WHERE cc.company_id = ?`,
      companyId
    )
  }

  isRecipientSuppressed(type: 'email' | 'phone', key: string): boolean {
    if (this.db.get('SELECT 1 FROM suppression_list WHERE type = ? AND value_key = ?', type, key)) return true
    if (type === 'email') {
      const dom = key.split('@')[1]
      if (dom && this.db.get("SELECT 1 FROM suppression_list WHERE type = 'domain' AND value_key = ?", dom)) return true
    }
    return false
  }

  suppressCompany(id: number, reason: string, source: string) {
    this.db.tx(() => {
      const c = this.db.get<{ domain: string | null }>('SELECT domain FROM companies WHERE id = ?', id)
      if (c?.domain) this.db.run('INSERT OR IGNORE INTO suppression_list(type, value_key, reason, source, company_id) VALUES (?,?,?,?,?)', 'domain', c.domain, reason, source, id)
      for (const cc of this.db.all<{ type: string; value_key: string }>("SELECT type, value_key FROM company_contacts WHERE company_id = ? AND type IN ('email','phone','whatsapp')", id)) {
        this.db.run('INSERT OR IGNORE INTO suppression_list(type, value_key, reason, source, company_id) VALUES (?,?,?,?,?)', cc.type === 'email' ? 'email' : 'phone', cc.value_key, reason, source, id)
      }
      for (const ch of ['email', 'whatsapp']) {
        this.db.run(
          `INSERT INTO outreach_permissions(company_id, channel, status, evidence, recorded_by) VALUES (?,?,?,?,?)
           ON CONFLICT(company_id, channel) DO UPDATE SET status = 'opted_out', evidence = excluded.evidence, recorded_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
          id, ch, 'opted_out', reason, source
        )
      }
      this.db.run("UPDATE companies SET stage_key = 'do_not_contact', priority_group = 'opted_out', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?", id)
      this.db.run("UPDATE outreach_messages SET status = 'cancelled', error = 'Alıcı ret listesinde' WHERE company_id = ? AND status = 'queued'", id)
      this.db.run("UPDATE outreach_drafts SET status = 'rejected' WHERE company_id = ? AND status IN ('draft','approved','queued')", id)
    })
    this.log(id, 'Ret listesine eklendi', reason, source)
  }

  // ---------- Birleştirme ve tekrar bulma ----------
  /** Emin olunmayan eşleşmeyi onay kuyruğuna ekler. */
  addMatchCandidate(companyId: number, candidateId: number, reason: string) {
    if (companyId === candidateId) return
    const [a, b] = companyId < candidateId ? [companyId, candidateId] : [candidateId, companyId]
    this.db.run('INSERT OR IGNORE INTO match_candidates(company_id, candidate_id, reason) VALUES (?,?,?)', a, b, reason)
  }

  /** Eşleşme kararı: ayrı kayıt olarak bırak (bir daha önerilmez). */
  keepSeparate(a: number, b: number) {
    const [x, y] = a < b ? [a, b] : [b, a]
    this.db.run("INSERT INTO match_candidates(company_id, candidate_id, reason, status, decided_at) VALUES (?,?, 'kullanıcı kararı', 'separate', strftime('%Y-%m-%dT%H:%M:%fZ','now')) ON CONFLICT(company_id, candidate_id) DO UPDATE SET status = 'separate', decided_at = excluded.decided_at", x, y)
    this.log(x, 'Eşleşme reddedildi', `#${y} ayrı bir şirket olarak bırakıldı`)
  }

  pendingMatchCount(): number {
    return this.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM match_candidates m JOIN companies a ON a.id = m.company_id JOIN companies b ON b.id = m.candidate_id WHERE m.status = 'pending' AND a.merged_into IS NULL AND b.merged_into IS NULL")!.n
  }

  duplicates(): { a: Row; b: Row; reason: string; uncertain?: boolean }[] {
    const out: { a: Row; b: Row; reason: string; uncertain?: boolean }[] = []
    const separate = new Set(this.db.all<{ company_id: number; candidate_id: number }>("SELECT company_id, candidate_id FROM match_candidates WHERE status = 'separate'").map((r) => `${r.company_id}-${r.candidate_id}`))
    for (const p of this.db.all<{ a: number; b: number; reason: string }>("SELECT m.company_id AS a, m.candidate_id AS b, m.reason FROM match_candidates m JOIN companies c1 ON c1.id = m.company_id JOIN companies c2 ON c2.id = m.candidate_id WHERE m.status = 'pending' AND c1.merged_into IS NULL AND c2.merged_into IS NULL")) {
      const a = this.db.get('SELECT id, name, city, domain, created_at FROM companies WHERE id = ?', p.a)
      const b = this.db.get('SELECT id, name, city, domain, created_at FROM companies WHERE id = ?', p.b)
      if (a && b) out.push({ a, b, reason: `${p.reason} — onayınız gerekiyor`, uncertain: true })
    }
    const pairs = this.db.all<{ a: number; b: number; reason: string }>(
      `SELECT c1.id AS a, c2.id AS b, 'aynı web sitesi' AS reason FROM companies c1 JOIN companies c2 ON c1.domain = c2.domain AND c1.id < c2.id
         WHERE c1.domain IS NOT NULL AND c1.merged_into IS NULL AND c2.merged_into IS NULL
       UNION SELECT c1.id, c2.id, 'aynı ad ve şehir' FROM companies c1 JOIN companies c2 ON c1.name_key = c2.name_key AND IFNULL(c1.city,'') = IFNULL(c2.city,'') AND c1.id < c2.id
         WHERE c1.merged_into IS NULL AND c2.merged_into IS NULL
       UNION SELECT x1.company_id, x2.company_id, 'aynı telefon' FROM company_contacts x1 JOIN company_contacts x2 ON x1.value_key = x2.value_key AND x1.type IN ('phone','whatsapp') AND x2.type IN ('phone','whatsapp') AND x1.company_id < x2.company_id
         JOIN companies c1 ON c1.id = x1.company_id JOIN companies c2 ON c2.id = x2.company_id WHERE c1.merged_into IS NULL AND c2.merged_into IS NULL
       LIMIT 200`
    )
    for (const p of pairs) {
      if (separate.has(`${Math.min(p.a, p.b)}-${Math.max(p.a, p.b)}`) || out.some((o) => (o.a.id === p.a && o.b.id === p.b) || (o.a.id === p.b && o.b.id === p.a))) continue
      const a = this.db.get('SELECT id, name, city, domain, created_at FROM companies WHERE id = ?', p.a)
      const b = this.db.get('SELECT id, name, city, domain, created_at FROM companies WHERE id = ?', p.b)
      if (a && b) out.push({ a, b, reason: p.reason })
    }
    return out
  }

  /** `drop` kaydının ilişkili tüm verilerini `keep` kaydına taşır; `drop` "birleştirildi" olarak işaretlenir. */
  merge(keep: number, drop: number) {
    if (keep === drop) throw new Error('Aynı kayıt birleştirilemez')
    this.db.tx(() => {
      for (const cc of this.db.all<{ type: string; value: string; kind: string; label: string; source_url: string; source_type: string; verified_at: string }>('SELECT * FROM company_contacts WHERE company_id = ?', drop)) {
        this.addContact(keep, { type: cc.type, value: cc.value, kind: cc.kind, label: cc.label, sourceUrl: cc.source_url, sourceType: cc.source_type, verified: !!cc.verified_at })
      }
      for (const t of ['research_results', 'website_analyses', 'screenshots', 'outreach_drafts', 'outreach_messages', 'communication_events', 'offers', 'tasks', 'notes', 'files', 'activity_logs', 'inbound_requests', 'concepts']) {
        this.db.run(`UPDATE ${t} SET company_id = ? WHERE company_id = ?`, keep, drop)
      }
      this.db.run('INSERT OR IGNORE INTO company_tags(company_id, tag_id) SELECT ?, tag_id FROM company_tags WHERE company_id = ?', keep, drop)
      this.db.run('INSERT OR IGNORE INTO outreach_permissions(company_id, channel, status, legal_basis, purpose, evidence, recorded_by, recorded_at) SELECT ?, channel, status, legal_basis, purpose, evidence, recorded_by, recorded_at FROM outreach_permissions WHERE company_id = ?', keep, drop)
      const k = this.db.get<Row>('SELECT * FROM companies WHERE id = ?', keep)!
      const d = this.db.get<Row>('SELECT * FROM companies WHERE id = ?', drop)!
      for (const col of ['sector', 'city', 'district', 'address', 'website', 'domain', 'description', 'source_ref', 'business_status']) {
        if (k[col] == null && d[col] != null) this.db.run(`UPDATE companies SET ${col} = ? WHERE id = ?`, d[col] as string, keep)
      }
      this.db.run("UPDATE match_candidates SET status = 'merged', decided_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE status = 'pending' AND company_id = ? AND candidate_id = ?", Math.min(keep, drop), Math.max(keep, drop))
      this.db.run("UPDATE companies SET merged_into = ?, archived_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?", keep, drop)
    })
    this.log(keep, 'Kayıt birleştirildi', `#${drop} bu kayda birleştirildi`)
  }

  archive(ids: number[], archived: boolean) {
    for (const id of ids) {
      this.db.run(`UPDATE companies SET archived_at = ${archived ? "strftime('%Y-%m-%dT%H:%M:%fZ','now')" : 'NULL'} WHERE id = ?`, id)
      this.log(id, archived ? 'Arşivlendi' : 'Arşivden çıkarıldı')
    }
  }

  /**
   * Kalıcı silme politikası:
   *  - Korumalı kayıtlar, kazanılmış müşteriler ve teklifi olan şirketler silinemez (önce arşivleyin).
   *  - Analizler, ekran görüntüsü kayıtları, taslaklar, mesaj geçmişi, görevler ve notlar birlikte silinir.
   *  - Şirket klasörü diskten silinmez, veri klasöründeki "_Silinenler" klasörüne taşınır.
   *  - Ret listesi kayıtları ASLA silinmez (silinen şirkete yanlışlıkla yeniden yazılmasın diye).
   */
  hardDelete(id: number): { movedTo: string | null } {
    const c = this.db.get<{ protected: number; stage_key: string; name: string }>('SELECT protected, stage_key, name FROM companies WHERE id = ?', id)
    if (!c) throw new Error('Şirket bulunamadı')
    if (c.protected) throw new Error('Bu kayıt korumalı olarak işaretlenmiş. Önce korumayı kaldırın.')
    if (c.stage_key === 'won') throw new Error('Kazanılmış müşteri kayıtları kalıcı olarak silinemez; arşivleyebilirsiniz.')
    if (this.db.get('SELECT 1 FROM offers WHERE company_id = ?', id)) throw new Error('Bu şirkete ait teklif kayıtları var; kalıcı silme yerine arşivleyin.')
    const movedTo = this.files.moveCompanyFolderToTrash(id)
    this.db.tx(() => {
      this.db.run('UPDATE suppression_list SET company_id = NULL WHERE company_id = ?', id)
      this.db.run('DELETE FROM companies WHERE id = ?', id)
    })
    this.log(null, 'Şirket kalıcı olarak silindi', `${c.name} (#${id})${movedTo ? ` — klasör taşındı: ${movedTo}` : ''}`)
    return { movedTo }
  }
}
