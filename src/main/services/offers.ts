// Teklif ve satış yönetimi + hizmet kataloğu + görevler.

import { join } from 'node:path'
import type { Db } from '../database/db'
import { j } from '../database/db'
import type { FileStore } from '../files/folders'
import type { CompanyService } from './companies'
import type { SettingsService } from './settings'
import { offerHtml } from '../reports/templates'
import { brandForPdf, htmlToPdf } from '../reports/pdf'
import { safeSlug } from '@shared/text'
import { computeTotals } from '@shared/offer-math'
export { computeTotals }

export interface OfferInput {
  companyId: number
  title: string
  currency?: string
  discountType?: 'none' | 'percent' | 'amount'
  discountValue?: number
  vatIncluded?: boolean
  deliveryEstimate?: string | null
  validUntil?: string | null
  paymentTerms?: string | null
  notes?: string | null
  status?: string
  items: { serviceId?: number | null; name: string; description?: string | null; quantity: number; unit?: string | null; unitPrice: number; vatRate: number }[]
}

export class OfferService {
  constructor(
    private db: Db,
    private files: FileStore,
    private companies: CompanyService,
    private settings: SettingsService,
    private emitChange: (scope: string) => void
  ) {}

  // ---------- Hizmet kataloğu ----------
  services(all = false) {
    return this.db.all(`SELECT * FROM services ${all ? '' : 'WHERE active = 1'} ORDER BY position, id`)
  }

  saveService(s: { id?: number; name: string; description?: string; unit?: string; price?: number | null; currency?: string; vatRate?: number; active?: boolean }) {
    if (!s.name.trim()) throw new Error('Hizmet adı gerekli')
    if (s.id) this.db.run('UPDATE services SET name = ?, description = ?, unit = ?, price = ?, currency = ?, vat_rate = ?, active = ? WHERE id = ?', s.name, s.description ?? null, s.unit ?? 'proje', s.price ?? null, s.currency ?? 'TRY', s.vatRate ?? 20, s.active ?? true, s.id)
    else {
      const pos = (this.db.get<{ p: number }>('SELECT MAX(position) AS p FROM services')?.p ?? 0) + 1
      this.db.run('INSERT INTO services(key, name, description, unit, price, currency, vat_rate, active, position) VALUES (?,?,?,?,?,?,?,?,?)', `custom_${Date.now()}`, s.name, s.description ?? null, s.unit ?? 'proje', s.price ?? null, s.currency ?? 'TRY', s.vatRate ?? 20, s.active ?? true, pos)
    }
  }

  // ---------- Teklifler ----------
  private nextNumber() {
    const y = new Date().getFullYear()
    const last = this.db.get<{ number: string }>("SELECT number FROM offers WHERE number LIKE ? ORDER BY id DESC LIMIT 1", `UCA-${y}-%`)?.number
    const n = last ? parseInt(last.split('-')[2], 10) + 1 : 1
    return `UCA-${y}-${String(n).padStart(4, '0')}`
  }

