// Tasarım konsepti: son başarılı analizden konsept verisi üretir, PDF sunumunu şirket klasörüne kaydeder.

import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Db } from '../database/db'
import { j } from '../database/db'
import type { FileStore } from '../files/folders'
import type { CompanyService } from '../services/companies'
import type { SettingsService } from '../services/settings'
import { brandForPdf, htmlToPdf, imageDataUri } from '../reports/pdf'
import { buildConcept, type ConceptInput } from './concept'
import { conceptHtml } from './concept-template'

interface Metrics {
  desktop?: { title?: string | null; viewport?: unknown; text?: { families?: unknown[]; colors?: number }; seo?: { description?: string | null; h1?: string[]; headings?: { level: number; text: string }[] } } | null
  mobile?: { viewport?: { meta?: string | null } | unknown; hamburger?: boolean } | null
}

export class ConceptService {
  constructor(
    private db: Db,
    private files: FileStore,
    private companies: CompanyService,
    private settings: SettingsService
  ) {}

  /** Konsept girdisini veritabanından toplar (yalnızca ölçülmüş veriler). */
  input(companyId: number): { input: ConceptInput; analysisId: number } {
    const c = this.db.get<{ name: string; sector: string | null; city: string | null; website: string | null }>('SELECT name, sector, city, website FROM companies WHERE id = ?', companyId)
    if (!c) throw new Error('Şirket bulunamadı')
    const a = this.db.get<{ id: number; metrics: string }>("SELECT id, metrics FROM website_analyses WHERE company_id = ? AND status = 'done' ORDER BY id DESC LIMIT 1", companyId)
    if (!a) throw new Error('Konsept için önce web sitesinin başarıyla analiz edilmesi gerekir.')
    const m = j<Metrics>(a.metrics, {})
    const d = m.desktop ?? {}
    const vpMeta = (m.mobile?.viewport as { meta?: string | null } | undefined)?.meta ?? null
    const contact = (types: string[]) => this.db.get<{ value: string }>(`SELECT value FROM company_contacts WHERE company_id = ? AND type IN (${types.map(() => '?').join(',')}) ORDER BY source_type = 'website' DESC, id LIMIT 1`, companyId, ...types)?.value ?? null
    const mobileNo = this.db.get<{ value: string }>("SELECT value FROM company_contacts WHERE company_id = ? AND (type = 'whatsapp' OR (type = 'phone' AND value_key LIKE '905%')) ORDER BY type = 'whatsapp' DESC LIMIT 1", companyId)?.value ?? null
    return {
      analysisId: a.id,
      input: {
        company: c,
        title: d.title ?? null,
        metaDescription: d.seo?.description ?? null,
        h1: d.seo?.h1 ?? [],
        headings: d.seo?.headings ?? [],
        fontFamilies: Array.isArray(d.text?.families) ? d.text!.families!.length : null,
        textColors: typeof d.text?.colors === 'number' ? d.text.colors : null,
        hasViewport: m.mobile ? !!vpMeta && /width=device-width/i.test(vpMeta) : null,
        hamburger: typeof m.mobile?.hamburger === 'boolean' ? m.mobile.hamburger : null,
        contacts: { phone: contact(['phone', 'whatsapp']), whatsapp: mobileNo, email: contact(['email']) },
        findings: this.db.all('SELECT code, title, severity, recommendation, category FROM analysis_findings WHERE analysis_id = ? ORDER BY severity = \'high\' DESC, severity = \'medium\' DESC, id', a.id)
      }
    }
  }

  async create(companyId: number): Promise<{ id: number; pdf: string }> {
    const { input, analysisId } = this.input(companyId)
    const data = buildConcept(input)
    const shot = (vp: string) => this.db.get<{ file_path: string }>("SELECT file_path FROM screenshots WHERE analysis_id = ? AND viewport = ? AND COALESCE(page_kind,'home') = 'home' ORDER BY id LIMIT 1", analysisId, vp)?.file_path
    const ds = shot('desktop')
    const ms = shot('mobile')
    const date = new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })
    const html = conceptHtml(brandForPdf(this.settings.get().brand), data, {
      company: { name: input.company.name, website: input.company.website },
      date,
      before: { desktop: ds ? imageDataUri(ds, 1100) : null, mobile: ms ? imageDataUri(ms, 500) : null }
    })
    const id = this.db.run('INSERT INTO concepts(company_id, analysis_id, data) VALUES (?,?,?)', companyId, analysisId, JSON.stringify(data)).lastInsertRowid
    const out = join(this.files.companyDir(companyId), 'concepts', `tasarim-konsepti-${id}.pdf`)
    mkdirSync(dirname(out), { recursive: true })
    await htmlToPdf(html, out)
    this.db.run('UPDATE concepts SET pdf_path = ? WHERE id = ?', out, id)
    this.files.register({ path: out, kind: 'concept_pdf', companyId, analysisId })
    this.companies.log(companyId, 'Tasarım konsepti hazırlandı', 'Örnek konsept — gerçek siteye uygulanmadı', 'user')
    return { id, pdf: out }
  }
}
