// Web Sitesi Analizi: hızlı analiz, analiz geçmişi ve ayrıntılı rapor görüntüleyici.

import { useEffect, useState } from 'react'
import { ScanSearch, FileDown, FolderOpen, ExternalLink, Check, X, Circle } from 'lucide-react'
import { call, useApi, useJobEvents } from '../lib/api'
import { useNav } from '../lib/nav'
import { Badge, Btn, Callout, Card, Empty, Loading, Modal, Progress, Tabs, useAction } from '../components/ui'
import { DataTable } from '../components/DataTable'
import { RobotHint } from '../robot/Robot'
import { FINDING_CATEGORIES, SEVERITY_LABELS } from '@shared/constants'
import { fmtBytes, fmtDate, scoreTone } from '../lib/format'
import type { PageProps } from '../lib/page'

/* eslint-disable @typescript-eslint/no-explicit-any */
const SEV_TONE: Record<string, string> = { high: 'danger', medium: 'warning', low: 'info', info: 'neutral' }
const CERT: Record<string, string> = { measured: 'Ölçüldü', heuristic: 'Sezgisel', ai: 'AI' }
const CONF: Record<string, string> = { high: 'Yüksek güven', medium: 'Orta güven', low: 'Düşük güven', none: 'Ölçülemedi' }

export function ShotImage({ path, alt, onOpen }: { path: string; alt: string; onOpen?: (src: string) => void }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    call<string>('file:imageData', { path }).then((s) => alive && setSrc(s)).catch(() => undefined)
    return () => {
      alive = false
    }
  }, [path])
  if (!src) return <div className="shot-thumb" style={{ height: 120, display: 'grid', placeItems: 'center' }}><span className="spin" /></div>
  return <div className="shot-thumb" onClick={() => onOpen?.(src)}><img src={src} alt={alt} loading="lazy" /></div>
}

