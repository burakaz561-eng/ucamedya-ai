// Kanal bazlı gönderim paneli (E-posta ve WhatsApp ekranlarında kullanılır).
// Düğmeler: Taslakları oluştur · Seçilenleri incele · Onaylananları kuyruğa ekle · Kuyruğu başlat · Duraklat ·
// Devam ettir · İptal et · Hataları göster · Sonuçları dışa aktar.

import { useState } from 'react'
import { Sparkles, Eye, ListPlus, Play, Pause, Square, AlertTriangle, Download, CheckCheck, ExternalLink, RotateCcw } from 'lucide-react'
import { call, useApi } from '../lib/api'
import { useNav } from '../lib/nav'
import { Badge, Btn, Callout, Card, Modal, Seg, useAction, useConfirm } from './ui'
import { DataTable } from './DataTable'
import { DRAFT_STATUS, MSG_STATUS, fmtDate } from '../lib/format'

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
  const ids = [...sel]
  const selected = (drafts ?? []).filter((d) => sel.has(d.id))
  const failed = (messages ?? []).filter((m) => ['failed', 'blocked'].includes(m.status))
  const manualOpen = (messages ?? []).filter((m) => m.status === 'manual_opened')
  const label = channel === 'email' ? 'E-posta' : 'WhatsApp'

  const enqueue = async () => {
    const approved = selected.filter((d) => d.status === 'approved')
    if (!approved.length) return run(async () => { throw new Error('Seçimde onaylı taslak yok. Önce "Seçilenleri incele" ile onaylayın.') })
    if (!testMode && !(await ask('Gerçek gönderim kuyruğu', <>{approved.length} mesaj gerçek alıcılara gönderilmek üzere kuyruğa alınacak. Kuyruk siz başlatana kadar çalışmaz. Devam edilsin mi?</>, { confirm: 'Kuyruğa ekle' }))) return
    const r = await run(() => call<any>('outreach:enqueue', { ids: approved.map((d) => d.id) }))
    if (r) {
      setSel(new Set())
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
          <Btn icon={<Sparkles />} disabled={!sel.size} title="Seçili şirketler için yeni taslak üretir" onClick={() => run(() => call('drafts:createBulk', { companyIds: [...new Set(selected.map((d) => d.company_id))], channels: [channel], tone: 'professional' }), 'Taslaklar hazırlanıyor')}>Taslakları oluştur</Btn>
          <Btn icon={<Eye />} disabled={!sel.size} onClick={() => setReview(true)}>Seçilenleri incele ({sel.size})</Btn>
          <Btn icon={<ListPlus />} disabled={!sel.size || busy} onClick={enqueue}>Onaylananları kuyruğa ekle</Btn>
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

      <div className="row"><Seg value={view} onChange={setView} items={[{ key: 'drafts', label: `Taslaklar (${drafts?.length ?? 0})` }, { key: 'messages', label: `Gönderimler (${messages?.length ?? 0})` }]} /></div>
      <Card pad={false}>
        {view === 'drafts' ? (
          <DataTable
            id={`outreach-${channel}`}
            rows={drafts ?? []}
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
              { key: 'eligibility', header: 'İletişim uygunluğu', width: 170, render: (r) => (r.status === 'sent' ? '—' : r.eligibility.ok ? <Badge tone="success">Uygun</Badge> : <span title={r.eligibility.reasons.join('\n')}><Badge tone="danger">{r.eligibility.reasons.length} engel</Badge></span>) },
              { key: 'status', header: 'Onay durumu', width: 130, render: (r) => <Badge tone={DRAFT_STATUS[r.status]?.[1]}>{DRAFT_STATUS[r.status]?.[0]}</Badge> },
              { key: 'send_status', header: 'Gönderim durumu', width: 140, render: (r) => (r.send_status ? <Badge tone={MSG_STATUS[r.send_status]?.[1]}>{MSG_STATUS[r.send_status]?.[0]}</Badge> : '—') },
              { key: 'last_action_at', header: 'Son işlem tarihi', width: 140, render: (r) => fmtDate(r.last_action_at ?? r.updated_at, true) }
            ]}
          />
        ) : (
          <DataTable
            id={`messages-${channel}`}
            rows={messages ?? []}
            cols={[
              { key: 'company_name', header: 'Şirket', width: 200 },
              { key: 'recipient', header: 'Alıcı', width: 190, render: (r) => <>{r.recipient}{r.test_mode ? <Badge tone="info">test</Badge> : null}</> },
              { key: 'status', header: 'Durum', width: 140, render: (r) => <Badge tone={MSG_STATUS[r.status]?.[1]}>{MSG_STATUS[r.status]?.[0]}</Badge> },
              { key: 'subject', header: 'Konu / mesaj', width: 260, render: (r) => r.subject ?? r.body.slice(0, 80) },
              { key: 'error', header: 'Hata', width: 260, render: (r) => <span className="small" style={{ color: 'var(--danger)' }}>{r.error ?? ''}</span> },
              { key: 'sent_at', header: 'Gönderim', width: 140, render: (r) => fmtDate(r.sent_at ?? r.queued_at, true) },
              { key: 'x', header: '', width: 100, render: (r) => (['failed', 'blocked'].includes(r.status) ? <Btn size="sm" icon={<RotateCcw />} onClick={() => run(() => call('outreach:retry', { id: r.id }), 'Yeniden kuyruğa alındı')}>Tekrar</Btn> : null) }
            ]}
          />
        )}
      </Card>

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
