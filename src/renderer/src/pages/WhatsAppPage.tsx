import { useState } from 'react'
import { Settings2 } from 'lucide-react'
import { useApi } from '../lib/api'
import { Badge, Btn, Callout, Card, Modal } from '../components/ui'
import { WhatsAppForm } from '../components/forms'
import { OutreachPanel } from '../components/OutreachPanel'
import { fmtRel } from '../lib/format'
import type { PageProps } from '../lib/page'

/* eslint-disable @typescript-eslint/no-explicit-any */
export default function WhatsAppPage({ settings }: PageProps) {
  const { data: wa, reload } = useApi<any>('whatsapp:get', undefined, ['integrations'])
  const [cfg, setCfg] = useState(false)
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="page-head">
        <div>
          <h1>WhatsApp İşlemleri</h1>
          <p>Resmî WhatsApp Business Platform veya manuel tıkla-gönder yöntemi. Spam önleme sistemlerini atlatmaya, robot algısını gizlemeye veya kısıtlamaları aşmaya yönelik hiçbir mekanizma yoktur.</p>
        </div>
        <div className="actions"><Btn icon={<Settings2 />} onClick={() => setCfg(true)}>Yapılandır</Btn></div>
      </div>
      <Card title="Hesap durumu">
        {!wa ? <Callout tone="warn">WhatsApp yapılandırılmamış. "Yapılandır" ile manuel (önerilen başlangıç) veya resmî API modunu seçin.</Callout> : (
          <div className="row wrap">
            <Badge tone={wa.status === 'ok' ? 'success' : wa.status === 'error' ? 'danger' : 'neutral'} dot>{wa.status === 'ok' ? 'Hazır' : wa.status === 'error' ? 'Hata' : 'Test edilmedi'}</Badge>
            <b>{wa.mode === 'cloud_api' ? 'WhatsApp Business Platform (Cloud API)' : 'Manuel tıkla-gönder'}</b>
            {wa.display_phone && <span className="muted">{wa.display_phone}</span>}
            {wa.template_name && <span className="muted small">Şablon: {wa.template_name} ({wa.template_lang})</span>}
            <span className="muted small">Günlük sınır {wa.daily_limit}{wa.last_check_at ? ` · son kontrol ${fmtRel(wa.last_check_at)}` : ''}</span>
            {wa.last_error && <div className="small" style={{ color: 'var(--danger)', width: '100%' }}>{wa.last_error}</div>}
          </div>
        )}
        <div className="tiny muted" style={{ marginTop: 10 }}>
          Teslim ve okunma bilgileri ile gelen mesajlar, Meta'nın webhook sistemi üzerinden gelir ve herkese açık bir sunucu gerektirir; bu masaüstü sürümü webhook alıcısı içermez. Bu nedenle WhatsApp gönderimlerinde yalnızca "API kabul etti" bilgisi gösterilir. Gelen yanıtları müşteri kartından "Yanıt kaydet" ile ekleyebilirsiniz.
        </div>
      </Card>
      <OutreachPanel channel="whatsapp" testMode={settings.outreach.testMode} />
      {cfg && <Modal title="WhatsApp yapılandırması" onClose={() => (setCfg(false), reload())} size="wide"><WhatsAppForm onSaved={reload} /></Modal>}
    </div>
  )
}
