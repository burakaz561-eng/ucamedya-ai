// Kurulum sihirbazı, Entegrasyonlar ve Ayarlar ekranlarında ortak kullanılan formlar.

import { useEffect, useState } from 'react'
import { Eye, EyeOff, KeyRound, Upload, FolderOpen, PlugZap } from 'lucide-react'
import { call, useApi } from '../lib/api'
import { Badge, Btn, Callout, Field, useAction } from './ui'
import type { AppSettings } from '@shared/types'
import logoDark from '../assets/uca-medya-logo-dark.svg'

export function SecretField({ name, label, hint, status, onSaved, placeholder }: { name: string; label: string; hint?: React.ReactNode; status: Record<string, boolean> | null; onSaved?: () => void; placeholder?: string }) {
  const [v, setV] = useState('')
  const [show, setShow] = useState(false)
  const { run, busy } = useAction()
  const saved = status?.[name]
  return (
    <Field
      label={
        <span className="row">
          {label} {saved ? <Badge tone="success" dot>Kayıtlı</Badge> : <Badge tone="neutral">Girilmedi</Badge>}
        </span>
      }
      hint={hint}
    >
      <div className="row">
        <div style={{ position: 'relative', flex: 1 }}>
          <input className="input" type={show ? 'text' : 'password'} value={v} onChange={(e) => setV(e.target.value)} placeholder={saved ? '•••••••• (değiştirmek için yeni değer girin)' : placeholder ?? 'Anahtarı yapıştırın'} autoComplete="off" spellCheck={false} />
          <button type="button" className="btn ghost sm icon" style={{ position: 'absolute', right: 4, top: 4 }} onClick={() => setShow((s) => !s)} aria-label={show ? 'Gizle' : 'Göster'}>
            {show ? <EyeOff /> : <Eye />}
          </button>
        </div>
        <Btn icon={<KeyRound />} disabled={!v.trim() || busy} onClick={() => run(() => call('secrets:set', { name, value: v }), 'Anahtar güvenli depoya kaydedildi').then((r) => r && (setV(''), onSaved?.()))}>
          Kaydet
        </Btn>
        {saved && (
          <Btn variant="ghost" onClick={() => run(() => call('secrets:set', { name, value: '' }), 'Anahtar silindi').then(() => onSaved?.())}>
            Sil
          </Btn>
        )}
      </div>
    </Field>
  )
}

export function TestButton({ integration, onDone }: { integration: string; onDone?: (r: { ok: boolean; message: string }) => void }) {
  const [res, setRes] = useState<{ ok: boolean; message: string } | null>(null)
  const [busy, setBusy] = useState(false)
  return (
    <div className="col" style={{ gap: 6 }}>
      <div>
        <Btn
          icon={busy ? <span className="spin" /> : <PlugZap />}
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            try {
              const r = await call<{ ok: boolean; message: string }>('integrations:test', { key: integration })
              setRes(r)
              onDone?.(r)
            } catch (e) {
              setRes({ ok: false, message: (e as Error).message })
            } finally {
              setBusy(false)
            }
          }}
        >
          Bağlantıyı test et
        </Btn>
      </div>
      {res && <Callout tone={res.ok ? 'brand' : 'danger'}>{res.message}</Callout>}
    </div>
  )
}

