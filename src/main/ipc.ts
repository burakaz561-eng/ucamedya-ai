// IPC: arayüzden gelen tüm istekler tek bir kanaldan ("uca:invoke") geçer. Yalnızca bu dosyadaki
// izinli komutlar çalıştırılabilir; girdiler doğrulanır; uygulama kilitliyken yalnızca kilit komutları açıktır.
// Hata mesajları arayüze döner, ancak sır içeren değerler hiçbir zaman döndürülmez.

import { app, dialog, ipcMain, shell, type BrowserWindow } from 'electron'
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join, extname, isAbsolute } from 'node:path'
import { z } from 'zod'
import type { AppServices } from './services/app-services'
import { j } from './database/db'
import { log } from './logger'
import { SECRET_NAMES } from './security/secrets'
import { csvToHits } from './integrations/search/providers'
import { COMPANY_COLUMNS, writeCsv, writeXlsx } from './services/exports'
import { verifyBackupFile } from './services/backup'
import { EMAIL_PRESETS } from './outreach/channels'
import { isOpenableUrl } from './http/url-safety'
import tr from '@shared/data/tr-cities.json'
import { APP_NAME } from '@shared/constants'
import { detectBrowsers } from './automation/agent-browser'
import { phoneKey, emailKey } from '@shared/text'

type Handler = (p: any) => unknown // eslint-disable-line @typescript-eslint/no-explicit-any

const id = z.number().int().positive()
const ids = z.array(id).max(5000)
const str = (max = 500) => z.string().max(max)
const optStr = (max = 500) => z.string().max(max).nullable().optional()

