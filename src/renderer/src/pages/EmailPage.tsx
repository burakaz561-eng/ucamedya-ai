import { useState } from 'react'
import { Plus, RefreshCw, Trash2, PlugZap } from 'lucide-react'
import { call, useApi } from '../lib/api'
import { Badge, Btn, Callout, Card, Modal, useAction, useConfirm } from '../components/ui'
import { EmailAccountForm } from '../components/forms'
import { OutreachPanel } from '../components/OutreachPanel'
import { fmtRel } from '../lib/format'
import type { PageProps } from '../lib/page'

/* eslint-disable @typescript-eslint/no-explicit-any */
export default function EmailPage({ settings }: PageProps) {
  const { data: accounts, reload } = useApi<any[]>('email:list', undefined, ['integrations'])
  const [edit, setEdit] = useState<any | null>(null)
  const { run } = useAction()
  const { ask, node } = useConfirm()
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="page-head">
        <div>
          <h1>E-posta Kampanyaları</h1>
          <p>Onaylı taslakları bağlı hesabınızdan kontrollü bir kuyrukla gönderin; yanıtlar IMAP ile şirket kartlarına eşleştirilir. Yüksek hacimli ve izinsiz gönderim desteklenmez.</p>
        </div>
        <div className="actions">
          <Btn icon={<RefreshCw />} onClick={() => run(() => call('outreach:syncReplies'), 'Gelen kutusu kontrolü başlatıldı')}>Yanıtları kontrol et</Btn>
          <Btn variant="primary" icon={<Plus />} onClick={() => setEdit({})}>Hesap ekle</Btn>
        </div>
      </div>
      {settings.outreach.emailChannel === 'webmail' ? <Callout tone="brand">E-postalar <b>Webmail (Roundcube) üzerinden, tarayıcıda</b> hazırlanır ve gönderilir: {settings.outreach.webmailUrl || 'adres Ayarlar’da girilmeli'}. Oturumu Canlı Kontrol Merkezi’nden kontrol edebilirsiniz.</Callout> : null}
      {settings.outreach.emailChannel === 'gmail_web' ? (
        <Callout tone="brand">E-postalar <b>Gmail üzerinden, tarayıcıda</b> hazırlanır ve gönderilir (API gerekmez). Gmail oturumunu Canlı Kontrol Merkezi'nden kontrol edebilirsiniz. Kanal: Ayarlar &gt; Mesaj gönderimi. Yanıt takibi bu kanalda otomatik değildir; gelen yanıtları müşteri kartından kaydedin.</Callout>
      ) : null}
      <Card title={settings.outreach.emailChannel !== 'smtp' ? 'SMTP hesapları (isteğe bağlı, şu an kullanılmıyor)' : 'Bağlı hesaplar'}>
        {!accounts?.length ? <Callout>Henüz e-posta hesabı yok. Gmail, Google Workspace, Outlook, Microsoft 365 veya kurumsal SMTP/IMAP hesabınızı ekleyin.</Callout> : accounts.map((a) => (
          <div key={a.id} className="list-item">
            <Badge tone={a.status === 'ok' ? 'success' : a.status === 'error' ? 'danger' : 'neutral'} dot>{a.status === 'ok' ? 'Doğrulandı' : a.status === 'error' ? 'Hata' : 'Test edilmedi'}</Badge>
            <div style={{ flex: 1, minWidth: 0 }}>
              <b>{a.from_name ? `${a.from_name} <${a.from_email}>` : a.from_email}</b>
              <div className="tiny muted">{a.provider} · SMTP {a.smtp_host}:{a.smtp_port}{a.imap_host ? ` · IMAP ${a.imap_host}` : ' · IMAP yok (yanıt takibi kapalı)'} · günlük sınır {a.daily_limit}{a.last_check_at ? ` · son kontrol ${fmtRel(a.last_check_at)}` : ''}</div>
              {a.last_error && <div className="tiny" style={{ color: 'var(--danger)' }}>{a.last_error}</div>}
            </div>
            <Btn size="sm" icon={<PlugZap />} onClick={() => run(() => call<any>('email:test', { id: a.id }), (r) => r.message).then(reload)}>Test</Btn>
            <Btn size="sm" onClick={() => setEdit(a)}>Düzenle</Btn>
            <Btn size="sm" variant="ghost" icon={<Trash2 />} aria-label="Sil" onClick={async () => (await ask('Hesap kaldırılsın mı?', 'Hesap ve şifreli parolası silinir. Gönderim geçmişi korunur.', { danger: true, confirm: 'Kaldır' })) && run(() => call('email:delete', { id: a.id }), 'Hesap kaldırıldı').then(reload)} />
          </div>
        ))}
        <div className="tiny muted" style={{ marginTop: 10 }}>Açılma ve tıklanma takibi bu sürümde yapılmaz (gizlilik ve mevzuat nedeniyle varsayılan kapalı; güvenilir veri sağlayıcıdan alınamaz). Teslim durumu yalnızca "sunucu kabul etti" düzeyindedir.</div>
      </Card>
      <OutreachPanel channel="email" testMode={settings.outreach.testMode} />
      {edit && <Modal title={edit.id ? 'E-posta hesabını düzenle' : 'E-posta hesabı ekle'} onClose={() => setEdit(null)} size="wide"><EmailAccountForm initial={edit.id ? edit : undefined} onSaved={() => reload()} /></Modal>}
      {node}
    </div>
  )
}