  save(input: OfferInput & { id?: number }) {
    if (!input.items.length) throw new Error('Teklife en az bir hizmet kalemi ekleyin')
    if (input.items.some((i) => !(i.unitPrice >= 0) || !(i.quantity > 0))) throw new Error('Miktar sıfırdan büyük, fiyat negatif olmayan bir sayı olmalı')
    const t = computeTotals(input.items, input.discountType ?? 'none', input.discountValue ?? 0, !!input.vatIncluded)
    return this.db.tx(() => {
      let id = input.id
      const histEntry = { at: new Date().toISOString(), status: input.status ?? 'draft', total: t.total }
      if (id) {
        const prev = this.db.get<{ history: string; status: string }>('SELECT history, status FROM offers WHERE id = ?', id)
        if (!prev) throw new Error('Teklif bulunamadı')
        const hist = j<unknown[]>(prev.history, [])
        hist.push({ ...histEntry, note: prev.status !== (input.status ?? prev.status) ? `Durum: ${prev.status} → ${input.status}` : 'Güncellendi' })
        this.db.run(
          "UPDATE offers SET company_id = ?, title = ?, status = ?, currency = ?, discount_type = ?, discount_value = ?, vat_included = ?, delivery_estimate = ?, valid_until = ?, payment_terms = ?, notes = ?, subtotal = ?, vat_total = ?, total = ?, history = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
          input.companyId, input.title, input.status ?? prev.status, input.currency ?? 'TRY', input.discountType ?? 'none', input.discountValue ?? 0, !!input.vatIncluded, input.deliveryEstimate ?? null, input.validUntil ?? null, input.paymentTerms ?? null, input.notes ?? null, t.subtotal, t.vatTotal, t.total, JSON.stringify(hist), id
        )
        this.db.run('DELETE FROM offer_items WHERE offer_id = ?', id)
      } else {
        id = this.db.run(
          'INSERT INTO offers(number, company_id, title, status, currency, discount_type, discount_value, vat_included, delivery_estimate, valid_until, payment_terms, notes, subtotal, vat_total, total, history) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
          this.nextNumber(), input.companyId, input.title, input.status ?? 'draft', input.currency ?? 'TRY', input.discountType ?? 'none', input.discountValue ?? 0, !!input.vatIncluded, input.deliveryEstimate ?? null, input.validUntil ?? null, input.paymentTerms ?? null, input.notes ?? null, t.subtotal, t.vatTotal, t.total, JSON.stringify([{ ...histEntry, note: 'Oluşturuldu' }])
        ).lastInsertRowid
        this.db.run("UPDATE companies SET stage_key = CASE WHEN stage_key IN ('won','lost','do_not_contact','archived','offer_sent','negotiation') THEN stage_key ELSE 'offer_prepared' END WHERE id = ?", input.companyId)
        this.companies.log(input.companyId, 'Teklif hazırlandı', input.title, 'user', 'offer', id)
      }
      input.items.forEach((it, i) => this.db.run('INSERT INTO offer_items(offer_id, service_id, name, description, quantity, unit, unit_price, vat_rate, position) VALUES (?,?,?,?,?,?,?,?,?)', id!, it.serviceId ?? null, it.name, it.description ?? null, it.quantity, it.unit ?? null, it.unitPrice, it.vatRate, i))
      const stageMap: Record<string, string> = { sent: 'offer_sent', negotiation: 'negotiation', won: 'won', lost: 'lost' }
      if (input.status && stageMap[input.status]) this.db.run('UPDATE companies SET stage_key = ? WHERE id = ?', stageMap[input.status], input.companyId)
      this.emitChange('offers')
      return id!
    })
  }

  list(f: { status?: string; companyId?: number }) {
    const w = ['1=1']
    const p: (string | number)[] = []
    if (f.status) w.push('o.status = ?'), p.push(f.status)
    if (f.companyId) w.push('o.company_id = ?'), p.push(f.companyId)
    return this.db.all(`SELECT o.*, c.name AS company_name FROM offers o JOIN companies c ON c.id = o.company_id WHERE ${w.join(' AND ')} ORDER BY o.id DESC`, ...p)
  }

  get(id: number) {
    const o = this.db.get('SELECT o.*, c.name AS company_name FROM offers o JOIN companies c ON c.id = o.company_id WHERE o.id = ?', id)
    if (!o) throw new Error('Teklif bulunamadı')
    return { ...o, history: j(o.history, []), items: this.db.all('SELECT * FROM offer_items WHERE offer_id = ? ORDER BY position', id) }
  }

  async pdf(id: number): Promise<string> {
    const o = this.get(id) as Record<string, unknown> & { items: Record<string, unknown>[] }
    const c = this.db.get<{ name: string; address: string | null; city: string | null }>('SELECT name, address, city FROM companies WHERE id = ?', o.company_id as number)!
    const email = this.db.get<{ value: string }>("SELECT value FROM company_contacts WHERE company_id = ? AND type = 'email' LIMIT 1", o.company_id as number)?.value ?? null
    const phone = this.db.get<{ value: string }>("SELECT value FROM company_contacts WHERE company_id = ? AND type IN ('phone','whatsapp') LIMIT 1", o.company_id as number)?.value ?? null
    const t = computeTotals(o.items.map((i) => ({ name: '', quantity: Number(i.quantity), unitPrice: Number(i.unit_price), vatRate: Number(i.vat_rate) })), String(o.discount_type), Number(o.discount_value), !!o.vat_included)
    const html = offerHtml(brandForPdf(this.settings.get().brand), {
      number: String(o.number), title: String(o.title), date: String(o.created_at), validUntil: (o.valid_until as string) ?? null,
      company: { ...c, email, phone },
      items: o.items.map((i) => ({ name: String(i.name), description: (i.description as string) ?? null, quantity: Number(i.quantity), unit: (i.unit as string) ?? null, unitPrice: Number(i.unit_price), vatRate: Number(i.vat_rate) })),
      currency: String(o.currency), discountLabel: o.discount_type === 'percent' ? `(%${o.discount_value})` : null, discountAmount: t.discount,
      subtotal: t.subtotal, vatTotal: t.vatTotal, total: t.total, vatIncluded: !!o.vat_included,
      delivery: (o.delivery_estimate as string) ?? null, paymentTerms: (o.payment_terms as string) ?? null, notes: (o.notes as string) ?? null
    })
    const out = join(this.files.companyDir(o.company_id as number), 'offers', `teklif-${safeSlug(String(o.number))}.pdf`)
    await htmlToPdf(html, out)
    this.db.run('UPDATE offers SET pdf_path = ? WHERE id = ?', out, id)
    this.files.register({ path: out, kind: 'offer_pdf', companyId: o.company_id as number, offerId: id })
    this.emitChange('files')
    return out
  }

