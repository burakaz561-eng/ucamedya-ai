// Kanal bazlı gönderim paneli (E-posta ve WhatsApp ekranlarında kullanılır).
// Düğmeler: Taslakları oluştur · Seçilenleri incele · Onaylananları kuyruğa ekle · Kuyruğu başlat · Duraklat ·
// Devam ettir · İptal et · Hataları göster · Sonuçları dışa aktar.

import { useState } from 'react'
import { Sparkles, Eye, ListPlus, Play, Pause, Square, AlertTriangle, Download, CheckCheck, ExternalLink, RotateCcw, Trash2, Undo2 } from 'lucide-react'
import { call, useApi } from '../lib/api'
import { useNav } from '../lib/nav'
import { Badge, Btn, Callout, Card, Modal, Seg, useAction, useConfirm, Field } from './ui'
import { DataTable } from './DataTable'
import { DRAFT_STATUS, MSG_STATUS, fmtDate } from '../lib/format'

const SENT = ['sent', 'delivered', 'read', 'manual_opened', 'unverified', 'test_sent']
const QUEUED = ['queued', 'sending', 'preparing', 'awaiting_confirm']

/* eslint-disable @typescript-eslint/no-explicit-any */
export function OutreachPanel({ channel, testMode }: { channel: 'email' | 'whatsapp'; testMode: boolean }) {
  const [view, setView] = useState<'drafts' | 'messages'>('drafts')
  const { data: drafts } = useApi<any[]>('drafts:list', { channel }, ['drafts', 'outreach'])
  const { data: messages } = useApi<any[]>('outreach:messages', { channel }, ['outreach'])
  const { data: q } = useApi<any>('outreach:queue', undefined, ['outreach'])
  const [sel, setSel] = useState<Set<number>>(new Set())
  const [review, setReview] = useState(false)
  const [errors, setErrors] = useState(false)
  const { run, busy } = useAction()
  const { ask, node } = useConfirm()
  const { go, openCompany } = useNav()
  const qs = q?.[channel]
  const manual = channel === 'whatsapp' && qs?.mode === 'click_to_chat'
  const web = channel === 'email' ? ['gmail_web', 'webmail'].includes(q?.emailTransport) : ['whatsapp_web', 'whatsapp_desktop'].includes(qs?.mode)
  const modeLabel = q?.sendMode === 'draft' ? 'Taslak modu: mesajlar hazırlanır, gönderilmez' : q?.sendMode === 'confirm' ? 'Onaylı gönderim: her mesaj için önizleme ve onay' : 'Onaylanmış kuyruk: sırayla gönderilir, sorun olursa durur'
  // Filtre: gönderilenler ayrı durur, yanlışlıkla tekrar gönderilmesin
  const [dfilter, setDfilter] = useState<'pending' | 'queued' | 'sent' | 'all'>('pending')
  const [mfilter, setMfilter] = useState<'all' | 'sent' | 'queued' | 'other'>('all')
  const draftGroup = (d: any): 'pending' | 'queued' | 'sent' => {
    if (d.status === 'sent' || SENT.includes(d.send_status)) return 'sent'
    if (d.status === 'queued' || QUEUED.includes(d.send_status)) return 'queued'
    if ((d.eligibility?.reasons ?? []).some((x: string) => /daha önce mesaj gönderilmiş/.test(x))) return 'sent'
    return 'pending'
  }
  const msgGroup = (m: any): 'sent' | 'queued' | 'other' => (SENT.includes(m.status) ? 'sent' : QUEUED.includes(m.status) ? 'queued' : 'other')
  const dcount = (g: string) => (drafts ?? []).filter((d) => draftGroup(d) === g).length
  const mcount = (g: string) => (messages ?? []).filter((m) => msgGroup(m) === g).length
  const shownDrafts = (drafts ?? []).filter((d) => dfilter === 'all' || draftGroup(d) === dfilter)
  const shownMessages = (messages ?? []).filter((m) => mfilter === 'all' || msgGroup(m) === mfilter)
  const ids = [...sel]
  const selected = (drafts ?? []).filter((d) => sel.has(d.id))
  const failed = (messages ?? []).filter((m) => ['failed', 'blocked'].includes(m.status))
  const manualOpen = (messages ?? []).filter((m) => m.status === 'manual_opened')
  const label = channel === 'email' ? 'E-posta' : 'WhatsApp'

  // Seçimdeki onaylı + onay bekleyen taslaklar tek adımda kuyruğa alınır (onay bekleyenler önce onaylanır)
  const enqueue = async () => {
    const approved = selected.filter((d) => d.status === 'approved')
    const pending = selected.filter((d) => d.status === 'draft')
    const all = [...approved, ...pending]
    if (!all.length) return run(async () => { throw new Error('Seçimde kuyruğa alınabilecek taslak yok (reddedilen, kuyruktaki veya gönderilmiş taslaklar alınmaz).') })
    const body = <>{all.length} taslak kuyruğa eklenecek{pending.length ? <> — <b>{pending.length} tanesi henüz onaylı değil, önce onaylanacak</b></> : null}. {testMode ? 'Test modu açık: mesajlar test alıcınıza gider.' : 'Mesajlar gerçek alıcılara gönderilmek üzere kuyruğa alınır.'} Kuyruk siz başlatana kadar çalışmaz.</>
    if (!(await ask(`${all.length} taslak kuyruğa eklensin mi?`, body, { confirm: pending.length ? 'Onayla ve kuyruğa ekle' : 'Kuyruğa ekle' }))) return
    if (pending.length) await call('drafts:setStatus', { ids: pending.map((d) => d.id), status: 'approved' })
    const r = await run(() => call<any>('outreach:enqueue', { ids: all.map((d) => d.id) }))
    if (r) {
      setSel(new Set())
      if (r.skipped.length) setErrors(true)
      await run(async () => r, () => `${r.queued} mesaj kuyruğa eklendi${r.skipped.length ? `, ${r.skipped.length} mesaj kontrollerden geçemedi` : ''}`)
    }
  }
  const removeDrafts = async () => {
    const del = selected.filter((d) => ['draft', 'approved', 'rejected'].includes(d.status))
    if (!del.length) return run(async () => { throw new Error('Seçimde silinebilecek taslak yok (kuyruktaki veya gönderilmiş taslaklar silinemez; önce kuyruktan çıkarın).') })
    if (!(await ask(`${del.length} taslak silinsin mi?`, <>Seçilen taslaklar kalıcı olarak silinir. Şirket kayıtları ve iletişim geçmişi silinmez; istediğinizde yeniden taslak oluşturabilirsiniz.</>, { danger: true, confirm: `${del.length} taslağı sil` }))) return
    const r = await run(() => call<{ deleted: number; skipped: number }>('drafts:deleteMany', { ids: del.map((d) => d.id) }), (x) => `${x.deleted} taslak silindi`)
    if (r) setSel(new Set())
  }
  const [msel, setMsel] = useState<Set<number>>(new Set())
  const queuedSel = (messages ?? []).filter((m) => msel.has(m.id) && m.status === 'queued')
  const dequeue = async (idsToRemove: number[]) => {
    if (!idsToRemove.length) return
    if (!(await ask(`${idsToRemove.length} mesaj kuyruktan çıkarılsın mı?`, 'Mesajlar gönderilmez; taslakları onaylı duruma döner, isterseniz sonra yeniden kuyruğa ekleyebilir ya da silebilirsiniz.', { confirm: 'Kuyruktan çıkar' }))) return
    const n = await run(() => call<number>('outreach:dequeue', { ids: idsToRemove }), (x) => `${x} mesaj kuyruktan çıkarıldı`)
    if (n != null) setMsel(new Set())
  }
  // Toplu kuyruğa ekle: seçim gerekmeden kanaldaki tüm uygun taslaklar
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkPending, setBulkPending] = useState(true)
  const [bulkLimit, setBulkLimit] = useState('')
  const realBlock = (d: any) => (d.eligibility?.reasons ?? []).filter((x: string) => !/henüz onaylanmadı/.test(x)).length > 0
  const poolApproved = (drafts ?? []).filter((d) => d.status === 'approved' && !realBlock(d))
  const poolPending = (drafts ?? []).filter((d) => d.status === 'draft' && !realBlock(d))
  const poolBlocked = (drafts ?? []).filter((d) => ['approved', 'draft'].includes(d.status) && realBlock(d))
  const bulkRows = [...poolApproved, ...(bulkPending ? poolPending : [])].slice(0, Number(bulkLimit) > 0 ? Number(bulkLimit) : undefined)
  const bulkEnqueue = async () => {
    if (!bulkRows.length) return
    const pend = bulkRows.filter((d) => d.status === 'draft')
    if (pend.length) await call('drafts:setStatus', { ids: pend.map((d) => d.id), status: 'approved' })
    const r = await run(() => call<any>('outreach:enqueue', { ids: bulkRows.map((d) => d.id) }))
    if (r) {
      setBulkOpen(false)
      if (r.skipped.length) setErrors(true)
      await run(async () => r, () => `${r.queued} mesaj kuyruğa eklendi${r.skipped.length ? `, ${r.skipped.length} mesaj kontrollerden geçemedi` : ''}`)
    }
  }
  const start = async () => {
    if (!testMode && !(await ask(`${label} kuyruğu başlatılsın mı?`, <>Kuyruktaki {qs?.counts?.queued ?? 0} mesaj, {channel === 'email' ? 'e-posta hesabınız' : 'WhatsApp Business hesabınız'} üzerinden sırayla <b>gerçek alıcılara</b> gönderilecek. Her gönderimden önce ret listesi ve izinler yeniden kontrol edilir. İstediğiniz an duraklatabilirsiniz.</>, { confirm: 'Gönderimi başlat' }))) return
    run(() => call('outreach:start', { channel }), 'Kuyruk başlatıldı')
  }

  return (
    <div className="col" style={{ gap: 14 }}>
      {testMode ? <Callout tone="warn"><b>Test modu açık.</b> Tüm gönderimler Ayarlar'daki test alıcısına yönlendirilir; hiçbir şirkete mesaj gitmez.</Callout> : <Callout tone="brand"><b>Canlı mod.</b> Onayladığınız ve kuyruğu başlattığınız mesajlar gerçek alıcılara gider.</Callout>}
      {web && <Callout tone="info">{channel === 'email' ? (q?.emailTransport === 'webmail' ? 'Webmail (tarayıcı)' : 'Gmail (tarayıcı)') : qs?.mode === 'whatsapp_desktop' ? 'WhatsApp masaüstü uygulaması — gönderme sizde' : 'WhatsApp Web (tarayıcı)'} · <b>{modeLabel}</b>. Gönderim sırasında tarayıcıyı Canlı Kontrol Merkezi'nden izleyebilirsiniz.</Callout>}
      <Card>
        <div className="row wrap" style={{ gap: 8 }}>
          <Btn variant="primary" icon={<ListPlus />} disabled={busy || !(drafts ?? []).some((d) => ['approved', 'draft'].includes(d.status))} onClick={() => setBulkOpen(true)}>Toplu kuyruğa ekle</Btn>
          <Btn icon={<Sparkles />} disabled={!sel.size} title="Seçili şirketler için yeni taslak üretir" onClick={() => run(() => call('drafts:createBulk', { companyIds: [...new Set(selected.map((d) => d.company_id))], channels: [channel], tone: 'professional' }), 'Taslaklar hazırlanıyor')}>Taslakları oluştur</Btn>
          <Btn icon={<Eye />} disabled={!sel.size} onClick={() => setReview(true)}>Seçilenleri incele ({sel.size})</Btn>
          <Btn icon={<ListPlus />} disabled={!sel.size || busy} onClick={enqueue}>Seçilenleri kuyruğa ekle</Btn>
          <Btn variant="ghost" icon={<Trash2 />} disabled={!sel.size || busy} onClick={removeDrafts}>Seçilenleri sil</Btn>
          <span style={{ width: 1, height: 26, background: 'var(--line)' }} />
          {manual ? (
            <Btn variant="primary" icon={<ExternalLink />} disabled={!qs?.counts?.queued} onClick={() => run(() => call<any>('outreach:manualNext'), (r) => (r ? `${r.company} için WhatsApp açıldı. Gönderdikten sonra aşağıdan işaretleyin.` : 'Kuyrukta mesaj yok'))}>Sıradakini WhatsApp'ta aç</Btn>
          ) : (
            <>
              {qs?.state !== 'running' && <Btn variant="primary" icon={<Play />} disabled={!qs?.counts?.queued} onClick={start}>{qs?.state === 'paused' ? 'Devam ettir' : 'Kuyruğu başlat'}</Btn>}
              {qs?.state === 'running' && <Btn icon={<Pause />} onClick={() => run(() => call('outreach:pause', { channel }), 'Kuyruk duraklatıldı; yeni mesaj gönderilmeyecek')}>Duraklat</Btn>}
            </>
          )}
          <Btn variant="danger" icon={<Square />} disabled={!qs?.counts?.queued} onClick={async () => (await ask('Kuyruk iptal edilsin mi?', 'Henüz gönderilmemiş mesajlar iptal edilir, taslaklar onaylı duruma döner.', { danger: true, confirm: 'İptal et' })) && run(() => call<number>('outreach:cancel', { channel }), (n) => `${n} mesaj iptal edildi`)}>İptal et</Btn>
          <Btn icon={<AlertTriangle />} onClick={() => setErrors(true)} disabled={!failed.length}>Hataları göster ({failed.length})</Btn>
          <Btn icon={<Download />} onClick={() => run(() => call<string | null>('outreach:exportResults'), (p) => (p ? `Kaydedildi: ${p}` : 'İptal edildi'))}>Sonuçları dışa aktar</Btn>
          <div className="spacer" />
          <Badge tone={qs?.state === 'running' ? 'brand' : qs?.state === 'paused' ? 'warning' : 'neutral'} dot>{manual ? 'Manuel mod' : qs?.state === 'running' ? 'Kuyruk çalışıyor' : qs?.state === 'paused' ? 'Duraklatıldı' : 'Kuyruk durdu'}</Badge>
          <span className="small muted">Kuyrukta {qs?.counts?.queued ?? 0} · Bugün {qs?.sentToday ?? 0} gönderim</span>
        </div>
      </Card>

      {manual && manualOpen.length > 0 && (
        <Card title="WhatsApp'ta açılan, onay bekleyen mesajlar">
          {manualOpen.map((m) => (
            <div key={m.id} className="list-item small">
              <span style={{ flex: 1 }}>{m.company_name} → {m.recipient}</span>
              <Btn size="sm" variant="primary" icon={<CheckCheck />} onClick={() => run(() => call('outreach:manualMark', { id: m.id, sent: true }), 'Gönderildi olarak işaretlendi')}>Gönderdim</Btn>
              <Btn size="sm" onClick={() => run(() => call('outreach:manualMark', { id: m.id, sent: false }), 'İptal edildi')}>Göndermedim</Btn>
            </div>
          ))}
        </Card>
      )}

      <div className="row wrap">
        <Seg value={view} onChange={setView} items={[{ key: 'drafts', label: `Taslaklar (${drafts?.length ?? 0})` }, { key: 'messages', label: `Gönderimler (${messages?.length ?? 0})` }]} />
        <div className="spacer" />
        {view === 'drafts' ? (
          <Seg value={dfilter} onChange={(v) => (setDfilter(v), setSel(new Set()))} items={[{ key: 'pending', label: `Gönderilmeyenler (${dcount('pending')})` }, { key: 'queued', label: `Kuyrukta (${dcount('queued')})` }, { key: 'sent', label: `Gönderilenler (${dcount('sent')})` }, { key: 'all', label: 'Tümü' }]} />
        ) : (
          <Seg value={mfilter} onChange={(v) => (setMfilter(v), setMsel(new Set()))} items={[{ key: 'all', label: 'Tümü' }, { key: 'sent', label: `Gönderilenler (${mcount('sent')})` }, { key: 'queued', label: `Kuyrukta (${mcount('queued')})` }, { key: 'other', label: `İptal / hata (${mcount('other')})` }]} />
        )}
      </div>
      {view === 'drafts' && dfilter === 'sent' && <Callout tone="info">Bu şirketlere bu kanaldan zaten mesaj gönderildi. Tekrar gönderim engeli açık olduğu için toplu kuyruğa eklenmezler.</Callout>}
      <Card pad={false}>
        {view === 'drafts' ? (
          <DataTable
            id={`outreach-${channel}`}
            rows={shownDrafts}
            selectable
            selected={sel}
            onSelect={setSel}
            onRowClick={(r) => go('studio', { draft: r.id })}
            empty={<div className="muted small" style={{ padding: 16 }}>Bu kanal için taslak yok. Müşteri Havuzu'nda şirket seçip "Taslak oluştur" deyin.</div>}
            cols={[
              { key: 'company_name', header: 'Şirket', width: 200, render: (r) => <a href="#" onClick={(e) => (e.preventDefault(), e.stopPropagation(), openCompany(r.company_id))}>{r.company_name}</a> },
              { key: 'recipient', header: channel === 'email' ? 'E-posta' : 'Telefon numarası', width: 170, render: (r) => (channel === 'email' ? r.email : r.phone) ?? <span className="muted">yok</span> },
              { key: 'website', header: 'Web sitesi', width: 160, render: (r) => r.website?.replace(/^https?:\/\//, '') ?? '—' },
              { key: 'body', header: 'Mesaj taslağı', width: 280, render: (r) => <span className="muted">{r.subject ? `${r.subject} — ` : ''}{r.body.slice(0, 90)}</span> },
              { key: 'eligibility', header: 'İletişim uygunluğu', width: 170, render: (r) => { if (r.status === 'sent') return '—'; const b = (r.eligibility.reasons as string[]).filter((x) => !/henüz onaylanmadı/.test(x)); return b.length ? <span title={b.join('\n')}><Badge tone="danger">{b.length} engel</Badge></span> : <Badge tone="success">Uygun</Badge> } },
              { key: 'status', header: 'Onay durumu', width: 130, render: (r) => <Badge tone={DRAFT_STATUS[r.status]?.[1]}>{DRAFT_STATUS[r.status]?.[0]}</Badge> },
              { key: 'send_status', header: 'Gönderim durumu', width: 140, render: (r) => (r.send_status ? <Badge tone={MSG_STATUS[r.send_status]?.[1]}>{MSG_STATUS[r.send_status]?.[0]}</Badge> : '—') },
              { key: 'last_action_at', header: 'Son işlem tarihi', width: 140, render: (r) => fmtDate(r.last_action_at ?? r.updated_at, true) }
            ]}
          />
        ) : (
          <DataTable
            id={`messages-${channel}`}
            rows={shownMessages}
            selectable
            selected={msel}
            onSelect={setMsel}
            toolbar={queuedSel.length ? <Btn size="sm" icon={<Undo2 />} onClick={() => dequeue(queuedSel.map((m) => m.id))}>Seçilenleri kuyruktan çıkar ({queuedSel.length})</Btn> : undefined}
            cols={[
              { key: 'company_name', header: 'Şirket', width: 200 },
              { key: 'recipient', header: 'Alıcı', width: 190, render: (r) => <>{r.recipient}{r.test_mode ? <Badge tone="info">test</Badge> : null}</> },
              { key: 'status', header: 'Durum', width: 140, render: (r) => <Badge tone={MSG_STATUS[r.status]?.[1]}>{MSG_STATUS[r.status]?.[0]}</Badge> },
              { key: 'subject', header: 'Konu / mesaj', width: 260, render: (r) => r.subject ?? r.body.slice(0, 80) },
              { key: 'error', header: 'Hata', width: 260, render: (r) => <span className="small" style={{ color: 'var(--danger)' }}>{r.error ?? ''}</span> },
              { key: 'sent_at', header: 'Gönderim', width: 140, render: (r) => fmtDate(r.sent_at ?? r.queued_at, true) },
              { key: 'x', header: '', width: 150, render: (r) => (['failed', 'blocked'].includes(r.status) ? <Btn size="sm" icon={<RotateCcw />} onClick={(e) => (e.stopPropagation(), run(() => call('outreach:retry', { id: r.id }), 'Yeniden kuyruğa alındı'))}>Tekrar</Btn> : r.status === 'queued' ? <Btn size="sm" icon={<Undo2 />} onClick={(e) => (e.stopPropagation(), dequeue([r.id]))}>Kuyruktan çıkar</Btn> : null) }
            ]}
          />
        )}
      </Card>

      {bulkOpen && (
        <Modal title={`Toplu kuyruğa ekle — ${label}`} sub="Kanaldaki gönderilmemiş taslaklar tek seferde kuyruğa alınır. Kuyruk siz başlatana kadar çalışmaz." onClose={() => setBulkOpen(false)} footer={<>
          <Btn onClick={() => setBulkOpen(false)}>Vazgeç</Btn>
          <Btn variant="primary" icon={<ListPlus />} disabled={busy || !bulkRows.length} onClick={bulkEnqueue}>{bulkRows.length} taslağı kuyruğa ekle</Btn>
        </>}>
          <div className="col" style={{ gap: 12 }}>
            <div className="kv">
              <div>Onaylı taslak</div><div><b>{poolApproved.length}</b></div>
              <div>Onay bekleyen taslak</div><div><b>{poolPending.length}</b></div>
              <div>Gönderim engeli olan</div><div><b>{poolBlocked.length}</b> <span className="tiny muted">(eklenmez — ör. geçerli alıcı yok, ret listesinde)</span></div>
            </div>
            <label className="check"><input type="checkbox" checked={bulkPending} onChange={(e) => setBulkPending(e.target.checked)} /><div><b>Onay bekleyenleri de onayla ve ekle</b><div className="small muted">Kapalıysa yalnızca daha önce onayladığınız taslaklar eklenir.</div></div></label>
            <Field label="En fazla kaç taslak eklensin? (boş = hepsi)" hint={channel === 'whatsapp' ? 'Hesap kısıtlaması riskini azaltmak için günlük az sayıda (ör. 20) önerilir.' : 'Günlük gönderim sınırınızı göz önünde bulundurun.'}>
              <input className="input" type="number" min={1} value={bulkLimit} onChange={(e) => setBulkLimit(e.target.value)} placeholder="hepsi" style={{ maxWidth: 160 }} />
            </Field>
            {testMode ? <Callout tone="warn">Test modu açık: mesajlar test alıcınıza gider.</Callout> : <Callout tone="brand">Canlı mod: kuyruğu başlattığınızda mesajlar gerçek alıcılara gider{q?.sendMode === 'confirm' ? '; her mesaj için yine onay pencereniz açılır' : ''}.</Callout>}
          </div>
        </Modal>
      )}

      {review && (
        <Modal title={`Seçilen ${selected.length} taslak`} sub="İnceleyip toplu onaylayabilir veya reddedebilirsiniz." onClose={() => setReview(false)} size="wide" footer={<>
          <Btn onClick={() => run(() => call('drafts:setStatus', { ids, status: 'rejected' }), 'Reddedildi').then(() => setReview(false))}>Tümünü reddet</Btn>
          <Btn variant="primary" icon={<CheckCheck />} onClick={() => run(() => call('drafts:setStatus', { ids, status: 'approved' }), 'Onaylandı').then(() => setReview(false))}>Tümünü onayla</Btn>
        </>}>
          <div className="col" style={{ gap: 10 }}>
            {selected.map((d) => (
              <div key={d.id} className="card pad">
                <div className="row wrap"><b>{d.company_name}</b><Badge tone={DRAFT_STATUS[d.status]?.[1]}>{DRAFT_STATUS[d.status]?.[0]}</Badge>{!d.eligibility.ok && <Badge tone="danger">{d.eligibility.reasons.join(' ')}</Badge>}</div>
                {d.subject && <div className="small" style={{ marginTop: 6 }}><b>Konu:</b> {d.subject}</div>}
                <div className="small pre" style={{ marginTop: 6 }}>{d.body}</div>
              </div>
            ))}
          </div>
        </Modal>
      )}
      {errors && (
        <Modal title="Hatalar ve engellenen mesajlar" onClose={() => setErrors(false)} size="wide">
          {failed.length ? failed.map((m) => (
            <div key={m.id} className="list-item small" style={{ alignItems: 'flex-start' }}>
              <Badge tone={MSG_STATUS[m.status]?.[1]}>{MSG_STATUS[m.status]?.[0]}</Badge>
              <div style={{ flex: 1 }}><b>{m.company_name}</b> → {m.recipient}<div style={{ color: 'var(--danger)' }}>{m.error}</div></div>
              <Btn size="sm" onClick={() => run(() => call('outreach:retry', { id: m.id }), 'Yeniden kuyruğa alındı')}>Tekrar dene</Btn>
            </div>
          )) : <div className="muted">Hata yok.</div>}
        </Modal>
      )}
      {node}
    </div>
  )
}
