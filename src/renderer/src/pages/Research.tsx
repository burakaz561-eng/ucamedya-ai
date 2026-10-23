// Sektör Araştırması: araştırma geçmişi, canlı şirket bazlı aşamalar, kontrol düğmeleri, toplu rapor.

import { useState } from 'react'
import { Pause, Play, Square, RotateCcw, FileText, Users, ScrollText, Trash2 } from 'lucide-react'
import { call, useApi } from '../lib/api'
import { useNav } from '../lib/nav'
import { Badge, Btn, Card, Empty, Loading, Modal, Progress, useAction, useConfirm } from '../components/ui'
import { DataTable } from '../components/DataTable'
import { RobotHint } from '../robot/Robot'
import { RUN_STATUS, SITE_STATUS, fmtDate, fmtRel, GROUP_LABELS, GROUP_TONE } from '../lib/format'
import type { PageProps } from '../lib/page'

/* eslint-disable @typescript-eslint/no-explicit-any */
const PHASES = ['found', 'website', 'analyzing', 'screenshots', 'contacts', 'profiling', 'done']
const PHASE_LABEL: Record<string, string> = { found: 'Şirket bulundu', website: 'Web sitesi tespit', analyzing: 'Analiz ediliyor', screenshots: 'Ekran görüntüleri', contacts: 'İletişim kontrolü', profiling: 'Profil hazırlanıyor', done: 'İnceleme tamamlandı', skipped: 'Atlandı' }