export function BrandForm({ settings, onChange }: { settings: AppSettings; onChange: (s: AppSettings) => void }) {
  const [b, setB] = useState(settings.brand)
  const { data: logo, reload } = useApi<string | null>('brand:logoData')
  const { run } = useAction()
  useEffect(() => setB(settings.brand), [settings.brand])
  const save = async () => {
    const s = await run(() => call<AppSettings>('settings:update', { brand: b }), 'Marka bilgileri kaydedildi')
    if (s) onChange(s)
  }
  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="row" style={{ gap: 16, alignItems: 'center' }}>
        <div className="card" style={{ width: 200, height: 96, display: 'grid', placeItems: 'center', padding: 12, background: '#fff' }}>
          <img src={logo ?? logoDark} alt="Logo" style={{ maxWidth: '100%', maxHeight: '100%' }} />
        </div>
        <div className="col" style={{ gap: 6 }}>
          <div className="small muted">{logo ? 'Yüklediğiniz logo kullanılıyor.' : 'Şu an ucamedya.com.tr sitesindeki resmî UcaMedya logosu kullanılıyor.'}</div>
          <div className="row">
            <Btn icon={<Upload />} onClick={() => run(() => call('brand:pickLogo'), 'Logo güncellendi').then(() => reload())}>
              Logo yükle
            </Btn>
            {logo && (
              <Btn variant="ghost" onClick={() => run(() => call('settings:update', { brand: { ...b, logoPath: '' } }), 'Varsayılan logoya dönüldü').then(() => reload())}>
                Varsayılana dön
              </Btn>
            )}
          </div>
          <div className="tiny muted">PNG, SVG veya JPG. Raporlarda, tekliflerde ve uygulamada kullanılır.</div>
        </div>
      </div>
      <div className="grid g2">
        <Field label="Marka adı"><input className="input" value={b.name} onChange={(e) => setB({ ...b, name: e.target.value })} /></Field>
        <Field label="Gönderen adı" hint="E-postalarda görünen ad"><input className="input" value={b.senderName} onChange={(e) => setB({ ...b, senderName: e.target.value })} /></Field>
        <Field label="Web sitesi"><input className="input" value={b.website} onChange={(e) => setB({ ...b, website: e.target.value })} /></Field>
        <Field label="E-posta"><input className="input" value={b.email} onChange={(e) => setB({ ...b, email: e.target.value })} placeholder="info@ucamedya.com.tr" /></Field>
        <Field label="Telefon"><input className="input" value={b.phone} onChange={(e) => setB({ ...b, phone: e.target.value })} /></Field>
        <Field label="Adres"><input className="input" value={b.address} onChange={(e) => setB({ ...b, address: e.target.value })} /></Field>
      </div>
      <Field label="E-posta imzası"><textarea className="textarea" style={{ minHeight: 80 }} value={b.signature} onChange={(e) => setB({ ...b, signature: e.target.value })} /></Field>
      <div><Btn variant="primary" onClick={save}>Marka bilgilerini kaydet</Btn></div>
    </div>
  )
}

export function DataDirForm({ settings, onChange }: { settings: AppSettings; onChange: (s: AppSettings) => void }) {
  const { data: info } = useApi<{ dataDir: string }>('app:info')
  const { run } = useAction()
  return (
    <div className="col">
      <Field label="Veri klasörü" hint="Şirket klasörleri, ekran görüntüleri, PDF raporlar ve dışa aktarımlar burada saklanır. Veritabanı uygulama veri klasöründe kalır; güncellemelerde silinmez.">
        <div className="row">
          <input className="input" readOnly value={settings.dataDir || info?.dataDir || ''} />
          <Btn icon={<FolderOpen />} onClick={async () => {
            const p = await call<string | null>('dialog:pickFolder')
            if (p) {
              const s = await run(() => call<AppSettings>('settings:update', { dataDir: p }), 'Veri klasörü güncellendi')
              if (s) onChange(s)
            }
          }}>Klasör seç</Btn>
        </div>
      </Field>
    </div>
  )
}

