// İletişim Merkezi: taslaklar, onay, gönderim kuyruğu (duraklat/devam/iptal), kanal gönderimi,
// gelen yanıt eşleştirme ve ret listesi uygulaması.
//
// Güvenlik ilkeleri:
//  - Onaylanmamış taslak gönderilmez (ayar kapatılmadıkça).
//  - Her mesajın benzersiz bir idempotency anahtarı vardır → aynı alıcıya aynı kampanyada ikinci kez gönderilemez.
//  - Duraklatıldığında yeni mesaj gönderilmez; devam edildiğinde her mesaj yeniden uygunluk kontrolünden geçer.
//  - Gönderim sırasında uygulama kapanırsa "gönderiliyor" kalan kayıt otomatik yeniden GÖNDERİLMEZ (durum belirsiz olarak işaretlenir).
//  - Test modunda hiçbir gerçek şirkete mesaj gitmez; tüm iletiler test alıcısına yönlendirilir.
//  - Gönderim aralıkları yalnızca sağlayıcı sınırları ve güvenilirlik içindir; rastgele bekleme / tespit atlatma YOKTUR.

import { shell } from 'electron'
import { copyImageToClipboard } from './image-clipboard'
import { imageDataUri, imageFor } from './message-image'
import type { Db } from '../database/db'
import { j } from '../database/db'
import type { CompanyService } from '../services/companies'
import { rankContacts, contactSourceLabel, type ContactRow } from './contact-rank'
import type { SettingsService } from '../services/settings'
import type { SecretStore } from '../security/secrets'
import type { FileStore } from '../files/folders'
import type { AiProvider } from '../integrations/ai/ai-client'
import { aiDraft, rewriteDraft, templateDraft, type DraftContext } from './drafting'
import { checkEligibility, idempotencyKey, isOptOutReply } from './compliance'
import { clickToChatUrl, fetchInbox, sendEmail, whatsappDesktopUrl, whatsappSendTemplate, type EmailAccount } from './channels'
import { emailKey, isTrMobile, phoneKey } from '@shared/text'
import { join } from 'node:path'
import { log } from '../logger'
import type { AgentBrowser } from '../automation/agent-browser'
import type { WhatsAppWeb } from '../automation/whatsapp-web'
import type { GmailWeb } from '../automation/gmail-web'
import type { RoundcubeWeb } from '../automation/roundcube-web'

export interface WebTransports {
  agent: AgentBrowser
  wa: WhatsAppWeb
  gmail: GmailWeb
  rc: RoundcubeWeb
  ensureStarted: () => Promise<void>
  available: () => boolean
}

export interface ConfirmRequest {
  messageId: number
  channel: 'email' | 'whatsapp'
  company: string
  recipient: string
  recipientVerified: boolean
  verifyNote: string | null
  subject: string | null
  body: string
  attachment: string | null
  /** Mesaja eklenen görselin önizlemesi (veri adresi) ve kullanıcıya not */
  image?: string | null
  imageNote?: string | null
  preview: string | null
  testMode: boolean
  /** true: gönderimi kullanıcı WhatsApp uygulamasında kendisi yapar, burada yalnızca sonucu bildirir */
  manualSend?: boolean
  /** Şirketin gerçek iletişim bilgisi (test modunda mesaj buraya değil test alıcısına gider) */
  realRecipient?: string
  recipientSource?: string | null
}

type Channel = 'email' | 'whatsapp'

export class OutreachService {
  private loops = new Map<Channel, boolean>()
  private pendingConfirm = new Map<number, (d: 'send' | 'skip' | 'stop') => void>()
  private web: WebTransports | null = null
  private emitConfirm: (r: ConfirmRequest | { messageId: number; closed: true }) => void = () => undefined

  attachWeb(web: WebTransports, emitConfirm: (r: ConfirmRequest | { messageId: number; closed: true }) => void) {
    this.web = web
    this.emitConfirm = emitConfirm
  }

  /** Arayüzdeki onay penceresinden gelen karar. */
  decide(messageId: number, decision: 'send' | 'skip' | 'stop') {
    const f = this.pendingConfirm.get(messageId)
    if (!f) throw new Error('Bu mesaj için bekleyen bir onay yok.')
    this.pendingConfirm.delete(messageId)
    f(decision)
  }

  pendingConfirmations() {
    return [...this.pendingConfirm.keys()]
  }

  transport(channel: Channel): 'webmail' | 'gmail_web' | 'smtp' | 'whatsapp_web' | 'whatsapp_desktop' | 'cloud_api' | 'click_to_chat' {
    const o = this.settings.get().outreach
    if (channel === 'email') return o.emailChannel === 'smtp' ? 'smtp' : o.emailChannel === 'webmail' ? 'webmail' : 'gmail_web'
    if (o.whatsappChannel === 'web') return 'whatsapp_web'
    if (o.whatsappChannel === 'desktop') return 'whatsapp_desktop'
    return o.whatsappChannel === 'cloud_api' ? 'cloud_api' : 'click_to_chat'
  }

  constructor(
    private db: Db,
    private companies: CompanyService,
    private settings: SettingsService,
    private secrets: SecretStore,
    private files: FileStore,
    private getAi: () => AiProvider | null,
    private emitChange: (scope: string) => void
  ) {}

  recover() {
    this.db.run("UPDATE outreach_messages SET status = 'failed', error = 'Durum belirsiz: uygulama gönderim sırasında kapandı. Alıcıya ulaşmış olabilir; otomatik yeniden gönderilmez.' WHERE status = 'sending'")
    // Onay beklerken kapanan mesajlar gönderilmemiştir: güvenle yeniden kuyruğa döner
    this.db.run("UPDATE outreach_messages SET status = 'queued', error = NULL WHERE status IN ('awaiting_confirm','preparing')")
    for (const ch of ['email', 'whatsapp'] as Channel[]) if (this.queueState(ch) === 'running') this.settings.setValue(`queue:${ch}`, 'paused')
  }

