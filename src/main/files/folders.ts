// Müşteri klasör sistemi ve Dosya Merkezi senkronu.
// Yapı: <veri>/<yıl>/<Sektör>/<İl>/<Firma Adı>-<id>/{company.json, analyses/v<n>-<tarih>/..., contact/, outreach/, offers/, history/}
// Kimlik eki sayesinde aynı adlı iki firma çakışmaz; yeniden analiz yeni sürüm klasörüne yazılır.

import { mkdirSync, writeFileSync, existsSync, statSync, readdirSync, renameSync } from 'node:fs'
import { join, relative, isAbsolute, resolve, basename } from 'node:path'
import type { Db } from '../database/db'
import { safeFolderName } from '@shared/text'

export class FileStore {
  constructor(
    private db: Db,
    private getRoot: () => string
  ) {}

  root(): string {
    const r = this.getRoot()
    mkdirSync(r, { recursive: true })
    return r
  }

  /** Yol veri klasörünün içinde mi? (Dosya Merkezi dışına erişimi engeller.) */
  isInside(p: string): boolean {
    const rel = relative(resolve(this.root()), resolve(p))
    return !!rel && !rel.startsWith('..') && !isAbsolute(rel)
  }

  companyDir(companyId: number): string {
    const c = this.db.get<{ id: number; name: string; sector: string | null; city: string | null; folder_path: string | null; first_research_at: string }>(
      'SELECT id, name, sector, city, folder_path, first_research_at FROM companies WHERE id = ?',
      companyId
    )
    if (!c) throw new Error('Şirket bulunamadı')
    if (c.folder_path && existsSync(c.folder_path)) return c.folder_path
    const year = (c.first_research_at || new Date().toISOString()).slice(0, 4)
    const dir = join(this.root(), year, safeFolderName(c.sector || 'Diğer'), safeFolderName(c.city || 'Konum Yok'), `${safeFolderName(c.name, 50)}-${c.id}`)
    mkdirSync(dir, { recursive: true })
    for (const sub of ['analyses', 'contact', 'outreach', 'offers', 'history', 'attachments']) mkdirSync(join(dir, sub), { recursive: true })
    this.db.run('UPDATE companies SET folder_path = ? WHERE id = ?', dir, c.id)
    return dir
  }

  analysisDir(companyId: number, version: number): string {
    const dir = join(this.companyDir(companyId), 'analyses', `v${version}-${new Date().toISOString().slice(0, 10)}`)
    mkdirSync(join(dir, 'screenshots'), { recursive: true })
    return dir
  }

  /** Şirket bağlı olmayan (hızlı) analizler için klasör. */
  looseAnalysisDir(id: number): string {
    const dir = join(this.root(), 'Hızlı Analizler', `analiz-${id}-${new Date().toISOString().slice(0, 10)}`)
    mkdirSync(join(dir, 'screenshots'), { recursive: true })
    return dir
  }

  exportsDir(): string {
    const dir = join(this.root(), 'Dışa Aktarımlar')
    mkdirSync(dir, { recursive: true })
    return dir
  }

  researchDir(researchId: number, name: string): string {
    const dir = join(this.root(), 'Araştırma Raporları', `${researchId}-${safeFolderName(name, 50)}`)
    mkdirSync(dir, { recursive: true })
    return dir
  }

  writeText(path: string, content: string) {
    writeFileSync(path, content, 'utf8')
  }

  writeJson(path: string, data: unknown) {
    writeFileSync(path, JSON.stringify(data, null, 2), 'utf8')
  }

  /** Dosyayı kaydeder ve Dosya Merkezi kaydı oluşturur/günceller. */
  register(meta: { path: string; kind: string; companyId?: number | null; researchId?: number | null; analysisId?: number | null; offerId?: number | null; name?: string }) {
    let bytes: number | null = null
    try {
      bytes = statSync(meta.path).size
    } catch {
      bytes = null
    }
    this.db.run(
      `INSERT INTO files(company_id, research_id, analysis_id, offer_id, kind, name, path, bytes) VALUES (?,?,?,?,?,?,?,?)
       ON CONFLICT(path) DO UPDATE SET bytes = excluded.bytes, kind = excluded.kind, created_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
      meta.companyId ?? null,
      meta.researchId ?? null,
      meta.analysisId ?? null,
      meta.offerId ?? null,
      meta.kind,
      meta.name ?? basename(meta.path),
      meta.path,
      bytes
    )
  }

  /** Şirket bilgisini company.json'a ve etkinlik geçmişini history/activity-log.json'a yazar. */
  syncCompanyFiles(companyId: number) {
    const dir = this.companyDir(companyId)
    const c = this.db.get('SELECT * FROM companies WHERE id = ?', companyId)
    const contacts = this.db.all('SELECT type, value, kind, label, source_url, source_type, collected_at, verified_at FROM company_contacts WHERE company_id = ?', companyId)
    this.writeJson(join(dir, 'company.json'), { ...c, contacts })
    this.register({ path: join(dir, 'company.json'), kind: 'company_json', companyId })
    this.writeJson(join(dir, 'contact', 'contact-details.json'), contacts)
    const acts = this.db.all('SELECT action, detail, actor, created_at FROM activity_logs WHERE company_id = ? ORDER BY id', companyId)
    this.writeJson(join(dir, 'history', 'activity-log.json'), acts)
  }

  /**
   * Dosya Merkezi senkronu: veritabanında olup diskte bulunmayan kayıtları siler,
   * şirket klasörlerinde olup kaydı olmayan dosyaları ekler.
   */
  reconcile(): { removed: number; added: number } {
    let removed = 0
    let added = 0
    for (const f of this.db.all<{ id: number; path: string }>('SELECT id, path FROM files')) {
      if (!existsSync(f.path)) {
        this.db.run('DELETE FROM files WHERE id = ?', f.id)
        removed++
      }
    }
    for (const c of this.db.all<{ id: number; folder_path: string }>('SELECT id, folder_path FROM companies WHERE folder_path IS NOT NULL')) {
      if (!existsSync(c.folder_path)) continue
      const walk = (d: string, depth: number) => {
        if (depth > 4) return
        for (const e of readdirSync(d, { withFileTypes: true })) {
          const p = join(d, e.name)
          if (e.isDirectory()) walk(p, depth + 1)
          else if (!this.db.get('SELECT 1 FROM files WHERE path = ?', p)) {
            const kind = /\.png$|\.jpe?g$|\.webp$/i.test(e.name) ? 'screenshot' : /\.pdf$/i.test(e.name) ? 'report_pdf' : /\.txt$/i.test(e.name) ? 'draft' : 'attachment'
            this.register({ path: p, kind, companyId: c.id })
            added++
          }
        }
      }
      walk(c.folder_path, 0)
    }
    return { removed, added }
  }

  /** Şirket klasörünü kalıcı silme yerine "Silinenler" klasörüne taşır (yanlışlıkla silmeye karşı). */
  moveCompanyFolderToTrash(companyId: number) {
    const c = this.db.get<{ folder_path: string | null }>('SELECT folder_path FROM companies WHERE id = ?', companyId)
    if (!c?.folder_path || !existsSync(c.folder_path)) return null
    const trash = join(this.root(), '_Silinenler')
    mkdirSync(trash, { recursive: true })
    const dest = join(trash, `${basename(c.folder_path)}-${Date.now()}`)
    renameSync(c.folder_path, dest)
    return dest
  }
}
