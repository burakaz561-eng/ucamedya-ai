// İletişim Merkezi: tüm kanalların kuyruk özeti, onay bekleyenler, son gönderimler ve ret listesi.

import { useState } from 'react'
import { Mail, MessageCircle, Ban, Plus, Trash2 } from 'lucide-react'
import { call, useApi } from '../lib/api'
import { useNav } from '../lib/nav'
import { Badge, Btn, Callout, Card, Field, Modal, Stat, Tabs, useAction } from '../components/ui'
import { DataTable } from '../components/DataTable'
import { MSG_STATUS, fmtDate } from '../lib/format'
import type { PageProps } from '../lib/page'

/* eslint-disable @typescript-eslint/no-explicit-any */
export default function Communication({ settings }: PageProps) {
  const { data: q } = useApi<any>('outreach:queue', undefined, ['outreach'])
  const { data: msgs } = useApi<any[]>('outreach:messages', { limit: 300 }, ['outreach'])
  const { data: drafts } = useApi<any[]>('drafts:list', { status: 'draft' }, ['drafts'])
  const { data: sup, reload: reloadSup } = useApi<any[]>('suppression:list', undefined, ['companies', 'outreach'])
  const [tab, setTab] = useState<'messages' | 'suppression'>('messages')
  const [add, setAdd] = useState<{ type: string; value: string; reason: string } | null>(null)
  const [remove, setRemove] = useState<any | null>(null)
  const { go, openCompany } = useNav()
  const { run } = useAction()
  const c = (ch: string, k: string) => q?.[ch]?.counts?.[k] ?? 0
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="page-head">
        <div>
          <h1>İletişim Merkezi</h1>
          <p>Onay → kuyruk → gönderim → yanıt. Her gönderimden önce ret listesi, izin durumu, kişisel veri ayrımı ve tekrar gönderim kontrolü yapılır.</p>
        </div>
        <div className="actions">
          <Btn icon={<Mail />} onClick={() => go('email')}>E-posta kuyruğu</Btn>
          <Btn icon={<MessageCircle />} onClick={() => go('whatsapp')}>WhatsApp kuyruğu</Btn>
          <Btn variant="primary" onClick={() => go('studio')}>Taslakları incele ({drafts?.length ?? 0})</Btn>
        </div>
      </div>
      {settings.outreach.testMode && <Callout tone="warn">Test modu açık: hiçbir şirkete mesaj gitmez. Kapatmak için Ayarlar &gt; İletişim.</Callout>}
      <div className="grid g6">
        <Stat label="Onay bekleyen taslak" value={drafts?.length ?? 0} />
        <Stat label="E-posta kuyrukta" value={c('email', 'queued')} sub={q?.email?.state === 'running' ? 'Çalışıyor' : q?.email?.state === 'paused' ? 'Duraklatıldı' : 'Durdu'} />
        <Stat label="E-posta gönderildi" value={c('email', 'sent')} sub={`${c('email', 'failed')} başarısız · ${c('email', 'test_sent')} test`} />
        <Stat label="WhatsApp kuyrukta" value={c('whatsapp', 'queued')} sub={q?.whatsapp?.mode === 'click_to_chat' ? 'Manuel mod' : q?.whatsapp?.state} />
        <Stat label="WhatsApp gönderildi" value={c('whatsapp', 'sent')} sub={`${c('whatsapp', 'manual_opened')} onay bekliyor`} />
        <Stat label="Ret listesi" value={sup?.length ?? 0} sub="silinmeyen kayıtlar" />
      </div>
      <Tabs value={tab} onChange={setTab} items={[{ key: 'messages', label: 'Son gönderimler' }, { key: 'suppression', label: 'Ret listesi (iletişim istemeyenler)' }]} />
      {tab === 'messages' && (
        <Card pad={false}>
          <DataTable id="comm-messages" rows={msgs ?? []} onRowClick={(r) => openCompany(r.company_id)} cols={[
            { key: 'company_name', header: 'Şirket', width: 200 },
            { key: 'channel', header: 'Kanal', width: 100, render: (r) => (r.channel === 'email' ? 'E-posta' : 'WhatsApp') },
            { key: 'recipient', header: 'Alıcı', width: 190, render: (r) => <>{r.recipient} {r.test_mode ? <Badge tone="info">test</Badge> : null}</> },
            { key: 'status', header: 'Durum', width: 140, render: (r) => <Badge tone={MSG_STATUS[r.status]?.[1]}>{MSG_STATUS[r.status]?.[0]}</Badge> },
            { key: 'error', header: 'Hata', width: 260, render: (r) => <span className="small" style={{ color: 'var(--danger)' }}>{r.error ?? ''}</span> },
            { key: 'sent_at', header: 'Tarih', width: 140, render: (r) => fmtDate(r.sent_at ?? r.queued_at, true) }
          ]} />
        </Card>
      )}
      {tab === 'suppression' && (
        <Card title="Ret listesi" actions={<Btn size="sm" icon={<Plus />} onClick={() => setAdd({ type: 'email', value: '', reason: '' })}>Kayıt ekle</Btn>}>
          <Callout>Bu listedeki e-posta, telefon veya alan adlarına hiçbir kanaldan otomatik ya da manuel gönderim yapılamaz. Şirket silinse bile kayıt korunur. "İSTEMİYORUM" içeren e-posta yanıtları otomatik eklenir.</Callout>
          <div style={{ marginTop: 12 }}>
            {sup?.map((s) => (
              <div key={s.id} className="list-item small">
                <Ban size={15} color="var(--danger)" />
                <Badge>{s.type === 'email' ? 'E-posta' : s.type === 'phone' ? 'Telefon' : 'Alan adı'}</Badge>
                <b>{s.value_key}</b>
                <span className="muted" style={{ flex: 1 }}>{s.company_name ? `${s.company_name} · ` : ''}{s.reason ?? ''} ({s.source})</span>
                <span className="tiny faint">{fmtDate(s.created_at)}</span>
                <Btn size="sm" variant="ghost" icon={<Trash2 />} aria-label="Kaldır" onClick={() => setRemove(s)} />
              </div>
            ))}
            {!sup?.length && <div className="muted small">Ret listesi boş.</div>}
          </div>
        </Card>
      )}
      {add && (
        <Modal title="Ret listesine ekle" onClose={() => setAdd(null)} footer={<Btn variant="primary" disabled={add.value.trim().length < 3} onClick={() => run(() => call('suppression:add', add), 'Eklendi').then(() => (setAdd(null), reloadSup()))}>Ekle</Btn>}>
          <div className="col">
            <Field label="Tür"><select className="select" value={add.type} onChange={(e) => setAdd({ ...add, type: e.target.value })}><option value="email">E-posta</option><option value="phone">Telefon</option><option value="domain">Alan adı</option></select></Field>
            <Field label="Değer"><input className="input" value={add.value} onChange={(e) => setAdd({ ...add, value: e.target.value })} /></Field>
            <Field label="Neden"><input className="input" value={add.reason} onChange={(e) => setAdd({ ...add, reason: e.target.value })} /></Field>
          </div>
        </Modal>
      )}
      {remove && <RemoveSuppression item={remove} onClose={() => (setRemove(null), reloadSup())} />}
    </div>
  )
}

function RemoveSuppression({ item, onClose }: { item: any; onClose: () => void }) {
  const [v, setV] = useState('')
  const { run } = useAction()
  return (
    <Modal title="Ret kaydını kaldır" onClose={onClose} footer={<Btn variant="danger" disabled={v !== 'KALDIR'} onClick={() => run(() => call('suppression:remove', { id: item.id, confirm: 'KALDIR' }), 'Kaldırıldı').then(onClose)}>Kaldır</Btn>}>
      <Callout tone="danger">Yalnızca kişi/şirket size tekrar iletişim izni verdiyse kaldırın. <b>{item.value_key}</b> adresine yeniden gönderim yapılabilir hâle gelir.</Callout>
      <Field label='Onaylamak için "KALDIR" yazın'><input className="input" value={v} onChange={(e) => setV(e.target.value)} /></Field>
    </Modal>
  )
}