  // ---------------- Taslaklar ----------------
  private context(companyId: number, channel: Channel, tone: string): DraftContext {
    const c = this.db.get<{ name: string; sector: string | null; city: string | null; website: string | null; website_status: string }>('SELECT name, sector, city, website, website_status FROM companies WHERE id = ?', companyId)
    if (!c) throw new Error('Şirket bulunamadı')
    const a = this.db.get<{ id: number }>("SELECT id FROM website_analyses WHERE company_id = ? AND status = 'done' ORDER BY id DESC LIMIT 1", companyId)
    const findings = a ? this.db.all<DraftContext['findings'][number]>('SELECT code, category, title, evidence, severity, recommendation, certainty FROM analysis_findings WHERE analysis_id = ? ORDER BY CASE severity WHEN \'high\' THEN 0 WHEN \'medium\' THEN 1 ELSE 2 END', a.id) : []
    const s = this.settings.get()
    return {
      company: { name: c.name, sector: c.sector, city: c.city, website: c.website, websiteStatus: c.website_status },
      findings,
      services: this.db.all<{ name: string }>('SELECT name FROM services WHERE active = 1 ORDER BY position').map((x) => x.name),
      brand: { name: s.brand.name, website: s.brand.website, email: s.brand.email, phone: s.brand.phone, signature: s.brand.signature, senderName: s.brand.senderName },
      channel,
      tone,
      optOutLine: s.outreach.includeOptOutLine ? s.outreach.optOutText : null,
      templates: s.outreach.templates
    }
  }

  async createDraft(companyId: number, channel: Channel, tone = 'professional', useAi = true) {
    if (this.companies.isSuppressed(companyId)) throw new Error('Bu şirket ret listesinde; taslak oluşturulmaz.')
    const ctx = this.context(companyId, channel, tone)
    const ai = useAi && this.settings.get().ai.enabled ? this.getAi() : null
    const out = useAi ? await aiDraft(ai, ctx) : templateDraft(ctx)
    const analysisId = this.db.get<{ id: number }>("SELECT id FROM website_analyses WHERE company_id = ? AND status = 'done' ORDER BY id DESC LIMIT 1", companyId)?.id ?? null
    const r = this.db.run('INSERT INTO outreach_drafts(company_id, analysis_id, channel, tone, subject, body, generator, used_findings) VALUES (?,?,?,?,?,?,?,?)', companyId, analysisId, channel, tone, out.subject, out.body, out.generator, JSON.stringify(out.usedFindings))
    this.writeDraftFile(companyId, channel, out.subject, out.body)
    this.companies.log(companyId, `${channel === 'email' ? 'E-posta' : 'WhatsApp'} taslağı oluşturuldu`, out.warning ?? (out.generator === 'ai' ? 'Yapay zekâ ile' : 'Şablon ile'), 'system', 'draft', r.lastInsertRowid)
    this.emitChange('drafts')
    return { id: r.lastInsertRowid, warning: out.warning }
  }

  async createDrafts(companyId: number, channels: Channel[], tone: string) {
    const hasEmail = !!this.db.get("SELECT 1 FROM company_contacts WHERE company_id = ? AND type = 'email'", companyId)
    const hasPhone = !!this.db.get("SELECT 1 FROM company_contacts WHERE company_id = ? AND type IN ('phone','whatsapp')", companyId)
    for (const ch of channels) {
      if ((ch === 'email' && !hasEmail) || (ch === 'whatsapp' && !hasPhone)) continue
      if (this.db.get("SELECT 1 FROM outreach_drafts WHERE company_id = ? AND channel = ? AND status IN ('draft','approved')", companyId, ch)) continue
      await this.createDraft(companyId, ch, tone)
    }
  }

  private writeDraftFile(companyId: number, channel: Channel, subject: string | null, body: string) {
    try {
      const p = join(this.files.companyDir(companyId), 'outreach', channel === 'email' ? 'email-draft.txt' : 'whatsapp-draft.txt')
      this.files.writeText(p, `${subject ? `Konu: ${subject}\n\n` : ''}${body}`)
      this.files.register({ path: p, kind: 'draft', companyId })
    } catch {
      /* dosya yazılamazsa taslak veritabanında kalır */
    }
  }

  /** Gönderilmemiş (taslak / onaylı) taslakları güncel şablon veya yapay zekâ ile yeniden üretir. */
  async regenerateDrafts(): Promise<number> {
    const rows = this.db.all<{ id: number; company_id: number; channel: Channel; tone: string | null }>("SELECT id, company_id, channel, tone FROM outreach_drafts WHERE status IN ('draft','approved')")
    let n = 0
    for (const d of rows) {
      if (this.companies.isSuppressed(d.company_id)) continue
      const ctx = this.context(d.company_id, d.channel, d.tone ?? 'professional')
      const ai = this.settings.get().ai.enabled ? this.getAi() : null
      const out = await aiDraft(ai, ctx)
      this.db.run("UPDATE outreach_drafts SET subject = ?, body = ?, generator = ?, used_findings = ?, status = 'draft', approved_at = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?", out.subject, out.body, out.generator, JSON.stringify(out.usedFindings), d.id)
      this.writeDraftFile(d.company_id, d.channel, out.subject, out.body)
      n++
    }
    this.emitChange('drafts')
    return n
  }

  updateDraft(id: number, patch: { subject?: string | null; body?: string; tone?: string }) {
    const d = this.db.get<{ company_id: number; channel: Channel; status: string }>('SELECT company_id, channel, status FROM outreach_drafts WHERE id = ?', id)
    if (!d) throw new Error('Taslak bulunamadı')
    if (d.status === 'sent' || d.status === 'queued') throw new Error('Kuyruğa alınmış veya gönderilmiş taslak düzenlenemez')
    this.db.run("UPDATE outreach_drafts SET subject = COALESCE(?, subject), body = COALESCE(?, body), tone = COALESCE(?, tone), generator = CASE WHEN ? IS NOT NULL THEN 'manual' ELSE generator END, status = 'draft', approved_at = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?", patch.subject ?? null, patch.body ?? null, patch.tone ?? null, patch.body ?? null, id)
    const nd = this.db.get<{ subject: string | null; body: string }>('SELECT subject, body FROM outreach_drafts WHERE id = ?', id)!
    this.writeDraftFile(d.company_id, d.channel, nd.subject, nd.body)
  }

