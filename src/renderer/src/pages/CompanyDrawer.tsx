// Müşteri kartı: tüm şirket bilgisi, iletişim kaynakları, izinler, analizler, mesajlar, teklifler, görevler, dosyalar, geçmiş.

import { useEffect, useState } from 'react'
import { ScanSearch, Sparkles, FolderOpen, Ban, Archive, Trash2, ShieldCheck, Plus, ExternalLink, Save, CheckCircle2, MessageSquareReply } from 'lucide-react'
import { call, useApi } from '../lib/api'
import { useNav } from '../lib/nav'
import { Badge, Btn, Callout, Card, Field, Loading, Modal, Tabs, useAction, useConfirm } from '../components/ui'
import { AnalysisView } from './Analysis'
import { GROUP_LABELS, GROUP_TONE, SITE_STATUS, DRAFT_STATUS, MSG_STATUS, fmtDate, fmtMoney, fmtRel, oppTone, fmtBytes } from '../lib/format'
import { MESSAGE_TONES } from '@shared/constants'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Tab = 'overview' | 'analysis' | 'outreach' | 'offers' | 'files' | 'history'
const PERM_LABEL: Record<string, string> = { unknown: 'Bilinmiyor', b2b_legitimate_interest: 'B2B — meşru menfaat değerlendirmesi', opt_in: 'Açık izin (onay) var', opted_out: 'İletişim istemiyor' }

