// Kalıcı görev motoru. Her görev automation_runs tablosunda saklanır; uygulama kapanıp açıldığında
// "çalışıyor" kalan görevler "yarıda kaldı" olarak işaretlenir ve kullanıcı isterse kaldığı yerden
// devam ettirilir (işleyiciler tamamlanan adımları atlayacak şekilde yazılır → tekrar iş yapılmaz).
// Uzun işler ana süreçte asenkron çalışır; arayüz donmaz.

import type { Db } from '../database/db'
import { j } from '../database/db'
import { log } from '../logger'

export interface JobContext {
  runId: number
  payload: Record<string, unknown>
  signal: AbortSignal
  /** Duraklatılmışsa devam ettirilene (veya iptal edilene) kadar bekler. */
  checkpoint(): Promise<void>
  progress(done: number, total: number, message?: string): void
  failItem(): void
  log(message: string): void
  addFile(path: string): void
}

export type JobHandler = (ctx: JobContext) => Promise<unknown>

interface Live {
  ctrl: AbortController
  paused: boolean
  resumeWaiters: (() => void)[]
  logBuf: string[]
}

export class JobEngine {
  private handlers = new Map<string, JobHandler>()
  private live = new Map<number, Live>()
  private running = 0
  private pumpScheduled = false

  constructor(
    private db: Db,
    private getConcurrency: () => number,
    private emit: (ev: { runId: number; type: string; status: string; progress: number; message?: string; researchId?: number | null; companyId?: number | null }) => void
  ) {}

  register(type: string, h: JobHandler) {
    this.handlers.set(type, h)
  }

  /** Uygulama açılışında çağrılır. */
  recoverInterrupted(): number {
    const r = this.db.run("UPDATE automation_runs SET status = 'interrupted', error = COALESCE(error, 'Uygulama kapatıldığında görev yarıda kaldı.') WHERE status IN ('running','paused')")
    this.db.run("UPDATE research_projects SET status = 'interrupted' WHERE status IN ('running','paused')")
    this.db.run("UPDATE research_results SET status = 'pending', message = 'Yarıda kaldı; devam ettirildiğinde yeniden işlenecek' WHERE status = 'running'")
    this.db.run("UPDATE website_analyses SET status = 'failed', error = 'Uygulama kapatıldığında analiz yarıda kaldı' WHERE status IN ('pending','running')")
    return r.changes
  }

  enqueue(type: string, title: string, payload: Record<string, unknown>, refs: { researchId?: number; companyId?: number } = {}): number {
    if (!this.handlers.has(type)) throw new Error(`Bilinmeyen görev türü: ${type}`)
    const r = this.db.run('INSERT INTO automation_runs(type, title, payload, research_id, company_id) VALUES (?,?,?,?,?)', type, title, JSON.stringify(payload), refs.researchId ?? null, refs.companyId ?? null)
    this.emitRow(r.lastInsertRowid)
    this.schedulePump()
    return r.lastInsertRowid
  }

  private schedulePump() {
    if (this.pumpScheduled) return
    this.pumpScheduled = true
    setImmediate(() => {
      this.pumpScheduled = false
      this.pump()
    })
  }

  private pump() {
    const limit = Math.max(1, Math.min(6, this.getConcurrency()))
    while (this.running < limit) {
      const next = this.db.get<{ id: number }>("SELECT id FROM automation_runs WHERE status = 'queued' ORDER BY id LIMIT 1")
      if (!next) return
      this.db.run("UPDATE automation_runs SET status = 'running', started_at = COALESCE(started_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')), attempts = attempts + 1 WHERE id = ?", next.id)
      this.running++
      void this.execute(next.id).finally(() => {
        this.running--
        this.schedulePump()
      })
    }
  }