  async rewrite(id: number, action: string) {
    const d = this.db.get<{ company_id: number; channel: Channel; tone: string | null; subject: string | null; body: string }>('SELECT company_id, channel, tone, subject, body FROM outreach_drafts WHERE id = ?', id)
    if (!d) throw new Error('Taslak bulunamadı')
    const ctx = this.context(d.company_id, d.channel, d.tone ?? 'professional')
    const out = await rewriteDraft(this.settings.get().ai.enabled ? this.getAi() : null, ctx, { subject: d.subject, body: d.body }, action)
    const newChannel: Channel = action === 'to_email' ? 'email' : action === 'to_whatsapp' ? 'whatsapp' : d.channel
    if (newChannel !== d.channel) {
      const r = this.db.run("INSERT INTO outreach_drafts(company_id, channel, tone, subject, body, generator, used_findings) VALUES (?,?,?,?,?, 'ai', ?)", d.company_id, newChannel, d.tone, out.subject, out.body, JSON.stringify(out.usedFindings))
      return { id: r.lastInsertRowid, created: true }
    }
    this.db.run("UPDATE outreach_drafts SET subject = ?, body = ?, generator = 'ai', used_findings = ?, status = 'draft', approved_at = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?", out.subject, out.body, JSON.stringify(out.usedFindings), id)
    this.writeDraftFile(d.company_id, d.channel, out.subject, out.body)
    return { id, created: false }
  }

  listDrafts(f: { channel?: string; status?: string; companyId?: number }) {
    const w: string[] = ['1=1']
    const p: (string | number)[] = []
    if (f.channel) w.push('d.channel = ?'), p.push(f.channel)
    if (f.status) w.push('d.status = ?'), p.push(f.status)
    if (f.companyId) w.push('d.company_id = ?'), p.push(f.companyId)
    return this.db.all(
      `SELECT d.*, c.name AS company_name, c.website, c.city, c.sector, c.opportunity_score,
        (SELECT value FROM company_contacts x WHERE x.company_id = c.id AND x.type = 'email' ORDER BY x.kind = 'corporate' DESC, x.id LIMIT 1) AS email,
        (SELECT value FROM company_contacts x WHERE x.company_id = c.id AND x.type IN ('whatsapp','phone') ORDER BY x.type = 'whatsapp' DESC, x.id LIMIT 1) AS phone,
        (SELECT status FROM outreach_messages m WHERE m.draft_id = d.id ORDER BY m.id DESC LIMIT 1) AS send_status,
        (SELECT COALESCE(m.status_at, m.sent_at, m.queued_at) FROM outreach_messages m WHERE m.draft_id = d.id ORDER BY m.id DESC LIMIT 1) AS last_action_at
       FROM outreach_drafts d JOIN companies c ON c.id = d.company_id WHERE ${w.join(' AND ')} ORDER BY d.id DESC LIMIT 1000`,
      ...p
    ).map((r) => ({ ...r, used_findings: j(r.used_findings, []), eligibility: this.eligibilityFor(r.id as number) }))
  }

  setDraftStatus(ids: number[], status: 'approved' | 'draft' | 'rejected') {
    for (const id of ids) {
      const d = this.db.get<{ company_id: number; status: string }>('SELECT company_id, status FROM outreach_drafts WHERE id = ?', id)
      if (!d || d.status === 'sent' || d.status === 'queued') continue
      if (status === 'approved' && this.companies.isSuppressed(d.company_id)) continue
      this.db.run(`UPDATE outreach_drafts SET status = ?, approved_at = ${status === 'approved' ? "strftime('%Y-%m-%dT%H:%M:%fZ','now')" : 'NULL'} WHERE id = ?`, status, id)
      if (status === 'approved') {
        this.db.run("UPDATE companies SET stage_key = CASE WHEN stage_key IN ('new','researching','awaiting_analysis','analyzed','review') THEN 'approved' ELSE stage_key END WHERE id = ?", d.company_id)
        this.companies.log(d.company_id, 'İletişim taslağı onaylandı', `Taslak #${id}`)
      }
    }
    this.emitChange('drafts')
  }

  // ---------------- Uygunluk ----------------
  /** Şirketin en uygun iletişim bilgisi (sıralama: rankContacts). */
  recipient(companyId: number, channel: Channel): { key: string; display: string; kind: string; source: string | null } | null {
    const domain = this.db.get<{ domain: string | null }>('SELECT domain FROM companies WHERE id = ?', companyId)?.domain ?? null
    const rows = this.db.all<ContactRow>("SELECT type, value, value_key, kind, source_type, source_url, label FROM company_contacts WHERE company_id = ? AND type IN ('email','phone','whatsapp')", companyId)
    const best = rankContacts(rows, channel, domain)[0]
    return best ? { key: best.value_key, display: best.value, kind: best.kind, source: contactSourceLabel(best) } : null
  }

  private emailAccount(): (EmailAccount & { daily_limit: number; status: string }) | undefined {
    return this.db.get("SELECT * FROM email_accounts WHERE status = 'ok' ORDER BY id LIMIT 1") as (EmailAccount & { daily_limit: number; status: string }) | undefined
  }

  private whatsappAccount() {
    return this.db.get<{ id: number; mode: 'cloud_api' | 'click_to_chat'; phone_number_id: string | null; template_name: string | null; template_lang: string | null; daily_limit: number; status: string }>('SELECT * FROM whatsapp_accounts ORDER BY id LIMIT 1')
  }

  private sentToday(channel: Channel) {
    return this.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM outreach_messages WHERE channel = ? AND status IN ('sent','delivered','read','manual_opened','unverified') AND date(sent_at) = date('now')", channel)?.n ?? 0
  }

