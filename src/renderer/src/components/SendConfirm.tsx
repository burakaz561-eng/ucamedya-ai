// Gönderim onayı: tarayıcıda hazırlanan (henüz gönderilmemiş) her mesaj için önizleme ve karar.
// Ayrıca ajan tarayıcısı kullanıcı müdahalesi beklediğinde (giriş, CAPTCHA) ekranın altında uyarı gösterir.

import { useEffect, useState } from 'react'
import { Send, SkipForward, OctagonX, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { call } from '../lib/api'
import { Badge, Btn, Callout, Modal } from './ui'
import { Robot } from '../robot/Robot'

interface Req {
  messageId: number
  channel: 'email' | 'whatsapp'
  company: string
  recipient: string
  recipientVerified: boolean
  verifyNote: string | null
  subject: string | null
  body: string
  attachment: string | null
  image?: string | null
  imageNote?: string | null
  preview: string | null
  testMode: boolean
  manualSend?: boolean
  autoAdvance?: boolean
  realRecipient?: string
  recipientSource?: string | null
}

export function SendConfirm() {
  const [queue, setQueue] = useState<Req[]>([])
  const [busy, setBusy] = useState(false)
  const [checked, setChecked] = useState(false)
  useEffect(
    () =>
      window.api.on('outreach-confirm', (p) => {
        const r = p as Req | { messageId: number; closed: true }
        if ('closed' in r) setQueue((q) => q.filter((x) => x.messageId !== r.messageId))
        else setQueue((q) => [...q.filter((x) => x.messageId !== r.messageId), r])
      }),
    []
  )
  const cur = queue[0]
  useEffect(() => setChecked(false), [cur?.messageId])
  if (!cur) return null
  const decide = async (d: 'send' | 'skip' | 'stop') => {
    setBusy(true)
    try {
      await call('outreach:decide', { messageId: cur.messageId, decision: d })
    } finally {
      setBusy(false)
      setQueue((q) => q.filter((x) => x.messageId !== cur.messageId))
    }
  }
  const needsCheck = !cur.recipientVerified
  return (
    <Modal
      size="xl"
      title={<span className="row">{cur.channel === 'email' ? 'E-posta' : 'WhatsApp'} gönderim onayı — {cur.company}</span>}
      sub="Mesaj tarayıcıda hazırlandı ancak GÖNDERİLMEDİ. Alıcıyı ve içeriği kontrol edip karar verin."
      onClose={() => void decide('stop')}
      footer={
        <>
          <Btn icon={<OctagonX />} variant="danger" disabled={busy} onClick={() => decide('stop')}>Kuyruğu durdur</Btn>
          <div className="spacer" />
          <Btn icon={<SkipForward />} disabled={busy} onClick={() => decide('skip')}>{cur.manualSend ? 'Göndermedim, atla' : 'Bunu atla'}</Btn>
          <Btn icon={<Send />} variant="primary" disabled={busy || (!cur.manualSend && needsCheck && !checked)} onClick={() => decide('send')}>{cur.manualSend ? 'WhatsApp’ta gönderdim' : cur.testMode ? 'Test alıcısına gönder' : 'Gönder'}</Btn>
        </>
      }
    >
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.1fr)', gap: 16 }}>
        <div className="col" style={{ gap: 10 }}>
          {cur.manualSend && <Callout tone="brand"><b>WhatsApp uygulamanızda {cur.company} ile sohbet (+{cur.realRecipient ?? cur.recipient}) açıldı ve mesaj yazıldı.</b> Numara doğruysa WhatsApp’ta <b>Enter</b>’a basın{cur.image ? " (görsel ve metin tek mesaj olarak gider; görsel yapıştırılamadıysa aşağıdaki nota bakın)" : ""}{cur.autoAdvance ? <>. Enter’a bastığınız algılanınca <b>sıradaki sohbet kendiliğinden açılır</b>; buraya dönmeniz gerekmez.</> : <>; ardından burada “WhatsApp’ta gönderdim” deyin.</>} Göndermezseniz “Göndermedim, atla”.</Callout>}
          {cur.testMode && <Callout tone="warn"><b>Test modu açık:</b> mesaj şirkete ({cur.channel === 'whatsapp' ? `+${cur.realRecipient}` : cur.realRecipient}) değil, sizin test {cur.channel === 'whatsapp' ? 'numaranıza' : 'adresinize'} gider. Gerçek gönderim için Ayarlar → Mesaj gönderimi'nden test modunu kapatın.</Callout>}
          <div className="kv">
            <div>Şirket</div><div><b>{cur.company}</b></div>
            <div>{cur.testMode ? 'Şirketin numarası' : 'Alıcı'}</div><div><b>{cur.channel === 'whatsapp' ? `+${cur.realRecipient ?? cur.recipient}` : cur.realRecipient ?? cur.recipient}</b>{cur.recipientSource && <div className="tiny muted">Kaynak: {cur.recipientSource}</div>}</div>
            {cur.testMode && <><div>Mesajın gideceği yer</div><div><b>{cur.channel === 'whatsapp' ? `+${cur.recipient}` : cur.recipient}</b> <span className="tiny muted">(test alıcınız)</span></div></>}
            <div>Doğrulama</div>
            <div>{cur.recipientVerified ? <Badge tone="success"><CheckCircle2 size={12} /> Alıcı doğrulandı</Badge> : <Badge tone="warning"><AlertTriangle size={12} /> Gözle kontrol edin</Badge>}</div>
          </div>
          {cur.verifyNote && <div className="small muted">{cur.verifyNote}</div>}
          {cur.subject && <div><div className="tiny muted">Konu</div><b>{cur.subject}</b></div>}
          <div>
            <div className="tiny muted">Mesaj</div>
            <div className="card pad small pre" style={{ maxHeight: 300, overflow: 'auto' }}>{cur.body}</div>
          </div>
          {cur.attachment && <div className="small">Ek: {cur.attachment.split(', ').map((a) => a.split(/[\\/]/).pop()).join(', ')}</div>}
          {cur.image && (
            <div>
              <div className="tiny muted">Görsel</div>
              <img src={cur.image} alt="Mesaj görseli" style={{ maxWidth: 220, maxHeight: 220, borderRadius: 10, border: '1px solid var(--line)', display: 'block' }} />
              {cur.imageNote && <div className="small" style={{ marginTop: 4 }}><b>{cur.imageNote}</b></div>}
            </div>
          )}
          {!cur.image && cur.imageNote && <div className="small muted">{cur.imageNote}</div>}
          {needsCheck && !cur.manualSend && (
            <label className="check"><input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />Tarayıcıdaki sohbetin/ e-postanın doğru alıcıya ait olduğunu kontrol ettim.</label>
          )}
          {queue.length > 1 && <div className="tiny muted">Sırada {queue.length - 1} onay daha var.</div>}
        </div>
        <div>
          <div className="tiny muted" style={{ marginBottom: 4 }}>Tarayıcının şu anki görünümü</div>
          {cur.preview ? <img src={cur.preview} alt="Tarayıcı önizlemesi" style={{ width: '100%', borderRadius: 10, border: '1px solid var(--line)' }} /> : <div className="muted small">Önizleme alınamadı; tarayıcı penceresine bakın.</div>}
        </div>
      </div>
    </Modal>
  )
}

export function AgentNeedsUser() {
  const [ev, setEv] = useState<{ state: string; step?: string; company?: string | null } | null>(null)
  useEffect(() => window.api.on('agent', (p) => setEv(p as { state: string; step?: string })), [])
  if (ev?.state !== 'needs_user') return null
  return (
    <div style={{ position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: 18, zIndex: 45, display: 'flex', alignItems: 'flex-end', gap: 6, maxWidth: 760 }}>
      <Robot mood="warning" size={90} />
      <div className="card pad" style={{ boxShadow: 'var(--shadow-3)', borderColor: 'var(--warning)' }}>
        <div className="row wrap">
          <AlertTriangle size={18} color="var(--warning)" />
          <b style={{ flex: 1 }}>{ev.step}</b>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <span className="tiny muted" style={{ flex: 1 }}>İşlem tarayıcı penceresinde sizin tamamlamanızı bekliyor; uygulama doğrulamaları otomatik geçmez.</span>
          <Btn size="sm" variant="primary" onClick={() => call('agent:answer', { ok: true })}>Tamamladım</Btn>
          <Btn size="sm" onClick={() => call('agent:answer', { ok: false })}>Vazgeç</Btn>
        </div>
      </div>
    </div>
  )
}