  private async execute(id: number) {
    const row = this.db.get<{ type: string; payload: string; research_id: number | null; company_id: number | null }>('SELECT type, payload, research_id, company_id FROM automation_runs WHERE id = ?', id)!
    const handler = this.handlers.get(row.type)!
    const live: Live = { ctrl: new AbortController(), paused: false, resumeWaiters: [], logBuf: j<string[]>(this.db.get<{ log: string }>('SELECT log FROM automation_runs WHERE id = ?', id)?.log, []) }
    this.live.set(id, live)
    const files: string[] = []
    let failedItems = 0
    const flushLog = () => this.db.run('UPDATE automation_runs SET log = ?, files = ? WHERE id = ?', JSON.stringify(live.logBuf.slice(-400)), JSON.stringify(files.slice(-500)), id)
    const ctx: JobContext = {
      runId: id,
      payload: j(row.payload, {}),
      signal: live.ctrl.signal,
      checkpoint: async () => {
        if (live.ctrl.signal.aborted) throw new CancelledError()
        if (!live.paused) return
        await new Promise<void>((res) => live.resumeWaiters.push(res))
        if (live.ctrl.signal.aborted) throw new CancelledError()
      },
      progress: (done, total, message) => {
        const p = total ? Math.min(1, done / total) : 0
        this.db.run('UPDATE automation_runs SET done = ?, total = ?, progress = ?, failed = ? WHERE id = ?', done, total, p, failedItems, id)
        if (message) ctx.log(message)
        this.emit({ runId: id, type: row.type, status: live.paused ? 'paused' : 'running', progress: p, message, researchId: row.research_id, companyId: row.company_id })
      },
      failItem: () => {
        failedItems++
      },
      log: (m) => {
        live.logBuf.push(`${new Date().toISOString().slice(11, 19)} ${m}`)
        if (live.logBuf.length % 5 === 0) flushLog()
      },
      addFile: (p) => files.push(p)
    }
    try {
      const result = await handler(ctx)
      flushLog()
      this.db.run(
        "UPDATE automation_runs SET status = 'completed', progress = 1, failed = ?, result = ?, error = NULL, finished_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
        failedItems, JSON.stringify(result ?? null).slice(0, 20000), id
      )
    } catch (e) {
      flushLog()
      const cancelled = e instanceof CancelledError || live.ctrl.signal.aborted
      const msg = cancelled ? 'Kullanıcı tarafından iptal edildi' : (e as Error).message
      if (!cancelled) log('error', `Görev #${id} (${row.type}) başarısız: ${msg}`)
      this.db.run("UPDATE automation_runs SET status = ?, error = ?, failed = ?, finished_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?", cancelled ? 'cancelled' : 'failed', msg.slice(0, 2000), failedItems, id)
    } finally {
      this.live.delete(id)
      this.emitRow(id)
    }
  }

  private emitRow(id: number) {
    const r = this.db.get<{ type: string; status: string; progress: number; error: string | null; research_id: number | null; company_id: number | null }>('SELECT type, status, progress, error, research_id, company_id FROM automation_runs WHERE id = ?', id)
    if (r) this.emit({ runId: id, type: r.type, status: r.status, progress: r.progress, message: r.error ?? undefined, researchId: r.research_id, companyId: r.company_id })
  }

  pause(id: number) {
    const l = this.live.get(id)
    if (!l) throw new Error('Görev şu anda çalışmıyor')
    l.paused = true
    this.db.run("UPDATE automation_runs SET status = 'paused' WHERE id = ?", id)
    this.emitRow(id)
  }

  resume(id: number) {
    const l = this.live.get(id)
    if (l) {
      l.paused = false
      this.db.run("UPDATE automation_runs SET status = 'running' WHERE id = ?", id)
      l.resumeWaiters.splice(0).forEach((f) => f())
      this.emitRow(id)
      return
    }
    // Yarıda kalmış / başarısız görev: aynı yükle yeniden kuyruğa alınır (işleyici tamamlananları atlar)
    const r = this.db.get<{ status: string }>('SELECT status FROM automation_runs WHERE id = ?', id)
    if (!r) throw new Error('Görev bulunamadı')
    if (!['interrupted', 'failed', 'cancelled'].includes(r.status)) throw new Error('Bu görev devam ettirilemez')
    this.db.run("UPDATE automation_runs SET status = 'queued', error = NULL, finished_at = NULL WHERE id = ?", id)
    this.emitRow(id)
    this.schedulePump()
  }

  cancel(id: number) {
    const l = this.live.get(id)
    if (l) {
      l.ctrl.abort()
      l.resumeWaiters.splice(0).forEach((f) => f())
      return
    }
    this.db.run("UPDATE automation_runs SET status = 'cancelled', finished_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND status IN ('queued','interrupted','failed')", id)
    this.emitRow(id)
  }

  isActive(id: number) {
    return this.live.has(id)
  }

  activeCount() {
    return this.running
  }

  cancelAll() {
    for (const l of this.live.values()) l.ctrl.abort()
  }
}

export class CancelledError extends Error {
  constructor() {
    super('İptal edildi')
  }
}

/** Sınırlı eşzamanlılıkla bir dizi iş öğesini işler. */
export async function mapLimit<T>(items: T[], limit: number, fn: (item: T, index: number) => Promise<void>) {
  let i = 0
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (i < items.length) {
      const idx = i++
      await fn(items[idx], idx)
    }
  })
  await Promise.all(workers)
}