export function AnalysisView({ id }: { id: number }) {
  const { data: a, reload } = useApi<any>('analysis:get', { id }, ['analyses', 'files'])
  const [tab, setTab] = useState<'findings' | 'scores' | 'shots' | 'tests'>('findings')
  const [zoom, setZoom] = useState<string | null>(null)
  const { run, busy } = useAction()
  if (!a) return <Loading />
  const cats = Object.keys(FINDING_CATEGORIES) as (keyof typeof FINDING_CATEGORIES)[]
  if (a.status !== 'done') {
    return (
      <Callout tone={a.status === 'running' ? 'info' : 'warn'}>
        {a.status === 'running' ? 'Analiz sürüyor…' : <>Analiz tamamlanamadı: <b>{a.error ?? a.status}</b>. Bir sitenin erişilememesi, sitenin kötü olduğu anlamına gelmez; daha sonra yeniden denenebilir.</>}
      </Callout>
    )
  }
  const overall = a.scores?.overall
  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="row wrap">
        <div>
          <div className="small muted">{a.final_url ?? a.url}</div>
          <div className="tiny faint">Analiz v{a.version} · {fmtDate(a.finished_at, true)} · #{a.id}</div>
        </div>
        <div className="spacer" />
        <Btn size="sm" icon={<ExternalLink />} onClick={() => call('shell:openExternal', { url: a.final_url ?? a.url })}>Siteyi aç</Btn>
        {a.folder_path && <Btn size="sm" icon={<FolderOpen />} onClick={() => call('shell:openPath', { path: a.folder_path })}>Klasör</Btn>}
        {a.report_path ? <Btn size="sm" variant="primary" icon={<FileDown />} onClick={() => call('shell:openPath', { path: a.report_path })}>PDF raporu aç</Btn> : null}
        <Btn size="sm" disabled={busy} onClick={() => run(() => call('analysis:pdf', { id }), 'PDF raporu oluşturuldu').then(reload)}>{a.report_path ? 'PDF’i yenile' : 'PDF oluştur'}</Btn>
      </div>
      {(a.ai_summary || a.summary) && (
        <div className="card pad" style={{ background: 'var(--brand-soft)', borderColor: 'var(--brand-ring)' }}>
          <div className="tiny muted" style={{ marginBottom: 4 }}>İnceleme özeti {a.ai_summary ? '(yapay zekâ — yalnızca ölçülen bulgulardan)' : '(kural tabanlı)'}</div>
          {a.ai_summary || a.summary}
        </div>
      )}
      <div className="grid g6">
        <div className="card stat accent"><div className="label">Genel</div><div className="value">{overall ?? '—'}</div><div className="sub">ölçülen kriterlerin ortalaması</div></div>
        {cats.map((c) => {
          const s = a.scores?.[c]
          if (!s) return null
          return (
            <div key={c} className="card stat" style={{ cursor: 'pointer' }} onClick={() => setTab('scores')}>
              <div className="label">{FINDING_CATEGORIES[c]}</div>
              <div className="value" style={{ color: s.score == null ? 'var(--faint)' : `var(--${scoreTone(s.score)})` }}>{s.score ?? '—'}</div>
              <div className="sub">{CONF[s.confidence]}</div>
            </div>
          )
        }).filter(Boolean).slice(0, 5)}
      </div>
      <Tabs value={tab} onChange={setTab} items={[{ key: 'findings', label: `Bulgular (${a.findings.length})` }, { key: 'scores', label: 'Puan gerekçeleri' }, { key: 'shots', label: `Ekran görüntüleri (${a.screenshots.length})` }, { key: 'tests', label: 'Ölçüm kapsamı' }]} />
      {tab === 'findings' && (
        <div className="col">
          {!a.findings.length && <div className="muted">Ölçülen kriterlerde belirgin bir sorun bulunmadı.</div>}
          {cats.map((c) => {
            const fs = a.findings.filter((f: any) => f.category === c)
            if (!fs.length) return null
            return (
              <div key={c} className="col" style={{ gap: 8 }}>
                <h3 style={{ color: 'var(--brand-600)' }}>{FINDING_CATEGORIES[c]}</h3>
                {fs.map((f: any) => (
                  <div key={f.id} className="card pad" style={{ display: 'grid', gridTemplateColumns: f.screenshot_path ? '1fr 220px' : '1fr', gap: 14 }}>
                    <div className="col" style={{ gap: 6 }}>
                      <div className="row wrap">
                        <Badge tone={SEV_TONE[f.severity]}>{SEVERITY_LABELS[f.severity as keyof typeof SEVERITY_LABELS]}</Badge>
                        <Badge>{CERT[f.certainty]}</Badge>
                        <b>{f.title}</b>
                      </div>
                      {f.detail && <div className="small">{f.detail}</div>}
                      {f.evidence && <div className="small"><span className="muted">Kanıt: </span>{f.evidence}</div>}
                      {f.recommendation && <div className="small"><span className="muted">Öneri: </span>{f.recommendation}</div>}
                      {f.service_name && <div className="tiny"><span className="muted">UcaMedya hizmeti: </span><Badge tone="brand">{f.service_name}</Badge></div>}
                    </div>
                    {f.screenshot_path && <ShotImage path={f.screenshot_path} alt={f.title} onOpen={setZoom} />}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}
      {tab === 'scores' && (
        <div className="grid g2">
          {cats.map((c) => {
            const s = a.scores?.[c]
            if (!s) return null
            return (
              <Card key={c} title={<>{FINDING_CATEGORIES[c]} <span className="muted small">· {s.score ?? '—'}/100 · {CONF[s.confidence]}</span></>}>
                <div className="small muted" style={{ marginBottom: 8 }}>{s.reason}</div>
                {s.criteria.map((x: any) => (
                  <div key={x.label} className="row small" style={{ padding: '3px 0' }}>
                    {x.passed === null ? <Circle size={14} color="var(--faint)" /> : x.passed ? <Check size={15} color="var(--success)" /> : <X size={15} color="var(--danger)" />}
                    <span style={{ flex: 1 }}>{x.label}</span>
                    {x.note && <span className="tiny muted">{x.note}</span>}
                    <span className="tiny faint">×{x.weight}</span>
                  </div>
                ))}
              </Card>
            )
          })}
          <Callout>Kategori puanı = karşılanan ölçütlerin ağırlıklı oranı. Ölçülemeyen (○) ölçütler hesaba katılmaz ve güven düzeyini düşürür. Performans puanında PageSpeed ölçümü varsa %60 ağırlıkla dahil edilir. Ağırlıklar Ayarlar &gt; Puanlama bölümünden değiştirilebilir.</Callout>
        </div>
      )}
      {tab === 'shots' && (
        <div className="grid g3">
          {a.screenshots.map((s: any) => (
            <div key={s.id} className="col" style={{ gap: 6 }}>
              <ShotImage path={s.file_path} alt={s.page_kind} onOpen={setZoom} />
              <div className="tiny muted">{s.viewport === 'mobile' ? 'Mobil' : 'Masaüstü'} · {s.width}×{s.height} · {fmtBytes(s.bytes)} · {s.page_kind}{s.finding_code ? ` · ${s.finding_code}` : ''}</div>
              <div className="tiny faint ellipsis" title={s.page_url}>{s.page_url}</div>
            </div>
          ))}
        </div>
      )}
      {tab === 'tests' && (
        <div className="col" style={{ gap: 6 }}>
          {a.tests.map((t: any) => (
            <div key={t.key} className="list-item small">
              <Badge tone={t.status === 'done' ? 'success' : t.status === 'skipped' ? 'warning' : 'danger'}>{t.status === 'done' ? 'Yapıldı' : t.status === 'skipped' ? 'Yapılamadı' : 'Başarısız'}</Badge>
              <span style={{ flex: 1 }}>{t.label}</span>
              <span className="tiny muted">{t.note}</span>
            </div>
          ))}
          {a.metrics?.psi && (
            <Card title="PageSpeed Insights (mobil)">
              <div className="grid g4 small">
                <div>Performans: <b>{a.metrics.psi.performance ?? '—'}</b></div>
                <div>Erişilebilirlik: <b>{a.metrics.psi.accessibility ?? '—'}</b></div>
                <div>SEO: <b>{a.metrics.psi.seo ?? '—'}</b></div>
                <div>En iyi uygulamalar: <b>{a.metrics.psi.bestPractices ?? '—'}</b></div>
                <div>LCP: <b>{a.metrics.psi.lab?.lcp ? (a.metrics.psi.lab.lcp / 1000).toFixed(1) + ' sn' : '—'}</b></div>
                <div>CLS: <b>{a.metrics.psi.lab?.cls?.toFixed?.(3) ?? '—'}</b></div>
                <div>TBT: <b>{a.metrics.psi.lab?.tbt != null ? Math.round(a.metrics.psi.lab.tbt) + ' ms' : '—'}</b></div>
                <div>Gerçek kullanıcı verisi: <b>{a.metrics.psi.field ? a.metrics.psi.field.category ?? 'var' : 'yok'}</b></div>
              </div>
            </Card>
          )}
        </div>
      )}
      {zoom && <Modal title="Ekran görüntüsü" onClose={() => setZoom(null)} size="xl"><img src={zoom} alt="" style={{ width: '100%', borderRadius: 10 }} /></Modal>}
    </div>
  )
}

export default function Analysis({ params }: PageProps) {
  const { data, loading } = useApi<any[]>('analysis:list', undefined, ['analyses'])
  const [url, setUrl] = useState('')
  const [sel, setSel] = useState<number | null>((params.id as number) ?? null)
  const [runId, setRunId] = useState<number | null>(null)
  const [prog, setProg] = useState<{ p: number; msg?: string } | null>(null)
  const { run, busy } = useAction()
  const { openCompany } = useNav()
  useJobEvents((ev) => {
    if (ev.runId !== runId) return
    setProg({ p: ev.progress, msg: ev.message })
    if (['completed', 'failed'].includes(ev.status)) {
      setRunId(null)
      setProg(null)
    }
  })
  useEffect(() => {
    if (!sel && data?.length) setSel(data[0].id)
  }, [data, sel])
  return (
    <div className="col" style={{ gap: 18 }}>
      <div className="page-head">
        <div>
          <h1>Web Sitesi Analizi</h1>
          <p>Tasarım, mobil uyumluluk, kullanıcı deneyimi, teknik performans, SEO ve kurumsal güven incelemesi — her bulgu ölçüm ve ekran görüntüsüyle.</p>
        </div>
      </div>
      <Card>
        <form className="row" onSubmit={(e) => {
          e.preventDefault()
          run(() => call<number>('analysis:runUrl', { url: url.trim() }), 'Analiz başlatıldı').then((id) => id && (setRunId(id), setProg({ p: 0, msg: 'Başlatılıyor' })))
        }}>
          <ScanSearch size={20} color="var(--brand)" />
          <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://ornekfirma.com.tr — tek bir siteyi hızlıca analiz edin (şirket kaydı oluşturmaz)" aria-label="Web adresi" />
          <Btn variant="primary" type="submit" disabled={busy || !url.trim() || !!runId}>Analiz et</Btn>
        </form>
        {prog && <div className="col" style={{ marginTop: 12, gap: 6 }}><Progress indeterminate /><div className="small muted">{prog.msg ?? 'Analiz sürüyor…'} (ortalama 30–90 sn)</div></div>}
      </Card>
      {loading && !data ? <Loading /> : !data?.length ? (
        <Card><Empty title="Henüz analiz yok" robot={<RobotHint text="Bir web adresi girin veya Müşteri Havuzu’ndan şirket seçip 'Analiz et' deyin. Bulguları kanıtlarıyla burada göstereceğim." />} /></Card>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 0.9fr) minmax(0, 1.6fr)', alignItems: 'start' }}>
          <Card pad={false}>
            <DataTable
              id="analyses"
              rows={data}
              onRowClick={(r) => setSel(r.id)}
              selected={new Set(sel ? [sel] : [])}
              cols={[
                { key: 'company_name', header: 'Şirket / adres', width: 230, render: (r) => <div><div className="ellipsis" style={{ fontWeight: 500 }}>{r.company_name ?? 'Hızlı analiz'}</div><div className="tiny muted ellipsis">{r.final_url ?? r.url}</div></div> },
                { key: 'overall', header: 'Puan', width: 70, sortValue: (r) => r.scores?.overall ?? null, render: (r) => (r.scores?.overall != null ? <span className={`score-pill badge ${scoreTone(r.scores.overall)}`}>{r.scores.overall}</span> : '—') },
                { key: 'status', header: 'Durum', width: 110, render: (r) => <Badge tone={r.status === 'done' ? 'success' : r.status === 'running' ? 'brand' : 'danger'}>{r.status === 'done' ? 'Tamam' : r.status === 'running' ? 'Sürüyor' : r.status === 'unreachable' ? 'Erişilemedi' : r.status === 'blocked' ? 'robots.txt' : 'Hata'}</Badge> },
                { key: 'created_at', header: 'Tarih', width: 120, render: (r) => fmtDate(r.created_at, true) }
              ]}
            />
          </Card>
          <Card title={data.find((x) => x.id === sel)?.company_name ?? 'Analiz ayrıntısı'} actions={data.find((x) => x.id === sel)?.company_id ? <Btn size="sm" onClick={() => openCompany(data.find((x) => x.id === sel)!.company_id)}>Müşteri kartı</Btn> : null}>
            {sel ? <AnalysisView id={sel} key={sel} /> : null}
          </Card>
        </div>
      )}
    </div>
  )
}