export function ResearchLive({ id, compact }: { id: number; compact?: boolean }) {
  const { data: r, reload } = useApi<any>('research:get', { id }, ['research', 'jobs', 'analyses'])
  const { go, openCompany } = useNav()
  const { run } = useAction()
  const [log, setLog] = useState(false)
  if (!r) return <Card><Loading /></Card>
  const results = r.results as any[]
  const valid = results.filter((x) => !['duplicate', 'skipped'].includes(x.status))
  const done = valid.filter((x) => x.status === 'done').length
  const failed = valid.filter((x) => x.status === 'failed').length
  const dup = results.filter((x) => x.status === 'duplicate').length
  const noSite = valid.filter((x) => x.website_status === 'none').length
  const unreachable = valid.filter((x) => ['unreachable', 'error', 'blocked_robots'].includes(x.website_status)).length
  const runId = r.run?.id
  const st = r.run?.status ?? r.status
  const discovering = st === 'running' && !r.stats?.discoveryDone
  return (
    <Card
      title={<span className="ellipsis" style={{ maxWidth: compact ? 260 : 520 }}>{r.name}</span>}
      actions={
        <>
          <Badge tone={RUN_STATUS[st]?.[1]}>{RUN_STATUS[st]?.[0] ?? st}</Badge>
          {runId && st === 'running' && <Btn size="sm" icon={<Pause />} onClick={() => run(() => call('jobs:pause', { id: runId }))} title="Duraklat" />}
          {runId && st === 'paused' && <Btn size="sm" icon={<Play />} onClick={() => run(() => call('jobs:resume', { id: runId }))} title="Devam ettir" />}
          {runId && ['interrupted', 'failed', 'cancelled'].includes(st) && <Btn size="sm" icon={<Play />} onClick={() => run(() => call('jobs:resume', { id: runId }), 'Kaldığı yerden devam ediyor')}>Devam et</Btn>}
          {runId && ['running', 'paused', 'queued'].includes(st) && <Btn size="sm" variant="danger" icon={<Square />} onClick={() => run(() => call('jobs:cancel', { id: runId }))} title="İptal et" />}
        </>
      }
    >
      <div className="col" style={{ gap: 12 }}>
        <Progress value={valid.length ? (done + failed) / valid.length : 0} indeterminate={discovering} />
        <div className="row wrap small" style={{ gap: 14 }}>
          <span><b>{valid.length}</b> şirket{r.target_count ? <span className="muted"> / hedef {r.target_count}</span> : null}</span>
          <span className="muted">{done} tamamlandı</span>
          {failed > 0 && <span style={{ color: 'var(--danger)' }}>{failed} hata</span>}
          {dup > 0 && <span className="muted">{dup} yinelenen</span>}
          {noSite > 0 && <span className="muted">{noSite} sitesiz</span>}
          {unreachable > 0 && <span className="muted">{unreachable} erişilemedi</span>}
        </div>
        {discovering && <div className="small muted">Şirketler aranıyor… {(r.stats?.queriesRun ?? []).length}/{(r.queries ?? []).length || '?'} sorgu</div>}
        {r.error && <div className="callout warn small">{r.error}</div>}
        {r.stats?.providerErrors?.length > 0 && <div className="tiny muted">Sağlayıcı uyarıları: {r.stats.providerErrors.slice(-2).join(' · ')}</div>}
        <div style={{ maxHeight: compact ? 360 : 520, overflow: 'auto', margin: '0 -4px' }}>
          {results.map((x) => {
            const idx = PHASES.indexOf(x.phase)
            return (
              <div key={x.id} className="list-item small" style={{ padding: '8px 4px', cursor: x.company_id ? 'pointer' : 'default' }} onClick={() => x.company_id && openCompany(x.company_id)}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="ellipsis" style={{ fontWeight: 500 }}>{x.name ?? x.raw_name}</div>
                  <div className="tiny muted ellipsis">{x.status === 'duplicate' ? x.message : x.status === 'failed' ? `Hata: ${x.error}` : x.message ?? PHASE_LABEL[x.phase]}</div>
                </div>
                {x.status === 'duplicate' ? <Badge>Yinelenen</Badge> : x.status === 'skipped' ? <Badge>Atlandı</Badge> : (
                  <>
                    {x.opportunity_score != null && x.status === 'done' && <Badge tone={GROUP_TONE[x.priority_group]}>{x.opportunity_score}</Badge>}
                    <div className="phase-list" title={PHASE_LABEL[x.phase]}>
                      {PHASES.slice(0, -1).map((p, i) => <i key={p} className={x.status === 'failed' && i === Math.max(0, idx) ? 'err' : i <= idx || x.status === 'done' ? 'on' : ''} />)}
                    </div>
                    {x.status === 'running' && <span className="spin" />}
                  </>
                )}
              </div>
            )
          })}
          {!results.length && <div className="muted small" style={{ padding: 10 }}>{discovering ? 'İlk sonuçlar bekleniyor…' : 'Sonuç yok.'}</div>}
        </div>
        <div className="row wrap">
          <Btn size="sm" icon={<Users />} onClick={() => go('companies', { researchId: id })}>Müşteri havuzunda aç</Btn>
          {failed > 0 && <Btn size="sm" icon={<RotateCcw />} onClick={() => run(() => call('research:retryFailed', { id }), (n) => `${n} şirket yeniden deneniyor`)}>Hataları yeniden dene</Btn>}
          <Btn size="sm" icon={<FileText />} onClick={() => run(() => call('research:report', { id }), 'Rapor hazırlanıyor; bitince bildirim gelecek')}>Toplu rapor (PDF)</Btn>
          {runId && <Btn size="sm" variant="ghost" icon={<ScrollText />} onClick={() => setLog(true)}>Günlük</Btn>}
          <Btn size="sm" variant="ghost" onClick={reload}>Yenile</Btn>
        </div>
      </div>
      {log && runId && <RunLog id={runId} onClose={() => setLog(false)} />}
    </Card>
  )
}