export function EmailAccountForm({ initial, onSaved }: { initial?: Record<string, any>; onSaved?: () => void }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const { data: presets } = useApi<Record<string, { smtp_host: string; smtp_port: number; smtp_secure: boolean; imap_host: string; imap_port: number; note: string }>>('email:presets')
  const [f, setF] = useState({
    id: initial?.id as number | undefined,
    label: initial?.label ?? 'Ana hesap',
    provider: (initial?.provider ?? 'gmail') as string,
    fromName: initial?.from_name ?? 'UcaMedya',
    fromEmail: initial?.from_email ?? '',
    smtpHost: initial?.smtp_host ?? 'smtp.gmail.com',
    smtpPort: initial?.smtp_port ?? 465,
    smtpSecure: initial ? !!initial.smtp_secure : true,
    imapHost: initial?.imap_host ?? 'imap.gmail.com',
    imapPort: initial?.imap_port ?? 993,
    imapSecure: initial ? !!initial.imap_secure : true,
    username: initial?.username ?? '',
    signature: initial?.signature ?? '',
    dailyLimit: initial?.daily_limit ?? 50,
    password: ''
  })
  const { run, busy } = useAction()
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null)
  const setProvider = (p: string) => {
    const pr = presets?.[p]
    setF((x) => ({ ...x, provider: p, ...(pr ? { smtpHost: pr.smtp_host, smtpPort: pr.smtp_port, smtpSecure: pr.smtp_secure, imapHost: pr.imap_host, imapPort: pr.imap_port } : {}) }))
  }
  const save = async () => {
    const id = await run(() => call<number>('email:save', { ...f, imapHost: f.imapHost || null, imapPort: f.imapHost ? Number(f.imapPort) : null, smtpPort: Number(f.smtpPort), dailyLimit: Number(f.dailyLimit), password: f.password || undefined }), 'E-posta hesabı kaydedildi')
    if (id) {
      setF((x) => ({ ...x, id, password: '' }))
      const r = await call<{ ok: boolean; message: string }>('email:test', { id })
      setTest(r)
      onSaved?.()
    }
  }
  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="grid g3">
        <Field label="Sağlayıcı">
          <select className="select" value={f.provider} onChange={(e) => setProvider(e.target.value)}>
            <option value="gmail">Gmail</option>
            <option value="workspace">Google Workspace</option>
            <option value="outlook">Outlook.com</option>
            <option value="m365">Microsoft 365</option>
            <option value="smtp">Diğer (SMTP/IMAP)</option>
          </select>
        </Field>
        <Field label="Gönderen adı"><input className="input" value={f.fromName} onChange={(e) => setF({ ...f, fromName: e.target.value })} /></Field>
        <Field label="Gönderen e-posta"><input className="input" value={f.fromEmail} onChange={(e) => setF({ ...f, fromEmail: e.target.value })} placeholder="info@ucamedya.com.tr" /></Field>
      </div>
      {presets?.[f.provider] && <Callout>{presets[f.provider].note} OAuth ile bağlama bu sürümde yoktur; parola işletim sisteminin güvenli kasasında şifreli saklanır.</Callout>}
      <div className="grid g3">
        <Field label="SMTP sunucusu"><input className="input" value={f.smtpHost} onChange={(e) => setF({ ...f, smtpHost: e.target.value })} /></Field>
        <Field label="SMTP port"><input className="input" type="number" value={f.smtpPort} onChange={(e) => setF({ ...f, smtpPort: Number(e.target.value) })} /></Field>
        <Field label="Güvenlik"><select className="select" value={f.smtpSecure ? '1' : '0'} onChange={(e) => setF({ ...f, smtpSecure: e.target.value === '1' })}><option value="1">SSL/TLS (465)</option><option value="0">STARTTLS (587)</option></select></Field>
        <Field label="IMAP sunucusu" hint="Yanıt takibi için (boş bırakılabilir)"><input className="input" value={f.imapHost} onChange={(e) => setF({ ...f, imapHost: e.target.value })} /></Field>
        <Field label="IMAP port"><input className="input" type="number" value={f.imapPort} onChange={(e) => setF({ ...f, imapPort: Number(e.target.value) })} /></Field>
        <Field label="Günlük gönderim sınırı" hint="Sağlayıcı sınırının altında tutun"><input className="input" type="number" value={f.dailyLimit} onChange={(e) => setF({ ...f, dailyLimit: Number(e.target.value) })} /></Field>
        <Field label="Kullanıcı adı" hint="Boşsa gönderen e-posta kullanılır"><input className="input" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} /></Field>
        <Field label={initial?.hasPassword ? 'Parola / uygulama şifresi (kayıtlı)' : 'Parola / uygulama şifresi'}><input className="input" type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} placeholder={initial?.hasPassword ? 'Değiştirmek için girin' : ''} autoComplete="new-password" /></Field>
      </div>
      <Field label="İmza (isteğe bağlı)"><textarea className="textarea" style={{ minHeight: 70 }} value={f.signature} onChange={(e) => setF({ ...f, signature: e.target.value })} /></Field>
      <div className="row"><Btn variant="primary" disabled={busy || !f.fromEmail || !f.smtpHost} onClick={save}>{busy ? 'Kaydediliyor…' : 'Kaydet ve test et'}</Btn></div>
      {test && <Callout tone={test.ok ? 'brand' : 'danger'}>{test.message}</Callout>}
    </div>
  )
}