export function registerIpc(s: AppServices, getWindow: () => BrowserWindow | null, onRestart: (dbFile?: string) => void) {
  const win = () => getWindow() ?? undefined
  const pickFile = async (filters: { name: string; extensions: string[] }[]) => {
    const r = await dialog.showOpenDialog(win()!, { properties: ['openFile'], filters })
    return r.canceled ? null : r.filePaths[0]
  }
  const savePath = async (name: string, ext: string) => {
    const r = await dialog.showSaveDialog(win()!, { defaultPath: join(s.files.exportsDir(), name), filters: [{ name: ext.toUpperCase(), extensions: [ext] }] })
    return r.canceled ? null : r.filePath
  }
  /** Yalnızca veri klasörü, yedek klasörü ve kayıtlı dosyalar açılabilir. */
  const allowedPath = (p: string) => {
    if (!p || !isAbsolute(p)) return false
    if (s.files.isInside(p)) return true
    if (s.db.get('SELECT 1 FROM files WHERE path = ?', p) || s.db.get('SELECT 1 FROM backups WHERE path = ?', p) || s.db.get('SELECT 1 FROM screenshots WHERE file_path = ?', p)) return true
    return p.startsWith(s.backups.dir(s.settings.get().backup.dir || undefined))
  }

  const H: Record<string, Handler> = {
    // ---------------- Uygulama ----------------
    'app:info': () => ({ name: APP_NAME, version: app.getVersion(), platform: process.platform, arch: process.arch, electron: process.versions.electron, userData: s.paths.userData, dataDir: s.files.root(), schema: s.db.schemaVersion(), safeStorage: s.secrets.available() }),
    'app:checks': () => s.startupChecks(),
    'lock:status': () => ({ enabled: s.lock.enabled(), unlocked: s.lock.isUnlocked() }),
    'lock:unlock': (p) => s.lock.unlock(str(200).parse(p?.password)),
    'lock:set': (p) => s.lock.setPassword(z.string().max(200).nullable().parse(p?.password ?? null)),
    'lock:lock': () => s.lock.lock(),

    // ---------------- Ayarlar ----------------
    'settings:get': () => s.settings.get(),
    'settings:update': (p) => s.settings.update(z.record(z.string(), z.unknown()).parse(p)),
    'secrets:status': () => s.secrets.status(),
    'secrets:set': (p) => {
      const v = z.object({ name: z.enum(SECRET_NAMES), value: str(4000) }).parse(p)
      s.secrets.set(v.name, v.value)
      return s.secrets.status()
    },
    'brand:pickLogo': async () => {
      const f = await pickFile([{ name: 'Logo', extensions: ['png', 'svg', 'jpg', 'jpeg', 'webp'] }])
      if (!f) return null
      const dir = join(s.paths.userData, 'brand')
      mkdirSync(dir, { recursive: true })
      const dest = join(dir, `logo-${Date.now()}${extname(f).toLowerCase()}`)
      copyFileSync(f, dest)
      s.settings.update({ brand: { ...s.settings.get().brand, logoPath: dest } })
      return dest
    },
    'brand:logoData': () => {
      const p = s.settings.get().brand.logoPath
      if (!p || !existsSync(p)) return null
      const ext = extname(p).slice(1).toLowerCase()
      return `data:${ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`};base64,${readFileSync(p).toString('base64')}`
    },
    'dialog:pickFolder': async () => {
      const r = await dialog.showOpenDialog(win()!, { properties: ['openDirectory', 'createDirectory'] })
      return r.canceled ? null : r.filePaths[0]
    },
    'shell:openPath': async (p) => {
      const path = str(2000).parse(p?.path)
      if (!allowedPath(path)) throw new Error('Bu konum açılamaz')
      const err = await shell.openPath(path)
      if (err) throw new Error(err)
    },
    'shell:showItem': (p) => {
      const path = str(2000).parse(p?.path)
      if (!allowedPath(path)) throw new Error('Bu konum açılamaz')
      shell.showItemInFolder(path)
    },
    'shell:openExternal': (p) => {
      const url = str(4000).parse(p?.url)
      if (!isOpenableUrl(url)) throw new Error('Geçersiz adres')
      return shell.openExternal(url)
    },
    'file:imageData': (p) => {
      const path = str(2000).parse(p?.path)
      if (!allowedPath(path) || !existsSync(path)) throw new Error('Görsel bulunamadı')
      const ext = extname(path).slice(1).toLowerCase()
      return `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${readFileSync(path).toString('base64')}`
    },

    // ---------------- Panel ----------------
    'dashboard:stats': () => s.stats.dashboard(),
    'dashboard:series': (p) => s.stats.series(z.enum(['day', 'week', 'month']).parse(p?.period ?? 'day'), z.number().int().min(2).max(60).parse(p?.span ?? 14)),
    'geo:cities': () => tr,
    'stages:list': () => s.db.all('SELECT * FROM stages ORDER BY position'),
    'stages:save': (p) => {
      const v = z.array(z.object({ key: str(40).regex(/^[a-z0-9_]+$/), label: str(60).min(1), color: str(20), terminal: z.boolean().optional() })).min(3).max(40).parse(p?.stages)
      s.db.tx(() => {
        v.forEach((st, i) => s.db.run('INSERT INTO stages(key,label,color,position,terminal,system) VALUES (?,?,?,?,?,0) ON CONFLICT(key) DO UPDATE SET label = excluded.label, color = excluded.color, position = excluded.position, terminal = excluded.terminal', st.key, st.label, st.color, i, !!st.terminal))
        const keep = new Set(v.map((x) => x.key))
        for (const old of s.db.all<{ key: string }>('SELECT key FROM stages')) {
          if (keep.has(old.key)) continue
          if (s.db.get('SELECT 1 FROM companies WHERE stage_key = ?', old.key)) throw new Error(`"${old.key}" aşamasında şirketler var; silmeden önce taşıyın.`)
          if (['new', 'review', 'approved', 'do_not_contact', 'won', 'lost', 'waiting_reply', 'contacted'].includes(old.key)) throw new Error('Sistem aşamaları silinemez (yeniden adlandırılabilir).')
          s.db.run('DELETE FROM stages WHERE key = ?', old.key)
        }
      })
    },

    // ---------------- Araştırma ----------------
    'research:list': () =>
      s.db.all(`SELECT rp.*, (SELECT COUNT(*) FROM research_results r WHERE r.research_id = rp.id AND r.status NOT IN ('duplicate','skipped')) AS found,
        (SELECT COUNT(*) FROM research_results r WHERE r.research_id = rp.id AND r.status = 'done') AS done_count,
        (SELECT COUNT(*) FROM research_results r WHERE r.research_id = rp.id AND r.status = 'failed') AS failed_count,
        (SELECT COUNT(*) FROM research_results r WHERE r.research_id = rp.id AND r.status = 'duplicate') AS dup_count,
        (SELECT id FROM automation_runs a WHERE a.research_id = rp.id AND a.type = 'research' ORDER BY a.id DESC LIMIT 1) AS run_id
        FROM research_projects rp ORDER BY rp.id DESC`).map((r) => ({ ...r, sectors: j(r.sectors, []), locations: j(r.locations, []), stats: j(r.stats, {}), customer_types: j(r.customer_types, []) })),
    'research:get': (p) => {
      const rid = id.parse(p?.id)
      const rp = s.db.get('SELECT * FROM research_projects WHERE id = ?', rid)
      if (!rp) throw new Error('Araştırma bulunamadı')
      return {
        ...rp, sectors: j(rp.sectors, []), locations: j(rp.locations, []), stats: j(rp.stats, {}), queries: j(rp.queries, []), outputs: j(rp.outputs, {}), customer_types: j(rp.customer_types, []),
        results: s.db.all('SELECT r.*, c.name, c.website, c.city, c.opportunity_score, c.priority_group, c.website_status FROM research_results r LEFT JOIN companies c ON c.id = r.company_id WHERE r.research_id = ? ORDER BY r.id', rid),
        run: s.db.get("SELECT id, status, progress, error, log FROM automation_runs WHERE research_id = ? AND type = 'research' ORDER BY id DESC LIMIT 1", rid)
      }
    },
    'research:start': (p) => {
      const v = z.object({
        name: str(120).min(1), sectors: z.array(str(80)).max(30), locations: z.array(z.object({ city: str(60), district: optStr(60) })).max(40),
        customerTypes: z.array(str(40)).max(20), analysisTypes: z.array(str(40)).max(10), targetCount: z.number().int().min(1).max(500),
        provider: z.enum(['google_browser', 'google_places', 'serpapi', 'brave']).optional(), extraQueries: z.array(str(120)).max(20).optional(),
        steps: z.object({ analyze: z.boolean(), screenshots: z.boolean(), pdf: z.boolean(), drafts: z.boolean(), contacts: z.boolean().optional() }), channels: z.array(z.enum(['email', 'whatsapp'])).max(2), tone: str(30), profileId: id.optional()
      }).parse(p)
      const provider = v.provider ?? s.settings.get().search.provider
      if (provider === 'manual' || !s.searchProvider(provider)) throw new Error(provider === 'google_browser' ? 'Google Chrome veya Microsoft Edge bulunamadı; tarayıcı üzerinden arama yapılamaz. "CSV içe aktar" ile manuel liste kullanabilirsiniz.' : 'Seçilen arama sağlayıcısının API anahtarı yok. Entegrasyonlar sayfasından ekleyin veya "CSV içe aktar" ile manuel liste kullanın.')
      const rid = s.db.run('INSERT INTO research_projects(name, sectors, locations, customer_types, analysis_types, outputs, target_count, provider, profile_id, status) VALUES (?,?,?,?,?,?,?,?,?,?)',
        v.name, JSON.stringify(v.sectors), JSON.stringify(v.locations.map((l) => ({ city: l.city, ...(l.district ? { district: l.district } : {}) }))), JSON.stringify(v.customerTypes), JSON.stringify(v.analysisTypes),
        JSON.stringify({ steps: v.steps, channels: v.channels, tone: v.tone, extraQueries: v.extraQueries ?? [] }), v.targetCount, provider, v.profileId ?? null, 'queued').lastInsertRowid
      s.jobs.enqueue('research', `Araştırma: ${v.name}`, { researchId: rid }, { researchId: rid })
      return rid
    },
    'research:importCsv': async (p) => {
      const file = await pickFile([{ name: 'CSV', extensions: ['csv', 'txt'] }])
      if (!file) return null
      const hits = csvToHits(readFileSync(file, 'utf8'))
      if (!hits.length) throw new Error('CSV dosyasında içe aktarılacak satır bulunamadı')
      const v = z.object({ name: str(120).optional(), analyze: z.boolean().optional(), drafts: z.boolean().optional() }).parse(p ?? {})
      const rid = s.db.run("INSERT INTO research_projects(name, provider, target_count, outputs, status, stats) VALUES (?, 'manual', ?, ?, 'queued', ?)", v.name || `CSV içe aktarma ${new Date().toLocaleDateString('tr-TR')}`, hits.length,
        JSON.stringify({ steps: { analyze: v.analyze ?? true, screenshots: true, pdf: v.analyze ?? true, drafts: v.drafts ?? false }, channels: ['email', 'whatsapp'], tone: 'professional' }), JSON.stringify({ discoveryDone: true })).lastInsertRowid
      const st = { new: 0, duplicate: 0, skipped: 0 }
      s.db.tx(() => {
        for (const h of hits.slice(0, 5000)) {
          const r = s.research.ingestHit(rid, h, h.sector ?? null, 'import')
          if (r === 'new') st.new++
          else if (r === 'duplicate') st.duplicate++
          else st.skipped++
        }
      })
      s.db.run('UPDATE research_projects SET stats = ? WHERE id = ?', JSON.stringify({ discoveryDone: true, found: st.new, duplicates: st.duplicate }), rid)
      s.jobs.enqueue('research', `CSV içe aktarma (${hits.length} satır)`, { researchId: rid }, { researchId: rid })
      return { researchId: rid, ...st }
    },
    'research:retryFailed': (p) => {
      const rid = id.parse(p?.id)
      const n = s.research.resetFailed(rid)
      if (n) s.jobs.enqueue('research', `Araştırma (yeniden deneme)`, { researchId: rid }, { researchId: rid })
      return n
    },
    'research:report': (p) => s.jobs.enqueue('research_report', 'Araştırma raporu', { researchId: id.parse(p?.id) }, { researchId: p.id }),
    'research:delete': (p) => {
      const rid = id.parse(p?.id)
      if (s.db.get("SELECT 1 FROM automation_runs WHERE research_id = ? AND status IN ('running','paused','queued')", rid)) throw new Error('Çalışan bir araştırma silinemez; önce iptal edin.')
      s.db.run('DELETE FROM research_projects WHERE id = ?', rid)
    },

    // ---------------- Profiller ----------------
    'profiles:list': () => s.db.all('SELECT * FROM automation_profiles ORDER BY id').map((r) => ({ ...r, config: j(r.config, {}) })),
    'profiles:save': (p) => {
      const v = z.object({ id: id.optional(), name: str(120).min(1), description: optStr(500), config: z.record(z.string(), z.unknown()) }).parse(p)
      if (v.id) s.db.run("UPDATE automation_profiles SET name = ?, description = ?, config = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?", v.name, v.description ?? null, JSON.stringify(v.config), v.id)
      else return s.db.run('INSERT INTO automation_profiles(name, description, config) VALUES (?,?,?)', v.name, v.description ?? null, JSON.stringify(v.config)).lastInsertRowid
      return v.id
    },
    'profiles:delete': (p) => s.db.run('DELETE FROM automation_profiles WHERE id = ?', id.parse(p?.id)),

    // ---------------- Müşteriler ----------------
    'companies:list': (p) => s.companies.list(z.object({ q: optStr(200), stage: optStr(40), group: optStr(40), sector: optStr(80), city: optStr(60), tag: optStr(40), minScore: z.number().optional(), websiteStatus: optStr(30), archived: z.boolean().optional(), researchId: id.optional(), sort: optStr(20), dir: z.enum(['asc', 'desc']).optional(), limit: z.number().int().max(5000).optional(), offset: z.number().int().optional() }).parse(p ?? {}) as Parameters<AppServices['companies']['list']>[0]),
    'companies:get': (p) => s.companies.detail(id.parse(p?.id)),
    'companies:create': (p) => {
      const v = z.object({ name: str(200).min(2), sector: optStr(80), city: optStr(60), district: optStr(60), website: optStr(300), phone: optStr(40), email: optStr(200), address: optStr(300) }).parse(p)
      const dup = s.companies.findDuplicate({ name: v.name, website: v.website, phone: v.phone, city: v.city, email: v.email })
      if (dup?.certain) throw new Error(`Bu şirket zaten kayıtlı görünüyor (#${dup.id}, ${dup.reason}).`)
      const cid = s.companies.create({ name: v.name, sector: v.sector ?? null, city: v.city ?? undefined, district: v.district ?? undefined, website: v.website ?? undefined, phone: v.phone ?? undefined, email: v.email ?? undefined, address: v.address ?? undefined, source: 'manual' })
      if (dup) s.companies.addMatchCandidate(cid, dup.id, dup.reason)
      s.analysis.rescore(cid)
      return cid
    },
    'companies:update': (p) => s.companies.update(id.parse(p?.id), z.record(z.string(), z.unknown()).parse(p?.patch)),
    'companies:setTags': (p) => s.companies.setTags(id.parse(p?.id), z.array(str(40)).max(30).parse(p?.tags)),
    'companies:addNote': (p) => s.companies.addNote(id.parse(p?.id), str(10000).min(1).parse(p?.body)),
    'companies:addContact': (p) => {
      const v = z.object({ id, type: z.enum(['email', 'phone', 'whatsapp', 'social', 'form']), value: str(300).min(3), kind: z.enum(['corporate', 'personal']).optional(), label: optStr(80), sourceUrl: optStr(500) }).parse(p)
      s.companies.addContact(v.id, { type: v.type, value: v.value, kind: v.kind, label: v.label ?? undefined, sourceUrl: v.sourceUrl ?? null, sourceType: 'manual', verified: false })
      s.companies.log(v.id, 'İletişim bilgisi eklendi', `${v.type}: ${v.value}`)
      s.analysis.rescore(v.id)
    },
    'companies:removeContact': (p) => s.db.run('DELETE FROM company_contacts WHERE id = ?', id.parse(p?.contactId)),
    'companies:verifyContact': (p) => s.db.run("UPDATE company_contacts SET verified_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?", id.parse(p?.contactId)),
    'companies:archive': (p) => s.companies.archive(ids.parse(p?.ids), z.boolean().parse(p?.archived)),
    'companies:delete': (p) => s.companies.hardDelete(id.parse(p?.id)),
    'companies:merge': (p) => s.companies.merge(id.parse(p?.keep), id.parse(p?.drop)),
    'companies:duplicates': () => s.companies.duplicates(),
    // ---------------- Web sitesi talepleri ----------------
    'leads:config': () => s.leads.config(),
    'leads:saveConfig': (p) => s.leads.saveConfig(z.object({ siteUrl: optStr(300), enabled: z.boolean().optional(), syncMinutes: z.number().optional(), key: optStr(100) }).parse(p ?? {}) as Parameters<AppServices['leads']['saveConfig']>[0]),
    'leads:test': () => s.leads.test(),
    'leads:sync': async () => {
      const r = await s.leads.sync()
      if (r.imported) s.emit('data-changed', { scope: 'companies' })
      return r
    },
    'leads:list': (p) => s.leads.list(z.object({ status: optStr(20) }).parse(p ?? {}) as { status?: string }),
    'leads:setStatus': (p) => s.leads.setStatus(id.parse(p?.id), z.enum(['new', 'reviewed', 'converted', 'spam']).parse(p?.status)),
    'leads:exportPlugin': async () => {
      const src = join(app.isPackaged ? process.resourcesPath : join(__dirname, '../../resources'), 'wordpress', 'ucamedya-baglanti.zip')
      if (!existsSync(src)) throw new Error('Eklenti paketi bulunamadı (npm run build:wp ile oluşturulur).')
      const r = await dialog.showSaveDialog(win()!, { defaultPath: join(app.getPath('downloads'), 'ucamedya-baglanti.zip'), filters: [{ name: 'ZIP', extensions: ['zip'] }] })
      if (r.canceled || !r.filePath) return null
      copyFileSync(src, r.filePath)
      return r.filePath
    },
    'pipeline:board': () => ({
      stages: s.db.all("SELECT key, label, color, terminal FROM stages WHERE key <> 'archived' ORDER BY position"),
      cards: s.db.all(`SELECT c.id, c.name, c.city, c.sector, c.stage_key, c.opportunity_score, c.priority_group,
          (SELECT MAX(h.at) FROM stage_history h WHERE h.company_id = c.id AND h.to_key = c.stage_key) AS stage_at,
          t.title AS task_title, t.due_at AS task_due
        FROM companies c
        LEFT JOIN tasks t ON t.id = (SELECT id FROM tasks x WHERE x.company_id = c.id AND x.status IN ('open','in_progress') ORDER BY x.due_at IS NULL, x.due_at, x.id LIMIT 1)
        WHERE c.merged_into IS NULL AND c.archived_at IS NULL
        ORDER BY c.opportunity_score IS NULL, c.opportunity_score DESC, c.id DESC LIMIT 3000`)
    }),
    'companies:keepSeparate': (p) => s.companies.keepSeparate(id.parse(p?.a), id.parse(p?.b)),
    'companies:pendingMatches': () => s.companies.pendingMatchCount(),
    'companies:stageHistory': (p) => s.db.all("SELECT h.*, f.label AS from_label, t.label AS to_label FROM stage_history h LEFT JOIN stages f ON f.key = h.from_key LEFT JOIN stages t ON t.key = h.to_key WHERE h.company_id = ? ORDER BY h.at DESC LIMIT 100", id.parse(p?.id)),
    'companies:suppress': (p) => s.companies.suppressCompany(id.parse(p?.id), str(300).parse(p?.reason ?? 'Kullanıcı işaretledi'), 'user'),
    'companies:rescore': (p) => {
      for (const cid of ids.parse(p?.ids)) s.analysis.rescore(cid)
    },
    'companies:bulkStage': (p) => {
      const st = str(40).parse(p?.stage)
      for (const cid of ids.parse(p?.ids)) s.companies.update(cid, { stage_key: st })
    },
    'companies:openFolder': async (p) => {
      const dir = s.files.companyDir(id.parse(p?.id))
      const err = await shell.openPath(dir)
      if (err) throw new Error(err)
    },
    'companies:export': async (p) => {
      const fmt = z.enum(['csv', 'xlsx']).parse(p?.format)
      const out = await savePath(`musteri-listesi-${new Date().toISOString().slice(0, 10)}.${fmt}`, fmt)
      if (!out) return null
      const rows = s.companies.list({ ...(p?.filters ?? {}), limit: 5000 }).rows as Record<string, unknown>[]
      if (fmt === 'csv') writeCsv(out, COMPANY_COLUMNS, rows)
      else {
        const findings = s.db.all(`SELECT c.name AS company, f.category, f.title, f.severity, f.evidence, f.recommendation FROM analysis_findings f JOIN website_analyses a ON a.id = f.analysis_id JOIN companies c ON c.id = a.company_id WHERE a.id IN (SELECT MAX(id) FROM website_analyses WHERE status = 'done' AND company_id IS NOT NULL GROUP BY company_id) ORDER BY c.name`)
        await writeXlsx(out, [
          { name: 'Müşteriler', cols: COMPANY_COLUMNS, rows },
          { name: 'Analiz bulguları', cols: [{ key: 'company', header: 'Şirket', width: 30 }, { key: 'category', header: 'Kategori' }, { key: 'title', header: 'Bulgu', width: 44 }, { key: 'severity', header: 'Önem' }, { key: 'evidence', header: 'Kanıt', width: 60 }, { key: 'recommendation', header: 'Öneri', width: 50 }], rows: findings }
        ])
      }
      s.files.register({ path: out, kind: 'export' })
      return out
    },

    // ---------------- Analiz ----------------
    'analysis:list': (p) => s.db.all(`SELECT a.id, a.company_id, a.version, a.url, a.final_url, a.status, a.scores, a.summary, a.error, a.report_path, a.created_at, a.finished_at, c.name AS company_name FROM website_analyses a LEFT JOIN companies c ON c.id = a.company_id ${p?.companyId ? 'WHERE a.company_id = ?' : ''} ORDER BY a.id DESC LIMIT 500`, ...(p?.companyId ? [id.parse(p.companyId)] : [])).map((r) => ({ ...r, scores: j(r.scores, {}) })),
    'analysis:get': (p) => s.analysis.detail(id.parse(p?.id)),
    'analysis:runCompanies': (p) => {
      const list = ids.min(1).parse(p?.ids)
      return s.jobs.enqueue('analysis', list.length === 1 ? `Site analizi: ${s.db.get<{ name: string }>('SELECT name FROM companies WHERE id = ?', list[0])?.name}` : `Toplu site analizi (${list.length} şirket)`, { companyIds: list }, list.length === 1 ? { companyId: list[0] } : {})
    },
    'analysis:runUrl': (p) => s.jobs.enqueue('analysis', `Hızlı analiz: ${str(300).parse(p?.url)}`, { url: p.url }),
    'analysis:pdf': (p) => s.analysis.generatePdf(id.parse(p?.id)),

    // ---------------- İletişim ----------------
    'drafts:list': (p) => s.outreach.listDrafts(z.object({ channel: optStr(20), status: optStr(20), companyId: id.optional() }).parse(p ?? {}) as { channel?: string; status?: string; companyId?: number }),
    'drafts:create': (p) => s.outreach.createDraft(id.parse(p?.companyId), z.enum(['email', 'whatsapp']).parse(p?.channel), str(30).parse(p?.tone ?? 'professional'), p?.useAi !== false),
    'drafts:createBulk': (p) => s.jobs.enqueue('drafts', `Taslak üretimi (${ids.parse(p?.companyIds).length} şirket)`, { companyIds: p.companyIds, channels: z.array(z.enum(['email', 'whatsapp'])).parse(p?.channels), tone: str(30).parse(p?.tone ?? 'professional') }),
    'drafts:update': (p) => s.outreach.updateDraft(id.parse(p?.id), z.object({ subject: optStr(300), body: str(20000).optional(), tone: str(30).optional() }).parse(p?.patch) as { subject?: string | null; body?: string; tone?: string }),
    'drafts:rewrite': (p) => s.outreach.rewrite(id.parse(p?.id), str(40).parse(p?.action)),
    'drafts:setStatus': (p) => s.outreach.setDraftStatus(ids.parse(p?.ids), z.enum(['approved', 'draft', 'rejected']).parse(p?.status)),
    'drafts:eligibility': (p) => s.outreach.eligibilityFor(id.parse(p?.id)),
    'drafts:regenerate': () => s.outreach.regenerateDrafts(),
    'drafts:delete': (p) => s.db.run("DELETE FROM outreach_drafts WHERE id = ? AND status IN ('draft','rejected','approved')", id.parse(p?.id)),
    'outreach:enqueue': (p) => s.outreach.enqueue(ids.parse(p?.ids), optStr(80).parse(p?.campaign) ?? null),
    'outreach:queue': () => s.outreach.queueSummary(),
    'outreach:start': (p) => s.outreach.startQueue(z.enum(['email', 'whatsapp']).parse(p?.channel)),
    'outreach:pause': (p) => s.outreach.pauseQueue(z.enum(['email', 'whatsapp']).parse(p?.channel)),
    'outreach:cancel': (p) => s.outreach.cancelQueue(z.enum(['email', 'whatsapp']).parse(p?.channel)),
    'outreach:messages': (p) => s.outreach.listMessages(z.object({ channel: optStr(20), status: optStr(20), limit: z.number().int().max(5000).optional() }).parse(p ?? {}) as { channel?: string; status?: string; limit?: number }),
    'outreach:retry': (p) => s.outreach.retry(id.parse(p?.id)),
    'outreach:decide': (p) => s.outreach.decide(id.parse(p?.messageId), z.enum(['send', 'skip', 'stop']).parse(p?.decision)),

    // ---------------- Ajan tarayıcısı (Canlı Kontrol Merkezi) ----------------
    'agent:browsers': () => detectBrowsers().map((b) => ({ kind: b.kind, label: b.label })),
    'agent:status': () => s.agent.status(),
    'agent:start': async (p) => {
      if (p?.kind) s.settings.update({ automation: { ...s.settings.get().automation, browser: z.enum(['chrome', 'edge']).parse(p.kind) } })
      await s.ensureAgent()
      return s.agent.status()
    },
    'agent:stop': async () => {
      await s.agent.close()
      return s.agent.status()
    },
    'agent:preview': () => s.agent.preview(),
    'agent:answer': (p) => s.agent.answerUser(z.boolean().parse(p?.ok)),
    'agent:openLogin': async (p) => {
      const svc = z.enum(['google', 'gmail', 'whatsapp', 'webmail']).parse(p?.service)
      await s.ensureAgent()
      const role = svc === 'whatsapp' ? 'whatsapp' : svc === 'gmail' ? 'gmail' : 'site'
      const page = await s.agent.page(role)
      s.agent.touch(page)
      const wm = s.settings.get().outreach.webmailUrl
      if (svc === 'webmail' && !wm) throw new Error('Önce Ayarlar → Mesaj gönderimi bölümüne webmail adresinizi girin (ör. https://ucamedya.com.tr/webmail/).')
      await page.goto(svc === 'whatsapp' ? 'https://web.whatsapp.com/' : svc === 'gmail' ? 'https://mail.google.com/mail/u/0/' : svc === 'webmail' ? wm : 'https://accounts.google.com/', { waitUntil: 'domcontentloaded' })
      await page.bringToFront()
      s.agent.report({ state: 'needs_user', step: svc === 'whatsapp' ? 'WhatsApp Web açıldı: QR kodu telefonunuzla taratın' : 'Google giriş sayfası açıldı: hesabınıza kendiniz giriş yapın' })
    },
    'agent:checkSessions': async () => {
      await s.ensureAgent()
      const useWebmail = s.settings.get().outreach.emailChannel === 'webmail'
      const gm = useWebmail ? await s.rc.status().catch(() => ({ loggedIn: false, account: null })) : await s.gmail.status().catch(() => ({ loggedIn: false, account: null }))
      const wa = await s.agent.run(() => s.wa.status()).catch(() => 'unknown')
      const google = await s.agent.run(async () => {
        const page = await s.agent.page('site')
        await page.goto('https://myaccount.google.com/', { waitUntil: 'domcontentloaded', timeout: 30000 })
        return /myaccount\.google\.com/.test(page.url()) && !/signin|ServiceLogin/.test(page.url())
      }).catch(() => false)
      s.agent.report({ state: 'ready', step: 'Oturumlar kontrol edildi' })
      return { google, gmail: gm.loggedIn, gmailAccount: gm.account, mailKind: useWebmail ? 'webmail' : 'gmail', whatsapp: wa === 'logged_in', whatsappState: wa }
    },
    'agent:testSearch': async (p) => {
      await s.ensureAgent()
      const hits = await s.google.search(str(200).parse(p?.query ?? 'mimarlık ofisi Kocaeli'), { limit: 8, maxPages: 1 })
      return hits
    },
    'agent:testGmailDraft': async (p) => {
      await s.ensureAgent()
      const mail = s.settings.get().outreach.emailChannel === 'webmail' ? s.rc : s.gmail
      await mail.ensureLoggedIn()
      const st = await mail.status()
      const to = emailKey(String(p?.to ?? '')) || emailKey(st.account ?? '') || emailKey(s.settings.get().brand.email)
      if (!to) throw new Error('Test taslağı için alıcı e-posta adresi gerekli.')
      const r = await mail.prepare({ to, subject: 'UcaMedya AI — test taslağı', body: 'Bu e-posta UcaMedya AI kurulum testinde oluşturuldu ve GÖNDERİLMEDİ. Taslaklar klasöründen silebilirsiniz.' })
      if (!r.ok) throw new Error(r.reason)
      await mail.saveDraft()
      return { ok: true, message: `E-posta taslağı oluşturuldu (alıcı: ${to}) ve gönderilmeden Taslaklar'a kaydedildi.` }
    },
    'agent:testWhatsapp': async (p) => {
      const ph = phoneKey(str(40).parse(p?.phone ?? ''))
      if (!ph) throw new Error('Geçerli bir telefon numarası girin (kendi numaranız önerilir).')
      if (s.settings.get().outreach.whatsappChannel === 'desktop') {
        await shell.openExternal(`whatsapp://send?phone=${ph}&text=${encodeURIComponent('UcaMedya AI test mesajı — lütfen GÖNDERMEYİN.')}`)
        return { ok: true, message: 'WhatsApp masaüstü uygulamasında sohbet açılmış ve test metni yazılmış olmalı. Göndermeyin; metni silebilirsiniz. Açılmadıysa WhatsApp uygulamasının kurulu ve oturumunun açık olduğunu kontrol edin.' }
      }
      await s.ensureAgent()
      await s.wa.ensureLoggedIn()
      const r = await s.wa.prepare(ph, 'UcaMedya AI test mesajı — gönderilmedi.')
      if (!r.ok) throw new Error(r.reason)
      await s.wa.clearCompose()
      return { ok: true, message: `Sohbet açıldı ve test metni yazıldı, sonra silindi (GÖNDERİLMEDİ). Alıcı doğrulaması: ${r.recipientVerified ? 'numara eşleşti' : r.reason ?? r.headerText}` }
    },
    'outreach:manualNext': () => s.outreach.openNextManual(),
    'outreach:manualMark': (p) => s.outreach.markManual(id.parse(p?.id), z.boolean().parse(p?.sent)),
    'outreach:syncReplies': () => {
      if (!s.db.get("SELECT id FROM email_accounts WHERE status = 'ok' AND imap_host IS NOT NULL LIMIT 1")) throw new Error('Otomatik yanıt takibi için IMAP hesabı gerekir. Webmail kullanıyorsanız gelen yanıtları Roundcube gelen kutunuzda görürsünüz; "İSTEMİYORUM" yazanları firmanın sayfasından ret listesine ekleyin. İsterseniz Entegrasyonlar’dan IMAP hesabınızı ekleyebilirsiniz.')
      return s.jobs.enqueue('reply_sync', 'E-posta yanıtlarını kontrol et', {})
    },
    'outreach:setPermission': (p) => {
      const v = z.object({ companyId: id, channel: z.enum(['email', 'whatsapp']), status: str(40), legalBasis: optStr(300), purpose: optStr(300), evidence: optStr(1000) }).parse(p)
      s.outreach.setPermission(v.companyId, v.channel, v.status, v.legalBasis ?? null, v.purpose ?? null, v.evidence ?? null)
    },
    'outreach:logReply': (p) => {
      const v = z.object({ companyId: id, channel: z.enum(['email', 'whatsapp', 'phone']), body: str(5000), optOut: z.boolean().optional() }).parse(p)
      s.db.run("INSERT INTO communication_events(company_id, channel, direction, kind, summary, body) VALUES (?,?, 'in', 'reply', ?, ?)", v.companyId, v.channel, v.body.slice(0, 120), v.body)
      s.companies.log(v.companyId, 'Yanıt kaydedildi (manuel)', v.body.slice(0, 120))
      if (v.optOut) s.companies.suppressCompany(v.companyId, 'Yanıtta iletişim reddi (manuel kayıt)', 'reply')
      else s.db.run("UPDATE companies SET stage_key = CASE WHEN stage_key IN ('waiting_reply','approved','contacted') THEN 'contacted' ELSE stage_key END WHERE id = ?", v.companyId)
    },
    'outreach:exportResults': async () => {
      const out = await savePath(`gonderim-sonuclari-${new Date().toISOString().slice(0, 10)}.xlsx`, 'xlsx')
      if (!out) return null
      const rows = s.outreach.listMessages({ limit: 5000 }) as Record<string, unknown>[]
      await writeXlsx(out, [{ name: 'Gönderimler', cols: [{ key: 'id', header: 'No', width: 7 }, { key: 'company_name', header: 'Şirket', width: 30 }, { key: 'channel', header: 'Kanal' }, { key: 'recipient', header: 'Alıcı', width: 28 }, { key: 'subject', header: 'Konu', width: 40 }, { key: 'status', header: 'Durum' }, { key: 'test_mode', header: 'Test' }, { key: 'error', header: 'Hata', width: 50 }, { key: 'queued_at', header: 'Kuyruğa alınma' }, { key: 'sent_at', header: 'Gönderim' }], rows }])
      s.files.register({ path: out, kind: 'export' })
      return out
    },
    'suppression:list': () => s.db.all('SELECT s.*, c.name AS company_name FROM suppression_list s LEFT JOIN companies c ON c.id = s.company_id ORDER BY s.id DESC LIMIT 2000'),
    'suppression:add': (p) => {
      const v = z.object({ type: z.enum(['email', 'phone', 'domain']), value: str(200).min(3), reason: optStr(300) }).parse(p)
      const key = v.type === 'email' ? v.value.trim().toLowerCase() : v.type === 'phone' ? v.value.replace(/\D/g, '').replace(/^0/, '90') : v.value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]
      s.db.run("INSERT OR IGNORE INTO suppression_list(type, value_key, reason, source) VALUES (?,?,?, 'user')", v.type, key, v.reason ?? null)
    },
    'suppression:remove': (p) => {
      if (p?.confirm !== 'KALDIR') throw new Error('Ret kaydını kaldırmak için onay gerekli')
      s.db.run('DELETE FROM suppression_list WHERE id = ?', id.parse(p?.id))
    },

    // ---------------- E-posta / WhatsApp hesapları ----------------
    'email:presets': () => EMAIL_PRESETS,
    'email:list': () => s.db.all('SELECT id, label, provider, from_name, from_email, smtp_host, smtp_port, smtp_secure, imap_host, imap_port, imap_secure, username, signature, daily_limit, status, last_check_at, last_error FROM email_accounts ORDER BY id').map((a) => ({ ...a, hasPassword: s.secrets.has(`email_pass:${a.id}`) })),
    'email:save': (p) => {
      const v = z.object({ id: id.optional(), label: str(80).min(1), provider: z.enum(['gmail', 'workspace', 'outlook', 'm365', 'smtp']), fromName: optStr(120), fromEmail: z.string().email().max(200), smtpHost: str(200).min(3), smtpPort: z.number().int().min(1).max(65535), smtpSecure: z.boolean(), imapHost: optStr(200), imapPort: z.number().int().min(1).max(65535).nullable().optional(), imapSecure: z.boolean().optional(), username: optStr(200), signature: optStr(2000), dailyLimit: z.number().int().min(1).max(2000), password: z.string().max(500).optional() }).parse(p)
      let aid = v.id
      if (aid) s.db.run("UPDATE email_accounts SET label = ?, provider = ?, from_name = ?, from_email = ?, smtp_host = ?, smtp_port = ?, smtp_secure = ?, imap_host = ?, imap_port = ?, imap_secure = ?, username = ?, signature = ?, daily_limit = ?, status = 'unchecked' WHERE id = ?", v.label, v.provider, v.fromName ?? null, v.fromEmail, v.smtpHost, v.smtpPort, v.smtpSecure, v.imapHost ?? null, v.imapPort ?? null, v.imapSecure ?? true, v.username ?? null, v.signature ?? null, v.dailyLimit, aid)
      else aid = s.db.run('INSERT INTO email_accounts(label, provider, from_name, from_email, smtp_host, smtp_port, smtp_secure, imap_host, imap_port, imap_secure, username, signature, daily_limit) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', v.label, v.provider, v.fromName ?? null, v.fromEmail, v.smtpHost, v.smtpPort, v.smtpSecure, v.imapHost ?? null, v.imapPort ?? null, v.imapSecure ?? true, v.username ?? null, v.signature ?? null, v.dailyLimit).lastInsertRowid
      if (v.password) s.secrets.set(`email_pass:${aid}`, v.password)
      return aid
    },
    'email:test': (p) => s.testEmailAccount(id.parse(p?.id)),
    'email:delete': (p) => {
      const aid = id.parse(p?.id)
      s.secrets.delete(`email_pass:${aid}`)
      s.db.run('DELETE FROM email_accounts WHERE id = ?', aid)
    },
    'whatsapp:get': () => {
      const w = s.db.get('SELECT * FROM whatsapp_accounts ORDER BY id LIMIT 1')
      return w ? { ...w, hasToken: s.secrets.has('whatsapp_token'), templateParams: j(s.settings.getValue('whatsapp_template_params') ?? '[]', []) } : null
    },
    'whatsapp:save': (p) => {
      const v = z.object({ mode: z.enum(['cloud_api', 'click_to_chat']), label: str(80).optional(), phoneNumberId: optStr(60), wabaId: optStr(60), templateName: optStr(120), templateLang: optStr(10), dailyLimit: z.number().int().min(1).max(10000), token: z.string().max(1000).optional(), templateParams: z.array(str(200)).max(10).optional() }).parse(p)
      const ex = s.db.get<{ id: number }>('SELECT id FROM whatsapp_accounts ORDER BY id LIMIT 1')
      if (ex) s.db.run("UPDATE whatsapp_accounts SET mode = ?, label = ?, phone_number_id = ?, waba_id = ?, template_name = ?, template_lang = ?, daily_limit = ?, status = 'unchecked' WHERE id = ?", v.mode, v.label ?? 'WhatsApp', v.phoneNumberId ?? null, v.wabaId ?? null, v.templateName ?? null, v.templateLang ?? 'tr', v.dailyLimit, ex.id)
      else s.db.run('INSERT INTO whatsapp_accounts(label, mode, phone_number_id, waba_id, template_name, template_lang, daily_limit) VALUES (?,?,?,?,?,?,?)', v.label ?? 'WhatsApp', v.mode, v.phoneNumberId ?? null, v.wabaId ?? null, v.templateName ?? null, v.templateLang ?? 'tr', v.dailyLimit)
      if (v.token) s.secrets.set('whatsapp_token', v.token)
      if (v.templateParams) s.settings.setValue('whatsapp_template_params', JSON.stringify(v.templateParams))
    },
    'whatsapp:test': () => s.testIntegration('whatsapp'),

    // ---------------- Teklif / görev ----------------
    'services:list': (p) => s.offers.services(!!p?.all),
    'services:save': (p) => s.offers.saveService(z.object({ id: id.optional(), name: str(120), description: optStr(1000), unit: optStr(30), price: z.number().min(0).nullable().optional(), currency: optStr(5), vatRate: z.number().min(0).max(100).optional(), active: z.boolean().optional() }).parse(p) as Parameters<AppServices['offers']['saveService']>[0]),
    'offers:list': (p) => s.offers.list(p ?? {}),
    'offers:get': (p) => s.offers.get(id.parse(p?.id)),
    'offers:save': (p) => s.offers.save(z.object({
      id: id.optional(), companyId: id, title: str(200).min(1), status: optStr(20), currency: optStr(5), discountType: z.enum(['none', 'percent', 'amount']).optional(), discountValue: z.number().min(0).optional(), vatIncluded: z.boolean().optional(),
      deliveryEstimate: optStr(200), validUntil: optStr(30), paymentTerms: optStr(1000), notes: optStr(4000),
      items: z.array(z.object({ serviceId: id.nullable().optional(), name: str(200).min(1), description: optStr(1000), quantity: z.number().positive(), unit: optStr(30), unitPrice: z.number().min(0), vatRate: z.number().min(0).max(100) })).min(1).max(100)
    }).parse(p) as Parameters<AppServices['offers']['save']>[0]),
    'offers:pdf': (p) => s.offers.pdf(id.parse(p?.id)),
    'offers:delete': (p) => s.db.run("DELETE FROM offers WHERE id = ? AND status = 'draft'", id.parse(p?.id)),
    'tasks:list': (p) => s.offers.listTasks(p ?? {}),
    'tasks:save': (p) => s.offers.saveTask(z.object({ id: id.optional(), title: str(200), description: optStr(4000), companyId: id.nullable().optional(), offerId: id.nullable().optional(), assignee: optStr(80), dueAt: optStr(30), remindAt: optStr(30), priority: optStr(10), status: optStr(20), kind: optStr(40) }).parse(p) as Parameters<AppServices['offers']['saveTask']>[0]),
    'tasks:delete': (p) => s.offers.deleteTask(id.parse(p?.id)),

    // ---------------- Görevler / otomasyon ----------------
    'jobs:list': (p) => s.db.all(`SELECT id, type, title, status, progress, total, done, failed, error, attempts, research_id, company_id, created_at, started_at, finished_at FROM automation_runs ${p?.active ? "WHERE status IN ('queued','running','paused')" : ''} ORDER BY id DESC LIMIT 300`),
    'jobs:get': (p) => {
      const r = s.db.get('SELECT * FROM automation_runs WHERE id = ?', id.parse(p?.id))
      return r ? { ...r, log: j(r.log, []), files: j(r.files, []), payload: j(r.payload, {}), result: j(r.result, null) } : null
    },
    'jobs:pause': (p) => s.jobs.pause(id.parse(p?.id)),
    'jobs:resume': (p) => s.jobs.resume(id.parse(p?.id)),
    'jobs:cancel': (p) => s.jobs.cancel(id.parse(p?.id)),

    // ---------------- Dosyalar ----------------
    'files:list': (p) => {
      const v = z.object({ q: optStr(200), kind: optStr(30), companyId: id.optional(), from: optStr(30), to: optStr(30) }).parse(p ?? {})
      const w = ['1=1']
      const prm: (string | number)[] = []
      if (v.q) w.push('(f.name LIKE ? OR c.name LIKE ?)'), prm.push(`%${v.q}%`, `%${v.q}%`)
      if (v.kind) w.push('f.kind = ?'), prm.push(v.kind)
      if (v.companyId) w.push('f.company_id = ?'), prm.push(v.companyId)
      if (v.from) w.push('f.created_at >= ?'), prm.push(v.from)
      if (v.to) w.push('f.created_at <= ?'), prm.push(`${v.to}T23:59:59`)
      return s.db.all(`SELECT f.*, c.name AS company_name FROM files f LEFT JOIN companies c ON c.id = f.company_id WHERE ${w.join(' AND ')} ORDER BY f.created_at DESC LIMIT 1000`, ...prm)
    },
    'files:reconcile': () => s.files.reconcile(),
    'files:openRoot': async () => {
      const err = await shell.openPath(s.files.root())
      if (err) throw new Error(err)
    },

    // ---------------- Entegrasyonlar ----------------
    'integrations:list': () => s.db.all('SELECT * FROM integrations').map((r) => ({ ...r, details: j(r.details, {}) })),
    'integrations:test': (p) => s.testIntegration(str(40).parse(p?.key)),
    'integrations:disconnect': (p) => {
      const key = str(40).parse(p?.key)
      const map: Record<string, string[]> = { google_places: ['google_places_key'], serpapi: ['serpapi_key'], brave: ['brave_key'], pagespeed: ['pagespeed_key'], ai: ['anthropic_key', 'openai_key'], whatsapp: ['whatsapp_token'] }
      for (const n of map[key] ?? []) s.secrets.delete(n)
      if (key === 'email') for (const a of s.db.all<{ id: number }>('SELECT id FROM email_accounts')) s.secrets.delete(`email_pass:${a.id}`), s.db.run("UPDATE email_accounts SET status = 'unchecked' WHERE id = ?", a.id)
      s.db.run("UPDATE integrations SET status = 'not_configured', last_error = NULL WHERE key = ?", key)
    },

    // ---------------- Yedekleme ----------------
    'backup:list': () => s.backups.list(),
    'backup:create': () => s.jobs.enqueue('backup', 'Manuel yedek', { kind: 'manual' }),
    'backup:export': async (p) => {
      const src = str(2000).parse(p?.path)
      if (!allowedPath(src)) throw new Error('Geçersiz yedek')
      const r = await dialog.showOpenDialog(win()!, { properties: ['openDirectory', 'createDirectory'], title: 'Yedeğin kopyalanacağı klasörü seçin' })
      if (r.canceled) return null
      return s.backups.exportTo(src, r.filePaths[0])
    },
    'backup:restore': async (p) => {
      const file = p?.path ? str(2000).parse(p.path) : await pickFile([{ name: 'UcaMedya AI yedeği', extensions: ['sqlite', 'db'] }])
      if (!file) return null
      const chk = verifyBackupFile(file, s.db.latestVersion())
      if (!chk.ok) throw new Error(`Geri yükleme yapılmadı: ${chk.message}`)
      if (p?.confirm !== true) return { needsConfirm: true, message: chk.message, path: file }
      s.backups.create('pre_restore', undefined, 'Geri yükleme öncesi otomatik yedek')
      onRestart(file)
      return { restarting: true }
    },

    // ---------------- Raporlar ----------------
    'reports:sales': () => ({
      funnel: s.db.all("SELECT s.label AS k, COUNT(c.id) AS n FROM stages s LEFT JOIN companies c ON c.stage_key = s.key AND c.merged_into IS NULL GROUP BY s.key ORDER BY s.position"),
      offers: s.db.all('SELECT status AS k, COUNT(*) AS n, COALESCE(SUM(total),0) AS total FROM offers GROUP BY status'),
      channels: s.db.all("SELECT channel AS k, SUM(status IN ('sent','delivered','read')) AS sent, SUM(status = 'failed') AS failed, SUM(status = 'blocked') AS blocked, SUM(status = 'test_sent') AS test FROM outreach_messages GROUP BY channel"),
      replies: s.db.all("SELECT channel AS k, COUNT(DISTINCT company_id) AS n FROM communication_events WHERE kind = 'reply' GROUP BY channel"),
      topIssues: s.db.all("SELECT f.title AS k, COUNT(DISTINCT a.company_id) AS n FROM analysis_findings f JOIN website_analyses a ON a.id = f.analysis_id WHERE a.id IN (SELECT MAX(id) FROM website_analyses WHERE status = 'done' AND company_id IS NOT NULL GROUP BY company_id) GROUP BY f.code ORDER BY n DESC LIMIT 10"),
      bySector: s.db.all("SELECT COALESCE(sector,'Belirtilmemiş') AS k, COUNT(*) AS n FROM companies WHERE merged_into IS NULL GROUP BY k ORDER BY n DESC LIMIT 12"),
      byCity: s.db.all("SELECT COALESCE(city,'Belirtilmemiş') AS k, COUNT(*) AS n FROM companies WHERE merged_into IS NULL GROUP BY k ORDER BY n DESC LIMIT 12")
    })
  }

  const LOCK_FREE = new Set(['app:info', 'lock:status', 'lock:unlock', 'settings:get', 'brand:logoData'])

  ipcMain.handle('uca:invoke', async (event, channel: unknown, payload: unknown) => {
    try {
      const url = event.senderFrame?.url ?? ''
      if (!(url.startsWith('file://') || (process.env.ELECTRON_RENDERER_URL && url.startsWith(process.env.ELECTRON_RENDERER_URL)))) throw new Error('Yetkisiz istek kaynağı')
      if (typeof channel !== 'string' || !Object.prototype.hasOwnProperty.call(H, channel)) throw new Error('Bilinmeyen komut')
      if (!LOCK_FREE.has(channel) && !s.lock.isUnlocked()) throw new Error('Uygulama kilitli')
      const data = await H[channel](payload)
      return { ok: true, data }
    } catch (e) {
      const msg = e instanceof z.ZodError ? `Geçersiz girdi: ${e.issues.map((i) => `${i.path.join('.')} ${i.message}`).slice(0, 3).join('; ')}` : (e as Error).message
      if (!(e instanceof z.ZodError)) log('warn', `IPC ${String(channel)}: ${msg}`)
      return { ok: false, error: msg }
    }
  })
}