export function RunLog({ id, onClose }: { id: number; onClose: () => void }) {
  const { data } = useApi<any>('jobs:get', { id }, ['jobs'])
  return (
    <Modal title={`Görev günlüğü #${id}`} sub={data?.title} onClose={onClose} size="wide">
      {!data ? <Loading /> : (
        <div className="col">
          {data.error && <div className="callout danger">{data.error}</div>}
          <pre className="mono" style={{ background: 'var(--bg-sunken)', padding: 12, borderRadius: 10, maxHeight: 420, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{(data.log as string[]).join('\n') || 'Günlük boş.'}</pre>
          {data.files?.length > 0 && (
            <div className="col small">
              <b>Oluşturulan dosyalar</b>
              {data.files.map((f: string) => <a key={f} href="#" onClick={(e) => (e.preventDefault(), void call('shell:openPath', { path: f }))}>{f}</a>)}
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

export default function Research(_: PageProps) {
  const { data, loading } = useApi<any[]>('research:list', undefined, ['research', 'jobs'])
  const [sel, setSel] = useState<number | null>(null)
  const { go } = useNav()
  const { ask, node } = useConfirm()
  const { run } = useAction()
  if (loading && !data) return <Loading />
  const current = sel ?? data?.[0]?.id ?? null
  return (
    <div className="col" style={{ gap: 18 }}>
      <div className="page-head">
        <div>
          <h1>Sektör Araştırması</h1>
          <p>Tüm araştırmalar, buldukları şirketler ve aşama durumları. Bir adım hata verirse araştırma silinmez; kalan şirketler işlenmeye devam eder.</p>
        </div>
        <div className="actions"><Btn variant="primary" onClick={() => go('finder', { new: 1 })}>Yeni araştırma</Btn></div>
      </div>
      {!data?.length ? (
        <Card><Empty title="Henüz araştırma yok" robot={<RobotHint text="İlk araştırmanızı AI Müşteri Bulucu ekranından başlatabilirsiniz." mood="wave" />} action={<Btn variant="primary" onClick={() => go('finder')}>AI Müşteri Bulucu'ya git</Btn>} /></Card>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.1fr) minmax(0,1fr)', alignItems: 'start' }}>
          <Card pad={false}>
            <DataTable
              id="research"
              rows={data}
              onRowClick={(r) => setSel(r.id)}
              selected={new Set(current ? [current] : [])}
              cols={[
                { key: 'name', header: 'Araştırma', width: 240, render: (r) => <b>{r.name}</b> },
                { key: 'status', header: 'Durum', width: 120, render: (r) => <Badge tone={RUN_STATUS[r.status]?.[1]}>{RUN_STATUS[r.status]?.[0] ?? r.status}</Badge> },
                { key: 'sectors', header: 'Sektör', width: 140, render: (r) => r.sectors.join(', ') || (r.provider === 'manual' ? 'CSV' : '—') },
                { key: 'locations', header: 'Konum', width: 140, render: (r) => r.locations.map((l: any) => l.district ?? l.city).join(', ') || '—' },
                { key: 'found', header: 'Şirket', width: 80 },
                { key: 'done_count', header: 'Tamam', width: 80 },
                { key: 'failed_count', header: 'Hata', width: 70 },
                { key: 'dup_count', header: 'Yinelenen', width: 90, hidden: true },
                { key: 'created_at', header: 'Tarih', width: 130, render: (r) => fmtDate(r.created_at, true) },
                { key: 'x', header: '', width: 56, render: (r) => <Btn size="sm" variant="ghost" icon={<Trash2 />} aria-label="Sil" onClick={async (e) => {
                  e.stopPropagation()
                  if (await ask('Araştırma silinsin mi?', 'Araştırma kaydı ve şirket-araştırma bağlantıları silinir. Bulunan şirketler, analizleri ve dosyaları Müşteri Havuzu’nda KALIR.', { danger: true, confirm: 'Sil' })) run(() => call('research:delete', { id: r.id }), 'Araştırma silindi')
                }} /> }
              ]}
            />
          </Card>
          {current && <ResearchLive id={current} />}
        </div>
      )}
      {node}
      <SiteLegend />
    </div>
  )
}

function SiteLegend() {
  return (
    <div className="row wrap tiny muted">
      Site durumları: {Object.values(SITE_STATUS).map(([l, t]) => <Badge key={l} tone={t}>{l}</Badge>)} · Gruplar: {Object.entries(GROUP_LABELS).map(([k, l]) => <Badge key={k} tone={GROUP_TONE[k]}>{l}</Badge>)}
      <span>· Son güncelleme {fmtRel(new Date().toISOString())}</span>
    </div>
  )
}