  eligibilityFor(draftId: number) {
    const d = this.db.get<{ company_id: number; channel: Channel; status: string }>('SELECT company_id, channel, status FROM outreach_drafts WHERE id = ?', draftId)
    if (!d) return { ok: false, reasons: ['Taslak bulunamadı'], warnings: [] }
    const s = this.settings.get()
    const rec = this.recipient(d.company_id, d.channel)
    const wa = this.whatsappAccount()
    const perm = this.db.get<{ status: string }>('SELECT status FROM outreach_permissions WHERE company_id = ? AND channel = ?', d.company_id, d.channel)?.status ?? null
    const tr = this.transport(d.channel)
    const webReady = !!this.web?.available()
    const acc = d.channel === 'email' ? this.emailAccount() : wa
    const o = s.outreach
    return checkEligibility({
      channel: d.channel,
      recipientKey: rec?.key ?? '',
      contactKind: rec?.kind ?? 'corporate',
      draftStatus: d.status,
      requireApproval: s.outreach.requireApproval,
      suppressedCompany: this.companies.isSuppressed(d.company_id),
      suppressedRecipient: rec ? this.companies.isRecipientSuppressed(d.channel === 'email' ? 'email' : 'phone', rec.key) : false,
      permissionStatus: perm,
      allowPersonalContacts: s.outreach.allowPersonalContacts,
      alreadySentToRecipient: !!rec && !!this.db.get("SELECT 1 FROM outreach_messages WHERE channel = ? AND recipient_key = ? AND test_mode = 0 AND status IN ('queued','sending','awaiting_confirm','sent','delivered','read','manual_opened','unverified')", d.channel, rec.key),
      accountReady: tr === 'whatsapp_desktop' ? true : tr === 'webmail' ? webReady && !!o.webmailUrl : tr === 'gmail_web' || tr === 'whatsapp_web' ? webReady : d.channel === 'email' ? !!acc : !!wa && (wa.mode === 'click_to_chat' || wa.status === 'ok'),
      dailySent: this.sentToday(d.channel),
      dailyLimit: tr === 'gmail_web' || tr === 'webmail' ? o.webDailyLimitEmail : tr === 'whatsapp_web' || tr === 'whatsapp_desktop' ? o.webDailyLimitWhatsapp : ((acc as { daily_limit?: number } | undefined)?.daily_limit ?? 50),
      whatsappMode: tr === 'cloud_api' ? 'cloud_api' : 'click_to_chat',
      whatsappTemplateReady: !!wa?.template_name,
      isMobileNumber: d.channel === 'whatsapp' && rec ? isTrMobile(rec.key) || !rec.key.startsWith('90') : undefined,
      testMode: s.outreach.testMode,
      testRecipientReady: d.channel === 'email' ? !!emailKey(s.outreach.testRecipientEmail) : !!phoneKey(s.outreach.testRecipientPhone)
    })
  }

