// Veritabanı yedekleme ve geri yükleme.
// Yedek: VACUUM INTO ile tutarlı anlık kopya (uygulama çalışırken bile bozulmaz) + bütünlük kontrolü.
// Geri yükleme: dosya önce geçici bir kopyada açılıp bütünlük ve şema sürümü doğrulanır; mevcut veritabanının
// "geri yükleme öncesi" yedeği alınır; ardından uygulama yeni dosyayla yeniden başlatılır.

import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { join, basename } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { Db } from '../database/db'

export class BackupService {
  constructor(
    private db: Db,
    private defaultDir: () => string
  ) {}

  dir(custom?: string) {
    const d = custom || this.defaultDir()
    mkdirSync(d, { recursive: true })
    return d
  }

  create(kind: 'manual' | 'auto' | 'pre_restore', customDir?: string, note?: string) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const file = join(this.dir(customDir), `ucamedya-ai-yedek-${kind}-${stamp}.sqlite`)
    this.db.backupTo(file)
    const check = verifyBackupFile(file)
    const bytes = statSync(file).size
    this.db.run('INSERT INTO backups(path, bytes, kind, schema_version, status, note) VALUES (?,?,?,?,?,?)', file, bytes, kind, check.version, check.ok ? 'ok' : 'corrupt', note ?? check.message)
    if (!check.ok) throw new Error(`Yedek dosyası doğrulanamadı: ${check.message}`)
    return { file, bytes }
  }

  list() {
    return this.db.all('SELECT * FROM backups ORDER BY id DESC LIMIT 200').map((b) => ({ ...b, exists: existsSync(String(b.path)) }))
  }

  /** Eski otomatik yedekleri saklama sınırına göre temizler (manuel yedeklere dokunmaz). */
  prune(keep: number, customDir?: string) {
    const d = this.dir(customDir)
    const autos = readdirSync(d).filter((f) => /^ucamedya-ai-yedek-auto-.*\.sqlite$/.test(f)).sort().reverse()
    for (const f of autos.slice(Math.max(1, keep))) {
      try {
        unlinkSync(join(d, f))
        this.db.run("UPDATE backups SET status = 'deleted' WHERE path = ?", join(d, f))
      } catch {
        /* yok say */
      }
    }
  }

  lastAuto(): string | null {
    return this.db.get<{ created_at: string }>("SELECT created_at FROM backups WHERE kind = 'auto' AND status = 'ok' ORDER BY id DESC LIMIT 1")?.created_at ?? null
  }

  exportTo(src: string, destDir: string) {
    if (!existsSync(src)) throw new Error('Yedek dosyası bulunamadı')
    const dest = join(destDir, basename(src))
    copyFileSync(src, dest)
    return dest
  }
}

export function verifyBackupFile(file: string, maxVersion?: number): { ok: boolean; message: string; version: number | null; companies?: number } {
  let tmp: DatabaseSync | null = null
  try {
    tmp = new DatabaseSync(file, { readOnly: true })
    const ic = tmp.prepare('PRAGMA integrity_check').all() as { integrity_check: string }[]
    const msg = ic.map((x) => x.integrity_check).join('; ')
    const version = (tmp.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
    if (msg !== 'ok') return { ok: false, message: `Bütünlük hatası: ${msg.slice(0, 200)}`, version }
    const hasTables = tmp.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name IN ('companies','app_settings','website_analyses')").get() as { n: number }
    if (hasTables.n < 3) return { ok: false, message: 'Bu dosya bir UcaMedya AI veritabanı değil.', version }
    if (maxVersion != null && version > maxVersion) return { ok: false, message: `Yedek, bu uygulama sürümünden daha yeni bir şemaya sahip (${version}).`, version }
    const companies = (tmp.prepare('SELECT COUNT(*) AS n FROM companies').get() as { n: number }).n
    return { ok: true, message: `Doğrulandı: şema ${version}, ${companies} şirket kaydı.`, version, companies }
  } catch (e) {
    return { ok: false, message: `Dosya açılamadı: ${(e as Error).message}`, version: null }
  } finally {
    tmp?.close()
  }
}