  // ---------- Görevler ----------
  saveTask(t: { id?: number; title: string; description?: string | null; companyId?: number | null; offerId?: number | null; assignee?: string | null; dueAt?: string | null; remindAt?: string | null; priority?: string; status?: string; kind?: string | null }) {
    if (!t.title.trim()) throw new Error('Görev başlığı gerekli')
    if (t.id) {
      this.db.run(
        `UPDATE tasks SET title = ?, description = ?, company_id = ?, offer_id = ?, assignee = ?, due_at = ?, remind_at = ?, reminded = CASE WHEN remind_at IS NOT ? THEN 0 ELSE reminded END, priority = ?, status = ?, kind = ?, completed_at = CASE WHEN ? = 'done' THEN COALESCE(completed_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) ELSE NULL END WHERE id = ?`,
        t.title, t.description ?? null, t.companyId ?? null, t.offerId ?? null, t.assignee ?? null, t.dueAt ?? null, t.remindAt ?? null, t.remindAt ?? null, t.priority ?? 'normal', t.status ?? 'open', t.kind ?? null, t.status ?? 'open', t.id
      )
      return t.id
    }
    const id = this.db.run('INSERT INTO tasks(title, description, company_id, offer_id, assignee, due_at, remind_at, priority, status, kind) VALUES (?,?,?,?,?,?,?,?,?,?)', t.title, t.description ?? null, t.companyId ?? null, t.offerId ?? null, t.assignee ?? null, t.dueAt ?? null, t.remindAt ?? null, t.priority ?? 'normal', t.status ?? 'open', t.kind ?? null).lastInsertRowid
    if (t.companyId) this.companies.log(t.companyId, 'Görev oluşturuldu', t.title)
    this.emitChange('tasks')
    return id
  }

  listTasks(f: { status?: string; companyId?: number; assignee?: string }) {
    const w = ['1=1']
    const p: (string | number)[] = []
    if (f.status === 'active') w.push("t.status IN ('open','in_progress')")
    else if (f.status) w.push('t.status = ?'), p.push(f.status)
    if (f.companyId) w.push('t.company_id = ?'), p.push(f.companyId)
    if (f.assignee) w.push('t.assignee = ?'), p.push(f.assignee)
    return this.db.all(`SELECT t.*, c.name AS company_name FROM tasks t LEFT JOIN companies c ON c.id = t.company_id WHERE ${w.join(' AND ')} ORDER BY t.status IN ('done','cancelled'), t.due_at IS NULL, t.due_at, CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END LIMIT 1000`, ...p)
  }

  deleteTask(id: number) {
    this.db.run('DELETE FROM tasks WHERE id = ?', id)
  }

  /** Zamanı gelen hatırlatıcıları döndürür ve "hatırlatıldı" olarak işaretler. */
  dueReminders(): { id: number; title: string; company_name: string | null }[] {
    const rows = this.db.all<{ id: number; title: string; company_name: string | null }>("SELECT t.id, t.title, c.name AS company_name FROM tasks t LEFT JOIN companies c ON c.id = t.company_id WHERE t.remind_at IS NOT NULL AND t.reminded = 0 AND t.status IN ('open','in_progress') AND t.remind_at <= strftime('%Y-%m-%dT%H:%M','now','localtime')")
    for (const r of rows) this.db.run('UPDATE tasks SET reminded = 1 WHERE id = ?', r.id)
    return rows
  }
}