  setPermission(companyId: number, channel: Channel, status: string, legalBasis: string | null, purpose: string | null, evidence: string | null) {
    if (!['unknown', 'b2b_legitimate_interest', 'opt_in', 'opted_out'].includes(status)) throw new Error('Geçersiz izin durumu')
    this.db.run(
      `INSERT INTO outreach_permissions(company_id, channel, status, legal_basis, purpose, evidence, recorded_by) VALUES (?,?,?,?,?,?, 'user')
       ON CONFLICT(company_id, channel) DO UPDATE SET status = excluded.status, legal_basis = excluded.legal_basis, purpose = excluded.purpose, evidence = excluded.evidence, recorded_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
      companyId, channel, status, legalBasis, purpose, evidence
    )
    this.companies.log(companyId, 'İletişim izni kaydedildi', `${channel}: ${status}${legalBasis ? ` (${legalBasis})` : ''}`)
    if (status === 'opted_out') this.companies.suppressCompany(companyId, `${channel} iletişim reddi`, 'user')
  }

  // ---------------- Kuyruk ----------------
  enqueue(draftIds: number[], campaign: string | null = null): { queued: number; skipped: { id: number; reasons: string[] }[] } {
    const s = this.settings.get()
    let queued = 0
    const skipped: { id: number; reasons: string[] }[] = []
    for (const id of draftIds) {
      const el = this.eligibilityFor(id)
      if (!el.ok) {
        skipped.push({ id, reasons: el.reasons })
        continue
      }
      const d = this.db.get<{ company_id: number; channel: Channel; subject: string | null; body: string }>('SELECT company_id, channel, subject, body FROM outreach_drafts WHERE id = ?', id)!
      const rec = this.recipient(d.company_id, d.channel)!
      const key = idempotencyKey(d.channel, d.company_id, rec.key, campaign) + (s.outreach.testMode ? `:test:${Date.now()}` : '')
      try {
        this.db.run('INSERT INTO outreach_messages(company_id, draft_id, channel, recipient, recipient_key, subject, body, idempotency_key, campaign, test_mode) VALUES (?,?,?,?,?,?,?,?,?,?)', d.company_id, id, d.channel, rec.display, rec.key, d.subject, d.body, key, campaign, s.outreach.testMode)
        this.db.run("UPDATE outreach_drafts SET status = 'queued' WHERE id = ?", id)
        queued++
      } catch {
        skipped.push({ id, reasons: ['Bu alıcı için aynı kampanyada zaten bir mesaj kaydı var (tekrar gönderim engellendi).'] })
      }
    }
    this.emitChange('outreach')
    return { queued, skipped }
  }

  queueState(channel: Channel): 'running' | 'paused' | 'stopped' {
    return (this.settings.getValue(`queue:${channel}`) as 'running' | 'paused' | 'stopped') ?? 'stopped'
  }

  startQueue(channel: Channel) {
    if (channel === 'whatsapp' && this.transport('whatsapp') === 'click_to_chat') throw new Error('Manuel (tıkla-gönder) modunda kuyruk otomatik çalışmaz; "Sıradakini WhatsApp\'ta aç" düğmesini kullanın.')
    this.settings.setValue(`queue:${channel}`, 'running')
    this.emitChange('outreach')
    if (!this.loops.get(channel)) void this.loop(channel)
  }

  pauseQueue(channel: Channel) {
    this.settings.setValue(`queue:${channel}`, 'paused')
    this.emitChange('outreach')
  }

  cancelQueue(channel: Channel) {
    this.settings.setValue(`queue:${channel}`, 'stopped')
    for (const [id, f] of this.pendingConfirm) {
      const ch = this.db.get<{ channel: string }>('SELECT channel FROM outreach_messages WHERE id = ?', id)?.channel
      if (ch === channel) {
        this.pendingConfirm.delete(id)
        f('stop')
      }
    }
    const r = this.db.run("UPDATE outreach_messages SET status = 'cancelled', status_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE channel = ? AND status = 'queued'", channel)
    this.db.run("UPDATE outreach_drafts SET status = 'approved' WHERE status = 'queued' AND channel = ? AND id NOT IN (SELECT draft_id FROM outreach_messages WHERE draft_id IS NOT NULL AND status IN ('queued','sending','sent','delivered','read','test_sent','manual_opened'))", channel)
    this.emitChange('outreach')
    return r.changes
  }

  private async loop(channel: Channel) {
    this.loops.set(channel, true)
    try {
      while (this.queueState(channel) === 'running') {
        const m = this.db.get<{ id: number }>("SELECT id FROM outreach_messages WHERE channel = ? AND status = 'queued' ORDER BY id LIMIT 1", channel)
        if (!m) {
          this.settings.setValue(`queue:${channel}`, 'stopped')
          break
        }
        await this.processMessage(m.id)
        this.emitChange('outreach')
        const s = this.settings.get().outreach
        const wait = (channel === 'email' ? s.emailIntervalSec : s.whatsappIntervalSec) * 1000
        const until = Date.now() + wait
        while (Date.now() < until && this.queueState(channel) === 'running') await new Promise((r) => setTimeout(r, 500))
      }
    } finally {
      this.loops.set(channel, false)
      this.emitChange('outreach')
    }
  }

  private async processMessage(id: number) {
    const m = this.db.get<{ id: number; company_id: number; draft_id: number | null; channel: Channel; recipient_key: string; subject: string | null; body: string; test_mode: number; status: string }>('SELECT * FROM outreach_messages WHERE id = ?', id)
    if (!m || m.status !== 'queued') return
    // Devam ettirmede yeniden kontrol: ret listesi / izin değişmiş olabilir
    if (m.draft_id) {
      const el = this.eligibilityFor(m.draft_id)
      const blocking = el.reasons.filter((r) => !/daha önce mesaj gönderilmiş/.test(r) && !/henüz onaylanmadı/.test(r))
      if (blocking.length) {
        this.db.run("UPDATE outreach_messages SET status = 'blocked', error = ?, status_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?", blocking.join(' '), id)
        return
      }
    }
    const s = this.settings.get()
    let testMode = !!m.test_mode || s.outreach.testMode
    const isWeb = ['gmail_web', 'webmail', 'whatsapp_web', 'whatsapp_desktop'].includes(this.transport(m.channel))
    // Tarayıcı kanallarında hazırlık aşaması "preparing"dir; yalnızca gönder düğmesine basılırken "sending" olur
    this.db.run("UPDATE outreach_messages SET status = ?, attempts = attempts + 1 WHERE id = ?", isWeb ? 'preparing' : 'sending', id)
    try {
      let providerId = ''
      const tr = this.transport(m.channel)
      if (tr === 'whatsapp_desktop') {
        // Masaüstü uygulamasında gönderimi kullanıcı kendisi (Enter ile) yapar; uygulama hiçbir şey göndermez.
        // Bu yüzden sohbet test modunda da şirketin gerçek numarasıyla açılır ve kayıt gerçek gönderim sayılır.
        testMode = false
        this.db.run('UPDATE outreach_messages SET test_mode = 0 WHERE id = ?', id)
        const outcome = await this.processDesktop(m)
        if (outcome !== 'sent') return
        providerId = 'desktop:user-confirmed'
      } else if (tr === 'gmail_web' || tr === 'webmail' || tr === 'whatsapp_web') {
        const outcome = await this.processWeb(m, testMode)
        if (outcome !== 'sent') return
        providerId = `web:${tr}`
      } else if (m.channel === 'email') {
        const acc = this.emailAccount()
        if (!acc) throw new Error('Doğrulanmış e-posta hesabı yok')
        const pass = this.secrets.get(`email_pass:${acc.id}`)
        if (!pass) throw new Error('E-posta hesabı parolası kayıtlı değil')
        const to = testMode ? s.outreach.testRecipientEmail : m.recipient_key
        const subject = testMode ? `[TEST → ${m.recipient_key}] ${m.subject ?? ''}` : m.subject ?? ''
        const img = imageFor('email', s.outreach.image)
        const r = await sendEmail(acc, pass, { to, subject, text: m.body, unsubscribeMailto: acc.from_email, attachments: img ? [{ filename: img.split(/[\\/]/).pop()!, path: img }] : undefined })
        providerId = r.messageId
      } else {
        const wa = this.whatsappAccount()
        if (!wa || wa.mode !== 'cloud_api' || !wa.phone_number_id || !wa.template_name) throw new Error('WhatsApp Business Platform hesabı yapılandırılmamış')
        const token = this.secrets.get('whatsapp_token')
        if (!token) throw new Error('WhatsApp erişim anahtarı kayıtlı değil')
        const to = testMode ? phoneKey(s.outreach.testRecipientPhone) : m.recipient_key
        const cname = this.db.get<{ name: string }>('SELECT name FROM companies WHERE id = ?', m.company_id)?.name ?? ''
        const params = j<string[]>(this.settings.getValue('whatsapp_template_params') ?? '[]', [])
        providerId = await whatsappSendTemplate(wa.phone_number_id, token, to, wa.template_name, wa.template_lang ?? 'tr', params.map((p) => (p === '{sirket}' ? cname : p)))
      }
      const st = testMode ? 'test_sent' : 'sent'
      this.db.run("UPDATE outreach_messages SET status = ?, provider_message_id = ?, sent_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), status_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), error = NULL WHERE id = ?", st, providerId, id)
      if (!testMode) {
        if (m.draft_id) this.db.run("UPDATE outreach_drafts SET status = 'sent' WHERE id = ?", m.draft_id)
        this.db.run('INSERT OR IGNORE INTO communication_events(company_id, message_id, channel, direction, kind, summary, external_id) VALUES (?,?,?,?,?,?,?)', m.company_id, id, m.channel, 'out', 'sent', m.subject ?? m.body.slice(0, 120), providerId || null)
        this.db.run("UPDATE companies SET stage_key = CASE WHEN stage_key IN ('approved','review','analyzed','new') THEN 'waiting_reply' ELSE stage_key END WHERE id = ?", m.company_id)
        this.companies.log(m.company_id, `${m.channel === 'email' ? 'E-posta' : 'WhatsApp'} gönderildi`, m.recipient_key, 'system', 'message', id)
      } else {
        this.db.run("UPDATE outreach_drafts SET status = 'approved' WHERE id = ?", m.draft_id)
        this.companies.log(m.company_id, 'Test gönderimi yapıldı (gerçek alıcıya gitmedi)', undefined, 'system', 'message', id)
      }
    } catch (e) {
      const msg = (e as Error).message
      log('warn', `Gönderim başarısız (#${id}): ${msg}`)
      const cur = this.db.get<{ status: string }>('SELECT status FROM outreach_messages WHERE id = ?', id)?.status
      if (cur === 'preparing' || cur === 'awaiting_confirm') {
        // Henüz gönder düğmesine basılmadı: mesaj güvenle kuyruğa döner, kuyruk duraklatılır
        this.db.run("UPDATE outreach_messages SET status = 'queued', error = ? WHERE id = ?", `Hazırlık yarıda kaldı: ${msg.slice(0, 300)}`, id)
        this.pauseQueue(m.channel)
        return
      }
      this.db.run("UPDATE outreach_messages SET status = 'failed', error = ?, status_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?", msg.slice(0, 1000), id)
      if (/sınırına ulaşıldı|limit/i.test(msg)) this.pauseQueue(m.channel)
    }
  }

  /**
   * WhatsApp masaüstü uygulaması: sohbet resmî whatsapp:// bağlantısıyla açılır ve mesaj kutuya yazılır.
   * Uygulamanın içi okunamadığı için gönderimi kullanıcı kendisi yapar (Enter) ve sonucu burada bildirir;
   * bu kanalda otomatik gönderim ve otomatik doğrulama yoktur.
   */
  private async processDesktop(m: { id: number; company_id: number; draft_id: number | null; channel: Channel; recipient_key: string; subject: string | null; body: string }): Promise<'sent' | 'handled'> {
    const s = this.settings.get()
    const company = this.db.get<{ name: string }>('SELECT name FROM companies WHERE id = ?', m.company_id)?.name ?? ''
    const to = m.recipient_key
    const img = imageFor('whatsapp', s.outreach.image)
    if (img) {
      // Pano PNG olarak yazılır (JPG de PNG'ye çevrilir); WhatsApp'a Ctrl/Cmd+V ile yapıştırılır
      await copyImageToClipboard(img).catch((e) => this.companies.log(m.company_id, 'Görsel panoya kopyalanamadı', (e as Error).message, 'system'))
    }
    await shell.openExternal(whatsappDesktopUrl(to, m.body))
    this.companies.log(m.company_id, 'WhatsApp uygulamasında sohbet açıldı', `+${to}`, 'system', 'message', m.id)
    if (s.outreach.sendMode === 'draft') {
      this.db.run("UPDATE outreach_messages SET status = 'prepared', error = 'WhatsApp uygulamasında sohbet açıldı ve mesaj yazıldı; gönderilmedi.', sent_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), status_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?", m.id)
      return 'handled'
    }
    this.db.run("UPDATE outreach_messages SET status = 'awaiting_confirm' WHERE id = ?", m.id)
    this.emitChange('outreach')
    const decision = await new Promise<'send' | 'skip' | 'stop'>((resolve) => {
      this.pendingConfirm.set(m.id, resolve)
      const rec = this.recipient(m.company_id, 'whatsapp')
      this.emitConfirm({ realRecipient: m.recipient_key, recipientSource: rec?.key === m.recipient_key ? rec.source : null, messageId: m.id, channel: 'whatsapp', company, recipient: to, recipientVerified: false, verifyNote: 'Sohbet şirketin numarasıyla açıldı ve mesaj yazıldı. WhatsApp’ta Enter’a bastığınızda mesaj gerçekten şirkete gider; göndermek istemezseniz kutuyu temizleyip "Göndermedim, atla" deyin.', subject: null, body: m.body, attachment: null, image: img ? imageDataUri(img) : null, imageNote: img ? `Görsel panoya kopyalandı. WhatsApp'ta mesaj kutusuna tıklayıp ${process.platform === 'darwin' ? 'Cmd+V' : 'Ctrl+V'} ile yapıştırın ve görsel ekranında gönderin; metin kutuda kaldıysa onu da Enter ile gönderin.` : null, preview: null, testMode: false, manualSend: true })
    })
    this.emitConfirm({ messageId: m.id, closed: true })
    if (decision === 'send') return 'sent'
    this.db.run("UPDATE outreach_messages SET status = ?, error = ?, status_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?", decision === 'skip' ? 'cancelled' : 'queued', decision === 'skip' ? 'Kullanıcı göndermediğini bildirdi.' : null, m.id)
    if (decision === 'stop') this.pauseQueue('whatsapp')
    return 'handled'
  }

  /**
   * Tarayıcı kanalı (Gmail web / WhatsApp Web): hazırla → (moda göre) taslak bırak / onay iste / gönder → doğrula.
   * 'sent' dönerse çağıran gönderim kayıtlarını tamamlar; diğer durumlarda mesajın durumu burada yazılır.
   */
  private async processWeb(m: { id: number; company_id: number; draft_id: number | null; channel: Channel; recipient_key: string; subject: string | null; body: string }, testMode: boolean): Promise<'sent' | 'handled'> {
    if (!this.web) throw new Error('Tarayıcı otomasyonu başlatılamadı')
    const s = this.settings.get()
    const mode = s.outreach.sendMode
    const company = this.db.get<{ name: string }>('SELECT name FROM companies WHERE id = ?', m.company_id)?.name ?? ''
    const setStatus = (status: string, error: string | null) =>
      this.db.run("UPDATE outreach_messages SET status = ?, error = ?, status_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), sent_at = CASE WHEN ? IN ('unverified','draft_saved','prepared') THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') ELSE sent_at END WHERE id = ?", status, error, status, m.id)
    await this.web.ensureStarted()
    const to = testMode ? (m.channel === 'email' ? s.outreach.testRecipientEmail : phoneKey(s.outreach.testRecipientPhone)) : m.recipient_key
    const subject = testMode && m.subject ? `[TEST → ${m.recipient_key}] ${m.subject}` : (m.subject ?? '')
    const attachments: string[] = []
    if (m.channel === 'email' && s.outreach.attachReport) {
      const rp = this.db.get<{ report_path: string }>('SELECT report_path FROM website_analyses WHERE company_id = ? AND report_path IS NOT NULL ORDER BY id DESC LIMIT 1', m.company_id)?.report_path
      if (rp) attachments.push(rp)
    }
    const img = m.channel === 'email' ? imageFor('email', s.outreach.image) : null
    if (img) attachments.push(img)
    const attachment = attachments.length ? attachments.join(', ') : null

    // 1) Oturum ve hazırlık (henüz gönderilmez)
    let verified = false
    let verifyNote: string | null = null
    if (m.channel === 'whatsapp') {
      await this.web.wa.ensureLoggedIn(company)
      const r = await this.web.wa.prepare(to, m.body, company)
      if (!r.ok) {
        setStatus('failed', r.reason)
        if (r.code === 'invalid_number') {
          this.db.run("UPDATE company_contacts SET label = 'WhatsApp yok' WHERE company_id = ? AND value_key = ? AND type IN ('phone','whatsapp')", m.company_id, m.recipient_key)
          this.companies.log(m.company_id, 'WhatsApp numarası geçersiz', r.reason, 'system', 'message', m.id)
        } else this.pauseQueue(m.channel)
        return 'handled'
      }
      verified = r.recipientVerified
      verifyNote = r.reason ?? (r.headerText ? `Sohbet başlığı: ${r.headerText}` : null)
    } else {
      const mail = this.transport('email') === 'webmail' ? this.web.rc : this.web.gmail
      await mail.ensureLoggedIn(company)
      const r = await mail.prepare({ to, subject, body: m.body, attachment: attachments }, company)
      if (!r.ok) {
        setStatus('failed', r.reason)
        this.pauseQueue(m.channel)
        return 'handled'
      }
      verified = r.recipientVerified
      verifyNote = r.account ? `Gönderen hesap: ${r.account}` : null
    }

    // 2) Taslak modu: göndermeden bırak
    if (mode === 'draft') {
      if (m.channel === 'email') await (this.transport('email') === 'webmail' ? this.web.rc : this.web.gmail).saveDraft(company)
      setStatus(m.channel === 'email' ? 'draft_saved' : 'prepared', m.channel === 'email' ? 'Taslaklar klasörüne kaydedildi (gönderilmedi).' : 'Mesaj WhatsApp sohbetine yazıldı, gönderilmedi.')
      this.companies.log(m.company_id, m.channel === 'email' ? 'E-posta taslağı oluşturuldu' : 'WhatsApp mesajı sohbete yazıldı (gönderilmedi)', to, 'system', 'message', m.id)
      return 'handled'
    }

    // 3) Onay modu — ya da kuyruk modunda alıcı doğrulanamadıysa: kullanıcıya önizleme gösterilir
    if (mode === 'confirm' || !verified) {
      if (mode === 'queue') this.pauseQueue(m.channel)
      this.db.run("UPDATE outreach_messages SET status = 'awaiting_confirm' WHERE id = ?", m.id)
      this.emitChange('outreach')
      const preview = await this.web.agent.preview()
      const decision = await new Promise<'send' | 'skip' | 'stop'>((resolve) => {
        this.pendingConfirm.set(m.id, resolve)
        const rec = this.recipient(m.company_id, m.channel)
        this.emitConfirm({ realRecipient: m.recipient_key, recipientSource: rec?.key === m.recipient_key ? rec.source : null, messageId: m.id, channel: m.channel, company, recipient: to, recipientVerified: verified, verifyNote, subject: m.channel === 'email' ? subject : null, body: m.body, attachment, image: img ? imageDataUri(img) : null, imageNote: img ? 'Görsel e-postaya ek olarak eklendi.' : m.channel === 'whatsapp' && imageFor('whatsapp', s.outreach.image) ? 'WhatsApp Web kanalında görsel ekleme henüz desteklenmiyor; yalnızca metin gönderilir.' : null, preview, testMode })
      })
      this.emitConfirm({ messageId: m.id, closed: true })
      if (decision !== 'send') {
        if (m.channel === 'email') await (this.transport('email') === 'webmail' ? this.web.rc : this.web.gmail).saveDraft(company).catch(() => undefined)
        setStatus(decision === 'skip' ? 'cancelled' : 'queued', decision === 'skip' ? 'Kullanıcı bu mesajı atladı (gönderilmedi).' : null)
        if (decision === 'stop') this.pauseQueue(m.channel)
        return 'handled'
      }
    }

    // 4) Gönder ve doğrula
    this.db.run("UPDATE outreach_messages SET status = 'sending' WHERE id = ?", m.id)
    const res = m.channel === 'whatsapp' ? await this.web.wa.send(m.body, company) : await (this.transport('email') === 'webmail' ? this.web.rc : this.web.gmail).send(company)
    if (res.status === 'unverified') {
      setStatus('unverified', res.detail)
      this.companies.log(m.company_id, 'Gönderim doğrulanamadı', res.detail, 'system', 'message', m.id)
      if (m.draft_id && !testMode) this.db.run("UPDATE outreach_drafts SET status = 'sent' WHERE id = ?", m.draft_id)
      this.pauseQueue(m.channel)
      return 'handled'
    }
    return 'sent'
  }

  /** Başarısız bir mesajı (durumu kesin olarak "gönderilmedi" ise) yeniden kuyruğa alır. */
  retry(id: number) {
    const m = this.db.get<{ status: string; error: string | null }>('SELECT status, error FROM outreach_messages WHERE id = ?', id)
    if (!m || !['failed', 'blocked'].includes(m.status)) throw new Error('Yalnızca başarısız mesajlar yeniden denenebilir')
    if (/Durum belirsiz/.test(m.error ?? '')) throw new Error('Bu mesajın durumu belirsiz (alıcıya ulaşmış olabilir). Tekrar göndermek için önce alıcıyla teyit edin ve yeni bir taslak oluşturun.')
    this.db.run("UPDATE outreach_messages SET status = 'queued', error = NULL WHERE id = ?", id)
    this.emitChange('outreach')
  }

  /** Manuel WhatsApp modu: sıradaki mesajı kullanıcının WhatsApp uygulamasında hazır açar; gönderme kullanıcıdadır. */
  async openNextManual(): Promise<{ id: number; company: string } | null> {
    const m = this.db.get<{ id: number; company_id: number; draft_id: number | null; recipient_key: string; body: string; test_mode: number }>("SELECT * FROM outreach_messages WHERE channel = 'whatsapp' AND status = 'queued' ORDER BY id LIMIT 1")
    if (!m) return null
    if (m.draft_id) {
      const el = this.eligibilityFor(m.draft_id)
      const blocking = el.reasons.filter((r) => !/daha önce mesaj gönderilmiş/.test(r) && !/henüz onaylanmadı/.test(r) && !/hesabı yapılandırılmamış/.test(r))
      if (blocking.length) {
        this.db.run("UPDATE outreach_messages SET status = 'blocked', error = ? WHERE id = ?", blocking.join(' '), m.id)
        return this.openNextManual()
      }
    }
    const s = this.settings.get()
    const to = m.test_mode || s.outreach.testMode ? phoneKey(s.outreach.testRecipientPhone) : m.recipient_key
    await shell.openExternal(clickToChatUrl(to, m.body))
    this.db.run("UPDATE outreach_messages SET status = 'manual_opened', sent_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), status_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?", m.id)
    const name = this.db.get<{ name: string }>('SELECT name FROM companies WHERE id = ?', m.company_id)?.name ?? ''
    this.companies.log(m.company_id, 'WhatsApp mesajı manuel gönderim için açıldı', 'Gönderim kullanıcının onayına bağlı', 'user', 'message', m.id)
    this.emitChange('outreach')
    return { id: m.id, company: name }
  }

  markManual(id: number, sent: boolean) {
    const m = this.db.get<{ company_id: number; draft_id: number | null; status: string }>('SELECT company_id, draft_id, status FROM outreach_messages WHERE id = ?', id)
    if (!m || m.status !== 'manual_opened') throw new Error('Bu mesaj manuel gönderim bekleyen durumda değil')
    if (sent) {
      this.db.run("UPDATE outreach_messages SET status = 'sent', status_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?", id)
      if (m.draft_id) this.db.run("UPDATE outreach_drafts SET status = 'sent' WHERE id = ?", m.draft_id)
      this.db.run("INSERT INTO communication_events(company_id, message_id, channel, direction, kind, summary) VALUES (?,?, 'whatsapp', 'out', 'sent', 'Manuel gönderildi (kullanıcı onayı)')", m.company_id, id)
      this.db.run("UPDATE companies SET stage_key = CASE WHEN stage_key IN ('approved','review','analyzed','new') THEN 'waiting_reply' ELSE stage_key END WHERE id = ?", m.company_id)
    } else this.db.run("UPDATE outreach_messages SET status = 'cancelled', error = 'Kullanıcı göndermedi' WHERE id = ?", id)
    this.emitChange('outreach')
  }

  listMessages(f: { channel?: string; status?: string; limit?: number }) {
    const w = ['1=1']
    const p: (string | number)[] = []
    if (f.channel) w.push('m.channel = ?'), p.push(f.channel)
    if (f.status) w.push('m.status = ?'), p.push(f.status)
    return this.db.all(`SELECT m.*, c.name AS company_name FROM outreach_messages m JOIN companies c ON c.id = m.company_id WHERE ${w.join(' AND ')} ORDER BY m.id DESC LIMIT ?`, ...p, f.limit ?? 500)
  }

  queueSummary() {
    const by = (ch: Channel) => Object.fromEntries(this.db.all<{ status: string; n: number }>('SELECT status, COUNT(*) AS n FROM outreach_messages WHERE channel = ? GROUP BY status', ch).map((r) => [r.status, r.n]))
    return { email: { state: this.queueState('email'), counts: by('email'), sentToday: this.sentToday('email') }, whatsapp: { state: this.queueState('whatsapp'), counts: by('whatsapp'), sentToday: this.sentToday('whatsapp'), mode: this.transport('whatsapp') }, emailTransport: this.transport('email'), sendMode: this.settings.get().outreach.sendMode, pendingConfirm: this.pendingConfirmations() }
  }

  // ---------------- Yanıt takibi (IMAP) ----------------
  async syncReplies(): Promise<{ checked: number; matched: number; optOuts: number }> {
    const acc = this.db.get<EmailAccount & { last_imap_uid: number | null }>("SELECT * FROM email_accounts WHERE status = 'ok' AND imap_host IS NOT NULL ORDER BY id LIMIT 1")
    if (!acc) throw new Error('IMAP bilgisi tanımlı, doğrulanmış bir e-posta hesabı yok')
    const pass = this.secrets.get(`email_pass:${acc.id}`)
    if (!pass) throw new Error('E-posta parolası kayıtlı değil')
    const { mails, lastUid } = await fetchInbox(acc, pass, acc.last_imap_uid)
    let matched = 0
    let optOuts = 0
    for (const mail of mails) {
      const key = emailKey(mail.from)
      if (!key || key === acc.from_email.toLowerCase()) continue
      let companyId = this.db.get<{ company_id: number }>("SELECT company_id FROM company_contacts WHERE type = 'email' AND value_key = ?", key)?.company_id
      if (!companyId) {
        const dom = key.split('@')[1]
        companyId = this.db.get<{ id: number }>('SELECT id FROM companies WHERE domain = ?', dom)?.id
      }
      if (!companyId) continue
      if (!this.db.get("SELECT 1 FROM outreach_messages WHERE company_id = ? AND channel = 'email' AND status IN ('sent','delivered','read')", companyId)) continue
      const ins = this.db.run("INSERT OR IGNORE INTO communication_events(company_id, channel, direction, kind, summary, body, external_id, occurred_at) VALUES (?, 'email', 'in', 'reply', ?, ?, ?, ?)", companyId, mail.subject.slice(0, 200), mail.text.slice(0, 4000), mail.messageId ?? `uid:${acc.id}:${mail.uid}`, mail.date)
      if (!ins.changes) continue
      matched++
      this.companies.log(companyId, 'E-posta yanıtı alındı', mail.subject, 'system')
      if (isOptOutReply(`${mail.subject} ${mail.text}`)) {
        optOuts++
        this.companies.suppressCompany(companyId, `Yanıtta iletişim reddi: "${mail.subject.slice(0, 80)}"`, 'reply')
      } else {
        this.db.run("UPDATE companies SET stage_key = CASE WHEN stage_key IN ('contacted','waiting_reply','approved') THEN (CASE WHEN EXISTS (SELECT 1 FROM stages WHERE key = 'replied') THEN 'replied' ELSE 'contacted' END) ELSE stage_key END WHERE id = ?", companyId)
        this.db.run("INSERT INTO tasks(title, company_id, kind, priority, due_at) VALUES (?, ?, 'reply_review', 'high', date('now','+1 day'))", 'Müşterinin yanıtını değerlendir', companyId)
      }
    }
    if (lastUid != null) this.db.run("UPDATE email_accounts SET last_imap_uid = ?, last_check_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?", lastUid, acc.id)
    this.emitChange('outreach')
    return { checked: mails.length, matched, optOuts }
  }
}

