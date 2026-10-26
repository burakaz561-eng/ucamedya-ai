// AI Mesaj Stüdyosu: taslak düzenleyici, yeniden yazma eylemleri, kanıt paneli, uygunluk kontrolü ve onay.

import { useEffect, useState } from 'react'
import { Check, X, Save, Wand2, Send, Trash2 } from 'lucide-react'
import { call, useApi } from '../lib/api'
import { useNav } from '../lib/nav'
import { Badge, Btn, Callout, Card, Empty, Field, Loading, Seg, useAction, useConfirm } from '../components/ui'
import { RobotHint } from '../robot/Robot'
import { MESSAGE_TONES, REWRITE_ACTIONS, SEVERITY_LABELS } from '@shared/constants'
import { DRAFT_STATUS, fmtRel } from '../lib/format'
import type { PageProps } from '../lib/page'

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Onay beklemek bir engel değildir; yalnızca gönderimi gerçekten durduran nedenler */
const realBlocks = (e: { reasons?: string[] } | undefined) => (e?.reasons ?? []).filter((r) => !/henüz onaylanmadı/.test(r))
export default function Studio({ params }: PageProps) {
  const [channel, setChannel] = useState<'' | 'email' | 'whatsapp'>('')
  const [status, setStatus] = useState<string>('draft')
  const { data: drafts, reload } = useApi<any[]>('drafts:list', { channel: channel || undefined, status: status || undefined }, ['drafts', 'outreach'])
  const [sel, setSel] = useState<number | null>((params.draft as number) ?? null)
  useEffect(() => {
    if (!sel && drafts?.length) setSel(drafts[0].id)
  }, [drafts, sel])
  const { openCompany } = useNav()
  // Toplu seçim: gönderilmiş / kuyruktaki taslaklar seçilemez
  const [picked, setPicked] = useState<Set<number>>(new Set())
  useEffect(() => setPicked(new Set()), [channel, status])
  const selectable = (drafts ?? []).filter((d) => d.status !== 'sent' && d.status !== 'queued')
  const pickedRows = selectable.filter((d) => picked.has(d.id))
  const allPicked = selectable.length > 0 && pickedRows.length === selectable.length
  const toggle = (id: number) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const { run, busy } = useAction()
  const { ask, node } = useConfirm()
  const bulk = async (to: 'approved' | 'draft' | 'rejected') => {
    const rows = pickedRows.filter((d) => d.status !== to)
    if (!rows.length) return
    if (to === 'approved') {
      const blocked = rows.filter((d) => realBlocks(d.eligibility).length > 0).length
      const ok = await ask(`${rows.length} taslak onaylansın mı?`, <>Onaylanan taslaklar E-posta / WhatsApp ekranlarında kuyruğa eklenebilir; gönderim yine sizin başlatmanız ve (onaylı gönderim modunda) her mesajı onaylamanızla yapılır.{blocked > 0 && <><br /><br /><b>{blocked} taslakta gönderim engeli var</b> (ör. geçerli alıcı yok); onaylansa da gönderilmez.</>}</>, { confirm: `${rows.length} taslağı onayla` })
      if (!ok) return
    }
    const label = to === 'approved' ? 'onaylandı' : to === 'rejected' ? 'reddedildi' : 'onay bekleyene alındı'
    const r = await run(() => call<{ changed: number; skipped: number }>('drafts:setStatus', { ids: rows.map((d) => d.id), status: to }), (x) => `${x.changed} taslak ${label}${x.skipped ? ` · ${x.skipped} atlandı (ret listesi / kuyrukta)` : ''}`)
    if (r) {
      setPicked(new Set())
      reload()
    }
  }
  const removePicked = async () => {
    const rows = pickedRows.filter((d) => ['draft', 'approved', 'rejected'].includes(d.status))
    if (!rows.length) return
    if (!(await ask(`${rows.length} taslak silinsin mi?`, 'Seçilen taslaklar kalıcı olarak silinir. Şirket kayıtları ve iletişim geçmişi silinmez.', { danger: true, confirm: `${rows.length} taslağı sil` }))) return
    const r = await run(() => call<{ deleted: number }>('drafts:deleteMany', { ids: rows.map((d) => d.id) }), (x) => `${x.deleted} taslak silindi`)
    if (r) {
      if (sel && rows.some((d) => d.id === sel)) setSel(null)
      setPicked(new Set())
      reload()
    }
  }
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="page-head">
        <div>
          <h1>AI Mesaj Stüdyosu</h1>
          <p>Her şirkete özel, yalnızca doğrulanmış analiz bulgularına dayanan taslaklar. Gözlemlenmemiş sorunlar yazılmaz; kanıtı zayıf alanlarda ihtiyatlı dil kullanılır.</p>
        </div>
        <div className="actions">
          <Seg value={channel} onChange={setChannel} items={[{ key: '', label: 'Tümü' }, { key: 'email', label: 'E-posta' }, { key: 'whatsapp', label: 'WhatsApp' }]} />
          <Seg value={status} onChange={setStatus} items={[{ key: 'draft', label: 'Onay bekleyen' }, { key: 'approved', label: 'Onaylı' }, { key: 'queued', label: 'Kuyrukta' }, { key: 'sent', label: 'Gönderilen' }, { key: '', label: 'Hepsi' }]} />
        </div>
      </div>
      {!drafts ? <Loading /> : !drafts.length && !sel ? (
        <Card><Empty title="Bu filtrede taslak yok" robot={<RobotHint text="Müşteri Havuzu'nda şirketleri seçip 'Taslak oluştur' diyebilir veya araştırmada 'Mesaj taslakları' çıktısını açabilirsiniz." />} /></Card>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: 'minmax(260px, 0.8fr) minmax(0, 2fr)', alignItems: 'start' }}>
          <Card pad={false}>
            <div className="studio-bulk">
              <label className="check" style={{ margin: 0 }}><input type="checkbox" aria-label="Tümünü seç" checked={allPicked} disabled={!selectable.length} onChange={(e) => setPicked(e.target.checked ? new Set(selectable.map((d) => d.id)) : new Set())} /><span className="small">{pickedRows.length ? `${pickedRows.length} seçili` : `Tümünü seç (${selectable.length})`}</span></label>
              {pickedRows.length > 0 && (
                <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                  <Btn size="sm" variant="primary" icon={<Check />} disabled={busy} onClick={() => bulk('approved')}>Onayla</Btn>
                  <Btn size="sm" disabled={busy} onClick={() => bulk('draft')}>Onayı kaldır</Btn>
                  <Btn size="sm" variant="ghost" icon={<X />} disabled={busy} onClick={() => bulk('rejected')}>Reddet</Btn>
                  <Btn size="sm" variant="ghost" icon={<Trash2 />} disabled={busy} onClick={removePicked}>Sil</Btn>
                </div>
              )}
            </div>
            <div style={{ maxHeight: 'calc(100vh - 280px)', overflow: 'auto' }}>
              {drafts.map((d) => (
                <div key={d.id} role="button" tabIndex={0} onClick={() => setSel(d.id)} onKeyDown={(e) => { if (e.key === 'Enter') setSel(d.id) }} className="list-item" style={{ width: '100%', background: sel === d.id ? 'var(--brand-soft)' : 'transparent', textAlign: 'left', padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--line)', alignItems: 'flex-start' }}>
                  <input type="checkbox" aria-label={`${d.company_name} seç`} checked={picked.has(d.id)} disabled={d.status === 'sent' || d.status === 'queued'} onClick={(e) => e.stopPropagation()} onChange={() => toggle(d.id)} style={{ marginTop: 3 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="row"><b className="ellipsis">{d.company_name}</b></div>
                    <div className="tiny muted ellipsis">{d.subject ?? d.body.slice(0, 60)}</div>
                    <div className="row" style={{ gap: 4, marginTop: 4 }}>
                      <Badge tone={d.channel === 'email' ? 'info' : 'success'}>{d.channel === 'email' ? 'E-posta' : 'WhatsApp'}</Badge>
                      <Badge tone={DRAFT_STATUS[d.status]?.[1]}>{DRAFT_STATUS[d.status]?.[0]}</Badge>
                      {d.status !== 'sent' && realBlocks(d.eligibility).length > 0 && <span title={realBlocks(d.eligibility).join('\n')}><Badge tone="danger">Engel var</Badge></span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
          {sel ? <Editor id={sel} key={sel} onChanged={reload} openCompany={openCompany} onSelect={setSel} /> : null}
        </div>
      )}
      {node}
    </div>
  )
}

function Editor({ id, onChanged, openCompany, onSelect }: { id: number; onChanged: () => void; openCompany: (id: number) => void; onSelect: (id: number) => void }) {
  const { data: list, reload: reloadList } = useApi<any[]>('drafts:list', {}, ['drafts', 'outreach'])
  const d = list?.find((x) => x.id === id)
  const { data: company } = useApi<any>(d ? 'companies:get' : null, { id: d?.company_id }, ['analyses'])
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [tone, setTone] = useState('professional')
  const [dirty, setDirty] = useState(false)
  const { run, busy } = useAction()
  useEffect(() => {
    if (d && !dirty) {
      setSubject(d.subject ?? '')
      setBody(d.body)
      setTone(d.tone ?? 'professional')
    }
  }, [d, dirty])
  if (!d) return <Card><Loading /></Card>
  const locked = d.status === 'queued' || d.status === 'sent'
  const latest = company?.analyses?.find((a: any) => a.status === 'done')
  // Liste yenilenmeden "düzenleme bitti" denirse editör eski metni geri yükler; önce liste yenilenir
  const save = async () => {
    const ok = await run(() => call('drafts:update', { id, patch: { subject: d.channel === 'email' ? subject : null, body, tone } }).then(() => true), 'Taslak kaydedildi')
    if (!ok) return
    await reloadList()
    setDirty(false)
    onChanged()
  }
  const rewrite = async (action: string) => {
    if (dirty) await call('drafts:update', { id, patch: { subject: d.channel === 'email' ? subject : null, body, tone } })
    const r = await run(() => call<{ id: number; created: boolean }>('drafts:rewrite', { id, action }), (x) => (x.created ? 'Yeni kanal için ayrı taslak oluşturuldu' : 'Taslak güncellendi'))
    await reloadList()
    setDirty(false)
    onChanged()
    if (r?.created) onSelect(r.id)
  }
  const used = new Set<string>(d.used_findings)
  return (
    <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)', alignItems: 'start' }}>
      <Card
        title={<a href="#" onClick={(e) => (e.preventDefault(), openCompany(d.company_id))}>{d.company_name}</a>}
        actions={<><Badge tone={d.channel === 'email' ? 'info' : 'success'}>{d.channel === 'email' ? 'E-posta' : 'WhatsApp'}</Badge><Badge tone={DRAFT_STATUS[d.status]?.[1]}>{DRAFT_STATUS[d.status]?.[0]}</Badge></>}
      >
        <div className="col" style={{ gap: 12 }}>
          <div className="small muted">{d.channel === 'email' ? `Alıcı: ${d.email ?? 'e-posta yok'}` : `Alıcı: ${d.phone ?? 'telefon yok'}`} · {d.generator === 'ai' ? 'Yapay zekâ taslağı' : d.generator === 'manual' ? 'Elle düzenlendi' : 'Şablon taslağı'} · {fmtRel(d.updated_at)}</div>
          {d.channel === 'email' && <Field label="Konu"><input className="input" disabled={locked} value={subject} onChange={(e) => (setSubject(e.target.value), setDirty(true))} /></Field>}
          <Field label="Mesaj" hint={`${body.length} karakter${d.channel === 'whatsapp' && body.length > 900 ? ' — WhatsApp için uzun' : ''}`}>
            <textarea className="textarea" disabled={locked} style={{ minHeight: 300 }} value={body} onChange={(e) => (setBody(e.target.value), setDirty(true))} />
          </Field>
          <div className="row wrap">
            <select className="select" style={{ width: 200 }} value={tone} disabled={locked} onChange={(e) => (setTone(e.target.value), setDirty(true))} aria-label="Ton">{MESSAGE_TONES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select>
            <Btn icon={<Save />} disabled={!dirty || busy || locked} onClick={save}>Kaydet</Btn>
            <div className="spacer" />
            {!locked && d.status !== 'approved' && <Btn variant="primary" icon={<Check />} disabled={busy || dirty} title={dirty ? 'Önce kaydedin' : ''} onClick={() => run(() => call('drafts:setStatus', { ids: [id], status: 'approved' }), 'Taslak onaylandı').then(onChanged)}>Onayla</Btn>}
            {d.status === 'approved' && <Btn icon={<Send />} variant="primary" disabled={!d.eligibility.ok} onClick={() => run(() => call<any>('outreach:enqueue', { ids: [id] }), (r) => (r.queued ? 'Kuyruğa eklendi; İletişim Merkezi’nden kuyruğu başlatın' : `Kuyruğa eklenmedi: ${r.skipped[0]?.reasons.join(' ')}`)).then(onChanged)}>Kuyruğa ekle</Btn>}
            {!locked && d.status !== 'rejected' && <Btn variant="ghost" icon={<X />} onClick={() => run(() => call('drafts:setStatus', { ids: [id], status: 'rejected' }), 'Taslak reddedildi').then(onChanged)}>Reddet</Btn>}
          </div>
          {!locked && (
            <div>
              <div className="tiny muted" style={{ marginBottom: 6 }}><Wand2 size={12} /> Yapay zekâ ile düzenle</div>
              <div className="chips">
                {REWRITE_ACTIONS.map((a) => <button key={a.key} className="chip" disabled={busy} onClick={() => void rewrite(a.key)}>{a.label}</button>)}
              </div>
              {busy && <div className="small muted row" style={{ marginTop: 8 }}><span className="spin" /> Yapay zekâ yazıyor…</div>}
            </div>
          )}
        </div>
      </Card>
      <div className="col" style={{ gap: 14 }}>
        <Card title="Gönderim uygunluğu">
          {d.status === 'sent' ? <div className="small">Bu taslak gönderildi.</div> : (
            <div className="col" style={{ gap: 6 }}>
              {d.eligibility.reasons.map((r: string) => <Callout key={r} tone="danger">{r}</Callout>)}
              {d.eligibility.warnings.map((r: string) => <Callout key={r} tone="warn">{r}</Callout>)}
              {d.eligibility.ok && !d.eligibility.warnings.length && <Callout tone="brand">Tüm kontrollerden geçti.</Callout>}
            </div>
          )}
        </Card>
        <Card title="Doğrulanmış bulgular (mesajın dayanağı)">
          {!latest ? <div className="small muted">Bu şirket için tamamlanmış analiz yok; mesaj genel ve soru biçiminde olmalı.</div> : (
            <FindingList analysisId={latest.id} used={used} />
          )}
        </Card>
      </div>
    </div>
  )
}

function FindingList({ analysisId, used }: { analysisId: number; used: Set<string> }) {
  const { data } = useApi<any>('analysis:get', { id: analysisId }, [])
  if (!data) return <Loading />
  if (!data.findings.length) return <div className="small muted">Analizde belirgin bulgu yok.</div>
  return (
    <div className="col" style={{ gap: 8 }}>
      {data.findings.slice(0, 10).map((f: any) => (
        <div key={f.id} className="small" style={{ borderLeft: `3px solid ${used.has(f.code) ? 'var(--brand)' : 'var(--line)'}`, paddingLeft: 10 }}>
          <div className="row wrap" style={{ gap: 6 }}>
            <Badge tone={f.severity === 'high' ? 'danger' : f.severity === 'medium' ? 'warning' : 'info'}>{SEVERITY_LABELS[f.severity as keyof typeof SEVERITY_LABELS]}</Badge>
            {used.has(f.code) && <Badge tone="brand">Mesajda kullanıldı</Badge>}
            {f.certainty === 'heuristic' && <Badge>Sezgisel</Badge>}
          </div>
          <b>{f.title}</b>
          {f.evidence && <div className="tiny muted">{f.evidence}</div>}
        </div>
      ))}
    </div>
  )
}