export function CompanyDrawer({ id, onClose }: { id: number; onClose: () => void }) {
  const { data: c, reload } = useApi<any>('companies:get', { id }, ['companies', 'analyses', 'drafts', 'outreach', 'offers', 'tasks', 'files'])
  const { data: stages } = useApi<any[]>('stages:list', undefined, [])
  const { data: settings } = useApi<any>('settings:get', undefined, [])
  const [tab, setTab] = useState<Tab>('overview')
  const [edit, setEdit] = useState<Record<string, any>>({})
  const [analysisId, setAnalysisId] = useState<number | null>(null)
  const { run } = useAction()
  const { ask, node } = useConfirm()
  const { go } = useNav()
  useEffect(() => {
    if (c) setEdit({ name: c.name, sector: c.sector ?? '', city: c.city ?? '', district: c.district ?? '', website: c.website ?? '', address: c.address ?? '', description: c.description ?? '', owner: c.owner ?? '', next_action: c.next_action ?? '', next_action_at: c.next_action_at ?? '', internal_notes: c.internal_notes ?? '', contact_purpose: c.contact_purpose ?? '', stage_key: c.stage_key, contact_preference: c.contact_preference ?? '' })
    if (c?.analyses?.length && !analysisId) setAnalysisId(c.analyses[0].id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c])
  if (!c) return <Modal title="Müşteri kartı" onClose={onClose} size="xl"><Loading /></Modal>
  const save = () => run(() => call('companies:update', { id, patch: Object.fromEntries(Object.entries(edit).map(([k, v]) => [k, v === '' ? null : v])) }), 'Kaydedildi').then(reload)
  return (
    <Modal
      size="xl"
      onClose={onClose}
      title={
        <span className="row wrap">
          {c.name}
          {c.opportunity_score != null && <span className={`score-pill badge ${oppTone(c.opportunity_score)}`} title="Fırsat puanı">{c.opportunity_score}</span>}
          {c.priority_group && <Badge tone={GROUP_TONE[c.priority_group]}>{GROUP_LABELS[c.priority_group]}</Badge>}
          <Badge>{c.stage_label}</Badge>
          {c.suppressed && <Badge tone="danger">Ret listesinde</Badge>}
          {c.archived_at && <Badge>Arşivde</Badge>}
        </span>
      }
      sub={[c.sector, [c.district, c.city].filter(Boolean).join(', '), c.domain].filter(Boolean).join(' · ')}
    >
      <div className="row wrap" style={{ marginBottom: 12 }}>
        <Btn size="sm" variant="primary" icon={<ScanSearch />} disabled={!c.website} title={c.website ? '' : 'Web sitesi yok'} onClick={() => run(() => call('analysis:runCompanies', { ids: [id] }), 'Analiz başlatıldı; bitince bildirim gelecek')}>{c.analyses.length ? 'Yeniden analiz et' : 'Analiz et'}</Btn>
        <Btn size="sm" icon={<Sparkles />} disabled={c.suppressed} onClick={() => run(() => call('drafts:createBulk', { companyIds: [id], channels: ['email', 'whatsapp'], tone: 'professional' }), 'Taslaklar hazırlanıyor')}>Mesaj taslağı</Btn>
        <Btn size="sm" icon={<Plus />} onClick={() => (onClose(), go('offers', { companyId: id, new: 1 }))}>Teklif hazırla</Btn>
        <Btn size="sm" icon={<FolderOpen />} onClick={() => run(() => call('companies:openFolder', { id }))}>Klasörü aç</Btn>
        {c.website && <Btn size="sm" icon={<ExternalLink />} onClick={() => call('shell:openExternal', { url: c.website })}>Siteyi aç</Btn>}
        <div className="spacer" />
        {!c.suppressed && <Btn size="sm" variant="danger" icon={<Ban />} onClick={async () => (await ask('İletişim istemiyor olarak işaretlensin mi?', 'Şirket, alan adı, e-posta ve telefonları ret listesine eklenir; bekleyen mesajlar iptal edilir. Bu kayıt şirket silinse bile korunur.', { danger: true, confirm: 'Ret listesine ekle' })) && run(() => call('companies:suppress', { id, reason: 'Kullanıcı işaretledi' }), 'Ret listesine eklendi').then(reload)}>İletişim istemiyor</Btn>}
        <Btn size="sm" icon={<ShieldCheck />} onClick={() => run(() => call('companies:update', { id, patch: { protected: !c.protected } }), c.protected ? 'Koruma kaldırıldı' : 'Kayıt korumaya alındı').then(reload)}>{c.protected ? 'Korumayı kaldır' : 'Koru'}</Btn>
        <Btn size="sm" icon={<Archive />} onClick={() => run(() => call('companies:archive', { ids: [id], archived: !c.archived_at }), c.archived_at ? 'Arşivden çıkarıldı' : 'Arşivlendi').then(reload)}>{c.archived_at ? 'Arşivden çıkar' : 'Arşivle'}</Btn>
        <Btn size="sm" variant="danger" icon={<Trash2 />} disabled={!!c.protected} onClick={async () => (await ask('Kalıcı olarak silinsin mi?', <>Şirket kaydı, analizleri, ekran görüntüsü kayıtları, taslakları, mesaj geçmişi, görevleri ve notları <b>kalıcı olarak silinir</b>. Klasörü diskten silinmez; veri klasöründeki "_Silinenler" klasörüne taşınır. Ret listesi kayıtları korunur. Teklifi olan veya kazanılmış şirketler silinemez — bunun yerine arşivleyin.</>, { danger: true, confirm: 'Kalıcı olarak sil' })) && run(() => call('companies:delete', { id }), 'Şirket silindi').then((r) => r && onClose())}>Sil</Btn>
      </div>
      <Tabs value={tab} onChange={setTab} items={[
        { key: 'overview', label: 'Genel' }, { key: 'analysis', label: `Analizler (${c.analyses.length})` }, { key: 'outreach', label: `İletişim (${c.drafts.length + c.messages.length + c.events.length})` },
        { key: 'offers', label: `Teklif ve görevler (${c.offers.length + c.tasks.length})` }, { key: 'files', label: `Dosyalar (${c.files.length})` }, { key: 'history', label: 'Geçmiş' }
      ]} />

      {tab === 'overview' && (
        <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.2fr) minmax(0,1fr)', alignItems: 'start' }}>
          <div className="col" style={{ gap: 14 }}>
            <Card title="Şirket bilgileri" actions={<Btn size="sm" variant="primary" icon={<Save />} onClick={save}>Kaydet</Btn>}>
              <div className="grid g2">
                <Field label="Şirket adı"><input className="input" value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
                <Field label="Müşteri durumu"><select className="select" value={edit.stage_key ?? ''} onChange={(e) => setEdit({ ...edit, stage_key: e.target.value })}>{stages?.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></Field>
                <Field label="Sektör"><input className="input" value={edit.sector ?? ''} onChange={(e) => setEdit({ ...edit, sector: e.target.value })} /></Field>
                <Field label="Web sitesi"><input className="input" value={edit.website ?? ''} onChange={(e) => setEdit({ ...edit, website: e.target.value })} /></Field>
                <Field label="Şehir"><input className="input" value={edit.city ?? ''} onChange={(e) => setEdit({ ...edit, city: e.target.value })} /></Field>
                <Field label="İlçe"><input className="input" value={edit.district ?? ''} onChange={(e) => setEdit({ ...edit, district: e.target.value })} /></Field>
                <Field label="Müşteri sorumlusu">
                  <input className="input" list="owners" value={edit.owner ?? ''} onChange={(e) => setEdit({ ...edit, owner: e.target.value })} />
                  <datalist id="owners">{settings?.owners?.map((o: string) => <option key={o} value={o} />)}</datalist>
                </Field>
                <Field label="İletişim tercihi"><select className="select" value={edit.contact_preference ?? ''} onChange={(e) => setEdit({ ...edit, contact_preference: e.target.value })}>
                  <option value="">Belirtilmedi</option><option value="email">E-posta</option><option value="phone">Telefon</option><option value="whatsapp">WhatsApp</option><option value="meeting">Yüz yüze / toplantı</option>
                </select></Field>
                <Field label="Sonraki işlem tarihi"><input className="input" type="date" value={(edit.next_action_at ?? '').slice(0, 10)} onChange={(e) => setEdit({ ...edit, next_action_at: e.target.value })} /></Field>
              </div>
              <div className="col" style={{ marginTop: 12 }}>
                <Field label="Sonraki yapılacak işlem"><input className="input" value={edit.next_action ?? ''} onChange={(e) => setEdit({ ...edit, next_action: e.target.value })} /></Field>
                <Field label="Adres"><input className="input" value={edit.address ?? ''} onChange={(e) => setEdit({ ...edit, address: e.target.value })} /></Field>
                <Field label="Şirket açıklaması"><textarea className="textarea" style={{ minHeight: 70 }} value={edit.description ?? ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
                <Field label="İletişim amacı" hint="KVKK açısından iletişimin amacını açıkça tanımlayın (ör. web sitesi iyileştirme hizmeti tanıtımı)."><input className="input" value={edit.contact_purpose ?? ''} onChange={(e) => setEdit({ ...edit, contact_purpose: e.target.value })} /></Field>
                <Field label="İç notlar (yalnızca ekip)"><textarea className="textarea" style={{ minHeight: 70 }} value={edit.internal_notes ?? ''} onChange={(e) => setEdit({ ...edit, internal_notes: e.target.value })} /></Field>
              </div>
            </Card>
            <Contacts c={c} reload={reload} />
            <Permissions c={c} reload={reload} />
          </div>
          <div className="col" style={{ gap: 14 }}>
            <Card title="Fırsat puanı gerekçesi">
              {c.score_reasons?.length ? (
                <div className="col" style={{ gap: 8 }}>
                  {c.score_reasons.map((r: any) => (
                    <div key={r.label}>
                      <div className="row small"><span style={{ flex: 1 }}>{r.label}</span><b>{r.points}</b><span className="muted">/ {r.max}</span></div>
                      <div className="progress" style={{ margin: '4px 0' }}><i style={{ width: `${r.max ? (r.points / r.max) * 100 : 0}%` }} /></div>
                      <div className="tiny muted">{r.note}</div>
                    </div>
                  ))}
                  <div className="tiny faint">Bu puan şirketin mali gücünü veya satın alma niyetini bildiğimiz anlamına gelmez.</div>
                </div>
              ) : <div className="muted small">Henüz puanlanmadı.</div>}
            </Card>
            <Card title="Analiz özeti">
              <div className="small">{c.analysis_summary ?? <span className="muted">{c.website ? 'Site henüz analiz edilmedi.' : 'Şirketin web sitesi bulunamadı.'}</span>}</div>
              <div className="row wrap" style={{ marginTop: 8 }}>
                <Badge tone={SITE_STATUS[c.website_status]?.[1]}>{SITE_STATUS[c.website_status]?.[0]}</Badge>
                {c.potential_services?.map((s: string) => <Badge key={s} tone="brand">{s}</Badge>)}
              </div>
            </Card>
            {c.inbound?.length > 0 && (
              <Card title={`Web sitesi talepleri (${c.inbound.length})`}>
                <div className="col" style={{ gap: 10 }}>
                  {c.inbound.map((r: any) => (
                    <div key={r.id} className="small">
                      <div><b>{r.kind === 'audit' ? 'Ücretsiz ön analiz' : r.service ?? 'Teklif talebi'}</b> <span className="muted">· {fmtDate(r.submitted_at ?? r.received_at, true)}</span></div>
                      {r.message && <div style={{ whiteSpace: 'pre-wrap' }}>{r.message}</div>}
                      <div className="tiny muted">{Object.entries(r.answers ?? {}).map(([k, v]) => `${k}: ${v}`).join(' · ')}</div>
                      <div className="tiny faint">{[r.person_name, r.email, r.phone, r.contact_pref ? `tercih: ${r.contact_pref}` : null].filter(Boolean).join(' · ')}</div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
            <Tags c={c} reload={reload} />
            <Notes c={c} reload={reload} />
            <Card title="Kayıt bilgileri">
              <div className="kv">
                <div>Kaynak</div><div>{c.source}{c.business_status ? ` · ${c.business_status}` : ''}{c.rating ? ` · ${c.rating}★ (${c.rating_count})` : ''}</div>
                <div>İlk araştırma</div><div>{fmtDate(c.first_research_at, true)}</div>
                <div>Son analiz</div><div>{c.last_analysis_at ? fmtDate(c.last_analysis_at, true) : 'henüz yok'}</div>
                <div>Son görülme</div><div>{c.last_seen_at ? `${fmtDate(c.last_seen_at, true)} (başka bir aramada tekrar bulundu)` : '—'}</div>
                <div>Sonraki görev</div><div>{c.nextTask ? <>{c.nextTask.title}{c.nextTask.due_at ? <span className="muted"> · {fmtDate(c.nextTask.due_at)}</span> : null}</> : <span className="muted">yok</span>}</div>
                {c.pendingMatches > 0 && <><div>Olası eşleşme</div><div><Badge tone="info">{c.pendingMatches} kayıt onayınızı bekliyor</Badge> <span className="tiny muted">Müşteri Havuzu → Yinelenenleri bul</span></div></>}
                <div>Araştırmalar</div><div>{c.researches.map((r: any) => r.name).join(', ') || '—'}</div>
                <div>Klasör</div><div className="tiny ellipsis" title={c.folder_path}>{c.folder_path ?? 'henüz oluşturulmadı'}</div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {tab === 'analysis' && (
        c.analyses.length ? (
          <div className="col">
            <div className="row wrap">
              {c.analyses.map((a: any) => <button key={a.id} className={`chip ${analysisId === a.id ? 'on' : ''}`} onClick={() => setAnalysisId(a.id)}>v{a.version} · {fmtDate(a.created_at)} · {a.status === 'done' ? `${a.scores?.overall ?? '—'} puan` : a.status}</button>)}
            </div>
            {analysisId && <AnalysisView id={analysisId} key={analysisId} />}
          </div>
        ) : <Callout>{c.website ? 'Bu şirket için henüz analiz yok. Yukarıdaki "Analiz et" düğmesini kullanın.' : 'Şirketin web sitesi bulunamadı; bu kayıt "web sitesi olmayan şirket" fırsatı olarak değerlendirilir.'}</Callout>
      )}

      {tab === 'outreach' && <OutreachTab c={c} reload={reload} />}

      {tab === 'offers' && (
        <div className="grid g2">
          <Card title="Teklifler" actions={<div className="row" style={{ gap: 6 }}>{c.potential_services?.length > 0 && <Btn size="sm" variant="primary" onClick={async () => { const oid = await run(() => call<number>('offers:fromAnalysis', { companyId: id }), 'Analizden teklif taslağı oluşturuldu — fiyatları girip onaylayın'); if (oid) { onClose(); go('offers', { offerId: oid }) } }}>Analizden teklif taslağı</Btn>}<Btn size="sm" onClick={() => (onClose(), go('offers', { companyId: id, new: 1 }))}>Yeni teklif</Btn></div>}>
            {c.offers.length ? c.offers.map((o: any) => (
              <div key={o.id} className="list-item small"><b>{o.number}</b><span style={{ flex: 1 }}>{o.title}</span><Badge>{o.status}</Badge><span>{fmtMoney(o.total, o.currency)}</span></div>
            )) : <div className="muted small">Teklif yok.</div>}
          </Card>
          <TasksMini c={c} reload={reload} />
        </div>
      )}

      {tab === 'files' && (
        <Card pad={false}>
          {c.files.length ? c.files.map((f: any) => (
            <div key={f.id} className="list-item small" style={{ padding: '8px 16px' }}>
              <Badge>{f.kind}</Badge>
              <span style={{ flex: 1 }} className="ellipsis">{f.name}</span>
              <span className="tiny muted">{fmtBytes(f.bytes)} · {fmtRel(f.created_at)}</span>
              <Btn size="sm" onClick={() => call('shell:openPath', { path: f.path })}>Aç</Btn>
              <Btn size="sm" variant="ghost" onClick={() => call('shell:showItem', { path: f.path })}>Klasörde göster</Btn>
            </div>
          )) : <div className="card-body muted small">Dosya yok.</div>}
        </Card>
      )}

      {tab === 'history' && c.stageHistory?.length > 0 && (
        <Card title="Aşama geçmişi">
          <div className="timeline">
            {c.stageHistory.map((h: any) => (
              <div key={h.id} className="ev small"><b>{h.from_label ?? h.from_key ?? '—'} → {h.to_label ?? h.to_key}</b><div className="tiny faint">{fmtDate(h.at, true)}</div></div>
            ))}
          </div>
        </Card>
      )}
      {tab === 'history' && (
        <div className="timeline">
          {c.activity.map((a: any) => (
            <div key={a.id} className="ev small">
              <b>{a.action}</b> {a.detail && <span className="muted">— {a.detail}</span>}
              <div className="tiny faint">{fmtDate(a.created_at, true)} · {a.actor === 'system' ? 'Sistem' : 'Kullanıcı'}</div>
            </div>
          ))}
        </div>
      )}
      {node}
    </Modal>
  )
}

function Contacts({ c, reload }: { c: any; reload: () => void }) {
  const [f, setF] = useState({ type: 'email', value: '', kind: 'corporate' })
  const { run } = useAction()
  return (
    <Card title="İletişim bilgileri">
      {c.contacts.length ? c.contacts.map((x: any) => (
        <div key={x.id} className="list-item small">
          <Badge>{x.type === 'email' ? 'E-posta' : x.type === 'phone' ? 'Telefon' : x.type === 'whatsapp' ? 'WhatsApp' : x.type === 'social' ? 'Sosyal' : x.type}</Badge>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="ellipsis">{x.value} {x.kind === 'personal' && <Badge tone="warning">Kişisel veri</Badge>}</div>
            <div className="tiny muted ellipsis" title={x.source_url ?? ''}>Kaynak: {x.source_type === 'website' ? 'şirketin web sitesi' : x.source_type === 'provider' ? 'arama sağlayıcısı' : x.source_type}{x.source_url ? ` (${x.source_url})` : ''} · {fmtDate(x.collected_at)}{x.verified_at ? ` · doğrulandı ${fmtDate(x.verified_at)}` : ''}</div>
          </div>
          {!x.verified_at && <Btn size="sm" variant="ghost" icon={<CheckCircle2 />} title="Doğrulandı olarak işaretle" onClick={() => run(() => call('companies:verifyContact', { contactId: x.id })).then(reload)} />}
          <Btn size="sm" variant="ghost" icon={<Trash2 />} aria-label="Sil" onClick={() => run(() => call('companies:removeContact', { contactId: x.id })).then(reload)} />
        </div>
      )) : <div className="muted small">İletişim bilgisi yok.</div>}
      <div className="row" style={{ marginTop: 10 }}>
        <select className="select" style={{ width: 120 }} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option value="email">E-posta</option><option value="phone">Telefon</option><option value="whatsapp">WhatsApp</option><option value="social">Sosyal</option></select>
        <input className="input" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} placeholder="Değer" />
        <select className="select" style={{ width: 130 }} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="corporate">Kurumsal</option><option value="personal">Kişisel</option></select>
        <Btn icon={<Plus />} disabled={f.value.trim().length < 3} onClick={() => run(() => call('companies:addContact', { id: c.id, ...f }), 'Eklendi').then(() => (setF({ ...f, value: '' }), reload()))}>Ekle</Btn>
      </div>
    </Card>
  )
}

function Permissions({ c, reload }: { c: any; reload: () => void }) {
  const [ch, setCh] = useState<'email' | 'whatsapp'>('email')
  const cur = c.permissions.find((p: any) => p.channel === ch)
  const [f, setF] = useState({ status: 'unknown', legalBasis: '', evidence: '' })
  useEffect(() => setF({ status: cur?.status ?? 'unknown', legalBasis: cur?.legal_basis ?? '', evidence: cur?.evidence ?? '' }), [cur, ch])
  const { run } = useAction()
  return (
    <Card title="İzin ve tercih bilgileri">
      <div className="col" style={{ gap: 10 }}>
        <div className="seg"><button className={ch === 'email' ? 'on' : ''} onClick={() => setCh('email')}>E-posta</button><button className={ch === 'whatsapp' ? 'on' : ''} onClick={() => setCh('whatsapp')}>WhatsApp</button></div>
        <div className="grid g2">
          <Field label="Durum"><select className="select" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>{Object.entries(PERM_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label="Hukuki dayanak / not"><input className="input" value={f.legalBasis} onChange={(e) => setF({ ...f, legalBasis: e.target.value })} placeholder="ör. Tacire ilk tanıtım, ret hakkı sunuldu" /></Field>
        </div>
        <Field label="Kanıt (ör. onay e-postası, form kaydı)"><input className="input" value={f.evidence} onChange={(e) => setF({ ...f, evidence: e.target.value })} /></Field>
        <div className="row">
          <Btn size="sm" onClick={() => run(() => call('outreach:setPermission', { companyId: c.id, channel: ch, status: f.status, legalBasis: f.legalBasis || null, purpose: c.contact_purpose ?? null, evidence: f.evidence || null }), 'İzin kaydı güncellendi').then(reload)}>Kaydet</Btn>
          {cur && <span className="tiny muted">Son kayıt: {fmtDate(cur.recorded_at, true)}</span>}
        </div>
        <div className="tiny muted">Uygulama hukuki uygunluğu otomatik olarak garanti etmez. Kayıtlar, karar ve kanıtlarınızı belgelemeniz içindir.</div>
      </div>
    </Card>
  )
}

function Tags({ c, reload }: { c: any; reload: () => void }) {
  const [v, setV] = useState(c.tags.join(', '))
  const { run } = useAction()
  return (
    <Card title="Etiketler">
      <div className="row">
        <input className="input" value={v} onChange={(e) => setV(e.target.value)} placeholder="ör. sıcak, referans, 2026-Q4" />
        <Btn size="sm" onClick={() => run(() => call('companies:setTags', { id: c.id, tags: v.split(',').map((s: string) => s.trim()).filter(Boolean) }), 'Etiketler kaydedildi').then(reload)}>Kaydet</Btn>
      </div>
    </Card>
  )
}

function Notes({ c, reload }: { c: any; reload: () => void }) {
  const [v, setV] = useState('')
  const { run } = useAction()
  return (
    <Card title="Müşteri notları">
      <div className="row"><input className="input" value={v} onChange={(e) => setV(e.target.value)} placeholder="Not ekle…" onKeyDown={(e) => e.key === 'Enter' && v.trim() && run(() => call('companies:addNote', { id: c.id, body: v })).then(() => (setV(''), reload()))} /><Btn size="sm" disabled={!v.trim()} onClick={() => run(() => call('companies:addNote', { id: c.id, body: v })).then(() => (setV(''), reload()))}>Ekle</Btn></div>
      {c.notes.map((n: any) => <div key={n.id} className="list-item small"><span style={{ flex: 1 }} className="pre">{n.body}</span><span className="tiny faint">{fmtRel(n.created_at)}</span></div>)}
    </Card>
  )
}

function TasksMini({ c, reload }: { c: any; reload: () => void }) {
  const [t, setT] = useState({ title: '', dueAt: '', priority: 'normal' })
  const { run } = useAction()
  return (
    <Card title="Görevler">
      <div className="row">
        <input className="input" value={t.title} onChange={(e) => setT({ ...t, title: e.target.value })} placeholder="ör. Toplantı planla" />
        <input className="input" type="date" style={{ width: 150 }} value={t.dueAt} onChange={(e) => setT({ ...t, dueAt: e.target.value })} />
        <Btn size="sm" disabled={!t.title.trim()} onClick={() => run(() => call('tasks:save', { title: t.title, dueAt: t.dueAt || null, priority: t.priority, companyId: c.id })).then(() => (setT({ title: '', dueAt: '', priority: 'normal' }), reload()))}>Ekle</Btn>
      </div>
      {c.tasks.map((x: any) => (
        <div key={x.id} className="list-item small">
          <input type="checkbox" checked={x.status === 'done'} style={{ accentColor: 'var(--brand)' }} onChange={() => run(() => call('tasks:save', { id: x.id, title: x.title, companyId: c.id, dueAt: x.due_at, priority: x.priority, status: x.status === 'done' ? 'open' : 'done' })).then(reload)} aria-label="Tamamlandı" />
          <span style={{ flex: 1, textDecoration: x.status === 'done' ? 'line-through' : undefined }}>{x.title}</span>
          <span className="tiny muted">{fmtDate(x.due_at)}</span>
        </div>
      ))}
    </Card>
  )
}

function OutreachTab({ c, reload }: { c: any; reload: () => void }) {
  const [reply, setReply] = useState<{ channel: string; body: string; optOut: boolean } | null>(null)
  const [tone, setTone] = useState('professional')
  const { run } = useAction()
  const { go } = useNav()
  return (
    <div className="grid g2" style={{ alignItems: 'start' }}>
      <Card title="Mesaj taslakları" actions={<>
        <select className="select" style={{ width: 150, minHeight: 30, padding: '2px 8px' }} value={tone} onChange={(e) => setTone(e.target.value)} aria-label="Ton">{MESSAGE_TONES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select>
        <Btn size="sm" onClick={() => run(() => call('drafts:create', { companyId: c.id, channel: 'email', tone }), (r: any) => r?.warning ?? 'E-posta taslağı oluşturuldu').then(reload)}>+ E-posta</Btn>
        <Btn size="sm" onClick={() => run(() => call('drafts:create', { companyId: c.id, channel: 'whatsapp', tone }), (r: any) => r?.warning ?? 'WhatsApp taslağı oluşturuldu').then(reload)}>+ WhatsApp</Btn>
      </>}>
        {c.drafts.length ? c.drafts.map((d: any) => (
          <div key={d.id} className="list-item small" style={{ alignItems: 'flex-start' }}>
            <Badge tone={d.channel === 'email' ? 'info' : 'success'}>{d.channel === 'email' ? 'E-posta' : 'WhatsApp'}</Badge>
            <div style={{ flex: 1, minWidth: 0 }}>
              {d.subject && <b className="ellipsis" style={{ display: 'block' }}>{d.subject}</b>}
              <div className="muted" style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{d.body}</div>
              <div className="tiny faint">{d.generator === 'ai' ? 'Yapay zekâ' : d.generator === 'manual' ? 'Düzenlendi' : 'Şablon'} · {fmtRel(d.created_at)}</div>
            </div>
            <Badge tone={DRAFT_STATUS[d.status]?.[1]}>{DRAFT_STATUS[d.status]?.[0]}</Badge>
            <Btn size="sm" onClick={() => go('studio', { draft: d.id })}>Düzenle</Btn>
          </div>
        )) : <div className="muted small">Taslak yok.</div>}
      </Card>
      <div className="col" style={{ gap: 14 }}>
        <Card title="Gönderimler">
          {c.messages.length ? c.messages.map((m: any) => (
            <div key={m.id} className="list-item small">
              <Badge tone={MSG_STATUS[m.status]?.[1]}>{MSG_STATUS[m.status]?.[0]}</Badge>
              <span style={{ flex: 1 }} className="ellipsis">{m.channel === 'email' ? 'E-posta' : 'WhatsApp'} → {m.recipient}{m.test_mode ? ' (test)' : ''}</span>
              <span className="tiny muted">{fmtDate(m.sent_at ?? m.queued_at, true)}</span>
            </div>
          )) : <div className="muted small">Gönderim yok.</div>}
        </Card>
        <Card title="İletişim geçmişi ve yanıtlar" actions={<Btn size="sm" icon={<MessageSquareReply />} onClick={() => setReply({ channel: 'phone', body: '', optOut: false })}>Yanıt / görüşme kaydet</Btn>}>
          {c.events.length ? (
            <div className="timeline">
              {c.events.map((e: any) => (
                <div key={e.id} className="ev small">
                  <b>{e.direction === 'in' ? 'Gelen' : e.direction === 'out' ? 'Giden' : 'Not'} · {e.channel}</b> <span className="muted">{e.kind}</span>
                  {e.summary && <div>{e.summary}</div>}
                  {e.body && e.direction === 'in' && <div className="muted pre" style={{ maxHeight: 120, overflow: 'auto' }}>{e.body}</div>}
                  <div className="tiny faint">{fmtDate(e.occurred_at, true)}</div>
                </div>
              ))}
            </div>
          ) : <div className="muted small">Kayıtlı iletişim yok.</div>}
        </Card>
      </div>
      {reply && (
        <Modal title="Yanıt / görüşme kaydet" onClose={() => setReply(null)} footer={<><Btn onClick={() => setReply(null)}>Vazgeç</Btn><Btn variant="primary" disabled={!reply.body.trim()} onClick={() => run(() => call('outreach:logReply', { companyId: c.id, channel: reply.channel, body: reply.body, optOut: reply.optOut }), 'Kaydedildi').then(() => (setReply(null), reload()))}>Kaydet</Btn></>}>
          <div className="col">
            <Field label="Kanal"><select className="select" value={reply.channel} onChange={(e) => setReply({ ...reply, channel: e.target.value })}><option value="phone">Telefon</option><option value="whatsapp">WhatsApp</option><option value="email">E-posta</option></select></Field>
            <Field label="İçerik"><textarea className="textarea" value={reply.body} onChange={(e) => setReply({ ...reply, body: e.target.value })} /></Field>
            <label className="check"><input type="checkbox" checked={reply.optOut} onChange={(e) => setReply({ ...reply, optOut: e.target.checked })} />Şirket iletişim istemediğini belirtti (ret listesine ekle)</label>
          </div>
        </Modal>
      )}
    </div>
  )
}