export function WhatsAppForm({ onSaved }: { onSaved?: () => void }) {
  const { data, reload } = useApi<Record<string, any> | null>('whatsapp:get') // eslint-disable-line @typescript-eslint/no-explicit-any
  const [f, setF] = useState({ mode: 'click_to_chat', phoneNumberId: '', wabaId: '', templateName: '', templateLang: 'tr', dailyLimit: 50, token: '', templateParams: '{sirket}' })
  const { run, busy } = useAction()
  useEffect(() => {
    if (data) setF((x) => ({ ...x, mode: data.mode, phoneNumberId: data.phone_number_id ?? '', wabaId: data.waba_id ?? '', templateName: data.template_name ?? '', templateLang: data.template_lang ?? 'tr', dailyLimit: data.daily_limit ?? 50, templateParams: (data.templateParams ?? ['{sirket}']).join(', ') }))
  }, [data])
  const save = () =>
    run(() => call('whatsapp:save', { mode: f.mode, phoneNumberId: f.phoneNumberId || null, wabaId: f.wabaId || null, templateName: f.templateName || null, templateLang: f.templateLang || 'tr', dailyLimit: Number(f.dailyLimit), token: f.token || undefined, templateParams: f.templateParams.split(',').map((s) => s.trim()).filter(Boolean) }), 'WhatsApp ayarları kaydedildi').then(() => (setF((x) => ({ ...x, token: '' })), reload(), onSaved?.()))
  return (
    <div className="col" style={{ gap: 12 }}>
      <Field label="Yöntem">
        <select className="select" value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })}>
          <option value="click_to_chat">Manuel — mesaj WhatsApp'ta hazır açılır, gönderme sizde (önerilen başlangıç)</option>
          <option value="cloud_api">WhatsApp Business Platform (resmî Cloud API)</option>
        </select>
      </Field>
      {f.mode === 'click_to_chat' ? (
        <Callout>Bu modda uygulama mesajı WhatsApp'ın resmî "tıkla-sohbet" bağlantısıyla açar; gönder tuşuna siz basarsınız. Hesap kısıtlama riski yoktur, ancak teslim/okunma bilgisi alınamaz. WhatsApp Web otomasyonu kullanılmaz.</Callout>
      ) : (
        <>
          <Callout tone="warn">Resmî API ile ilk temas yalnızca Meta tarafından <b>onaylanmış bir şablonla</b> yapılabilir; serbest metin taslaklar ancak müşteri size yazdıktan sonraki 24 saat içinde gönderilebilir. Teslim/okunma durumu ve gelen mesajlar webhook gerektirir (herkese açık bir sunucu); bu masaüstü sürümünde webhook alıcısı yoktur.</Callout>
          <div className="grid g2">
            <Field label="Telefon numarası kimliği (Phone number ID)"><input className="input" value={f.phoneNumberId} onChange={(e) => setF({ ...f, phoneNumberId: e.target.value })} /></Field>
            <Field label="WhatsApp Business hesap kimliği (WABA ID)" hint="Şablon onayını kontrol etmek için"><input className="input" value={f.wabaId} onChange={(e) => setF({ ...f, wabaId: e.target.value })} /></Field>
            <Field label="Onaylı şablon adı"><input className="input" value={f.templateName} onChange={(e) => setF({ ...f, templateName: e.target.value })} placeholder="ornek_tanisma" /></Field>
            <Field label="Şablon dili"><input className="input" value={f.templateLang} onChange={(e) => setF({ ...f, templateLang: e.target.value })} /></Field>
            <Field label="Şablon gövde değişkenleri" hint="Virgülle ayırın; {sirket} şirket adıyla değiştirilir"><input className="input" value={f.templateParams} onChange={(e) => setF({ ...f, templateParams: e.target.value })} /></Field>
            <Field label={data?.hasToken ? 'Kalıcı erişim anahtarı (kayıtlı)' : 'Kalıcı erişim anahtarı (System User token)'}><input className="input" type="password" value={f.token} onChange={(e) => setF({ ...f, token: e.target.value })} placeholder={data?.hasToken ? 'Değiştirmek için girin' : ''} autoComplete="off" /></Field>
          </div>
        </>
      )}
      <Field label="Günlük gönderim sınırı" hint="Meta'nın hesabınıza tanıdığı mesajlaşma limitinin altında tutun"><input className="input" type="number" style={{ maxWidth: 180 }} value={f.dailyLimit} onChange={(e) => setF({ ...f, dailyLimit: Number(e.target.value) })} /></Field>
      <div className="row"><Btn variant="primary" disabled={busy} onClick={save}>Kaydet</Btn><TestButton integration="whatsapp" /></div>
    </div>
  )
}
