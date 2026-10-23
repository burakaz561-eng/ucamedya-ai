// Entegrasyon Merkezi: her servis için durum, son kontrol, gerekli izinler, eksik ayarlar, test, bağlantıyı kes, hata ayrıntısı.

import { useState } from 'react'
import { Search, Gauge, Globe, Brain, MessageCircle, Mail, Database, Cloud, Unplug, Settings2 } from 'lucide-react'
import { call, useApi } from '../lib/api'
import { useNav } from '../lib/nav'
import { Badge, Btn, Callout, Card, Field, Modal, useAction, useConfirm } from '../components/ui'
import { SecretField, TestButton } from '../components/forms'
import { fmtRel } from '../lib/format'
import type { PageProps } from '../lib/page'
import type { AppSettings } from '@shared/types'

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Def {
  key: string
  name: string
  icon: typeof Search
  desc: string
  perms: string
  secrets?: { name: string; label: string; hint?: string }[]
  configured: (s: Record<string, boolean>, x: any) => string[]
  page?: 'email' | 'whatsapp'
  notTestable?: string
}

const DEFS: Def[] = [
  { key: 'google_places', name: 'Google Places API (New)', icon: Search, desc: 'Sektör ve konuma göre işletme keşfi: ad, adres, web sitesi, telefon, işletme durumu.', perms: 'Google Cloud projesinde "Places API (New)" etkin, faturalandırma tanımlı API anahtarı.', secrets: [{ name: 'google_places_key', label: 'API anahtarı' }], configured: (s) => (s.google_places_key ? [] : ['API anahtarı']) },
  { key: 'serpapi', name: 'SerpAPI', icon: Search, desc: 'Google Haritalar sonuçlarına yetkili aracı üzerinden erişim (alternatif sağlayıcı).', perms: 'serpapi.com hesabı ve API anahtarı.', secrets: [{ name: 'serpapi_key', label: 'API anahtarı' }], configured: (s) => (s.serpapi_key ? [] : ['API anahtarı']) },
  { key: 'brave', name: 'Brave Search API', icon: Search, desc: 'Genel web araması ile resmî siteleri bulma (işletme bilgisi daha zayıf).', perms: 'api.search.brave.com aboneliği.', secrets: [{ name: 'brave_key', label: 'Abonelik anahtarı' }], configured: (s) => (s.brave_key ? [] : ['Abonelik anahtarı']) },
  { key: 'pagespeed', name: 'Google PageSpeed Insights', icon: Gauge, desc: 'Lighthouse puanları ve Core Web Vitals (LCP, CLS, INP).', perms: 'Google Cloud projesinde "PageSpeed Insights API" etkin API anahtarı (ücretsiz kota).', secrets: [{ name: 'pagespeed_key', label: 'API anahtarı' }], configured: (s) => (s.pagespeed_key ? [] : ['API anahtarı']) },
  { key: 'browser', name: 'Tarayıcı motoru (Lighthouse benzeri yerel ölçüm)', icon: Globe, desc: 'Masaüstü/mobil görünüm, ekran görüntüleri ve sayfa içi ölçümler için yüklü Microsoft Edge veya Google Chrome.', perms: 'Edge veya Chrome kurulu olmalı. Ek indirme yapılmaz.', configured: () => [] },
  { key: 'ai', name: 'Yapay zekâ sağlayıcısı', icon: Brain, desc: 'Kişiselleştirilmiş mesaj taslakları, yeniden yazma ve analiz özetleri.', perms: 'Anthropic veya OpenAI API anahtarı.', configured: (s, x) => (x.ai.provider === 'none' ? ['Sağlayıcı seçilmedi'] : x.ai.provider === 'openai' ? (s.openai_key ? [] : ['OpenAI anahtarı']) : s.anthropic_key ? [] : ['Anthropic anahtarı']) },
  { key: 'whatsapp', name: 'WhatsApp Business Platform', icon: MessageCircle, desc: 'Onaylı şablonlarla resmî gönderim veya manuel tıkla-gönder.', perms: 'Meta Business hesabı, doğrulanmış numara, Phone number ID, kalıcı erişim anahtarı, onaylı şablon.', configured: () => [], page: 'whatsapp' },
  { key: 'email', name: 'E-posta (SMTP/IMAP)', icon: Mail, desc: 'Gmail, Google Workspace, Outlook, Microsoft 365 veya kurumsal SMTP/IMAP.', perms: 'Uygulama şifresi veya SMTP AUTH izni.', configured: () => [], page: 'email' },
  { key: 'gmail_oauth', name: 'Gmail / Google Workspace (OAuth)', icon: Mail, desc: 'OAuth ile parolasız bağlantı.', perms: 'Google Cloud OAuth istemcisi ve doğrulama süreci.', configured: () => ['Bu sürümde geliştirilmedi'], notTestable: 'Henüz geliştirilmedi — uygulama şifresiyle SMTP/IMAP kullanın.' },
  { key: 'm365_oauth', name: 'Microsoft 365 (OAuth)', icon: Mail, desc: 'Microsoft Graph ile OAuth bağlantısı.', perms: 'Azure AD uygulama kaydı.', configured: () => ['Bu sürümde geliştirilmedi'], notTestable: 'Henüz geliştirilmedi — SMTP AUTH ile bağlanabilirsiniz.' },
  { key: 'crm', name: 'Harici CRM entegrasyonu', icon: Database, desc: 'HubSpot, Pipedrive vb. ile senkronizasyon (isteğe bağlı).', perms: '—', configured: () => ['Bu sürümde geliştirilmedi'], notTestable: 'Henüz geliştirilmedi. Excel/CSV dışa aktarma ile veri taşınabilir.' },
  { key: 'cloud_storage', name: 'Bulut depolama', icon: Cloud, desc: 'Raporların buluta yedeklenmesi (isteğe bağlı).', perms: '—', configured: () => ['Bu sürümde geliştirilmedi'], notTestable: 'Henüz geliştirilmedi. Veri klasörünü OneDrive/Google Drive senkron klasörü içinde seçerek kullanabilirsiniz.' }
]

const ST: Record<string, [string, string]> = { ok: ['Bağlı', 'success'], error: ['Hata', 'danger'], not_configured: ['Yapılandırılmadı', 'neutral'], disabled: ['Kapalı', 'neutral'] }

export default function Integrations({ settings, setSettings }: PageProps) {
  const { data: list, reload } = useApi<any[]>('integrations:list', undefined, ['integrations'])
  const { data: secrets, reload: rs } = useApi<Record<string, boolean>>('secrets:status', undefined, ['integrations'])
  const [open, setOpen] = useState<Def | null>(null)
  const { go } = useNav()
  const { run } = useAction()
  const { ask, node } = useConfirm()
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="page-head">
        <div>
          <h1>Entegrasyonlar</h1>
          <p>Anahtarlar işletim sisteminin güvenli kasasında (Windows DPAPI / macOS Anahtar Zinciri) şifreli saklanır; kaynak koda veya günlüklere yazılmaz. Bir entegrasyon çalışmazsa diğer modüller çalışmaya devam eder.</p>
        </div>
      </div>
      <div className="grid g3">
        {DEFS.map((d) => {
          const row = list?.find((x) => x.key === d.key)
          const missing = secrets ? d.configured(secrets, settings) : []
          const st = row?.status ?? 'not_configured'
          const Ic = d.icon
          return (
            <div key={d.key} className="card pad col" style={{ gap: 10 }}>
              <div className="row">
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--brand-soft)', display: 'grid', placeItems: 'center' }}><Ic size={18} color="var(--brand)" /></div>
                <b style={{ flex: 1 }}>{d.name}</b>
                <Badge tone={ST[st]?.[1]} dot>{d.notTestable ? 'Geliştirilmedi' : ST[st]?.[0]}</Badge>
              </div>
              <div className="small muted">{d.desc}</div>
              <div className="tiny"><span className="muted">Gerekli izinler: </span>{d.perms}</div>
              {missing.length > 0 && !d.notTestable && <div className="tiny" style={{ color: 'var(--warning)' }}>Eksik: {missing.join(', ')}</div>}
              <div className="tiny muted">Son kontrol: {row?.last_check_at ? fmtRel(row.last_check_at) : 'hiç'}</div>
              {row?.last_error && <div className="tiny" style={{ color: 'var(--danger)' }}>{row.last_error}</div>}
              <div className="row wrap" style={{ marginTop: 'auto' }}>
                {d.notTestable ? <span className="tiny muted">{d.notTestable}</span> : (
                  <>
                    {d.page ? <Btn size="sm" icon={<Settings2 />} onClick={() => go(d.page!)}>Yapılandır</Btn> : <Btn size="sm" icon={<Settings2 />} onClick={() => setOpen(d)}>Yapılandır</Btn>}
                    <Btn size="sm" onClick={() => run(() => call<any>('integrations:test', { key: d.key }), (r) => r.message).then(reload)}>Test et</Btn>
                    {d.key !== 'browser' && st !== 'not_configured' && <Btn size="sm" variant="ghost" icon={<Unplug />} onClick={async () => (await ask('Bağlantı kesilsin mi?', 'Bu entegrasyona ait kayıtlı anahtarlar silinir.', { danger: true, confirm: 'Bağlantıyı kes' })) && run(() => call('integrations:disconnect', { key: d.key }), 'Bağlantı kesildi').then(() => (reload(), rs()))}>Kes</Btn>}
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
      {open && (
        <Modal title={open.name} sub={open.perms} onClose={() => (setOpen(null), reload())} size="wide">
          <div className="col" style={{ gap: 14 }}>
            {open.key === 'ai' ? <AiConfig settings={settings} setSettings={setSettings} secrets={secrets} onSaved={rs} /> : open.secrets?.map((s) => <SecretField key={s.name} name={s.name} label={s.label} hint={s.hint} status={secrets} onSaved={rs} />)}
            {open.key === 'browser' && <Callout>Ek ayar gerekmez. Test, yüklü Edge/Chrome'un başsız modda açılıp açılmadığını kontrol eder.</Callout>}
            {['google_places', 'serpapi', 'brave'].includes(open.key) && (
              <Field label="Varsayılan arama sağlayıcısı">
                <label className="check"><input type="radio" checked={settings.search.provider === open.key} onChange={() => run(() => call<AppSettings>('settings:update', { search: { ...settings.search, provider: open.key } }), 'Varsayılan sağlayıcı değişti').then((s) => s && setSettings(s))} />Bu sağlayıcıyı varsayılan yap</label>
              </Field>
            )}
            <TestButton integration={open.key} onDone={() => reload()} />
          </div>
        </Modal>
      )}
      {node}
    </div>
  )
}

function AiConfig({ settings, setSettings, secrets, onSaved }: { settings: AppSettings; setSettings: (s: AppSettings) => void; secrets: Record<string, boolean> | null; onSaved: () => void }) {
  const { run } = useAction()
  const upd = (ai: Partial<AppSettings['ai']>) => run(() => call<AppSettings>('settings:update', { ai: { ...settings.ai, ...ai } })).then((s) => s && setSettings(s))
  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="grid g2">
        <Field label="Sağlayıcı"><select className="select" value={settings.ai.provider} onChange={(e) => upd({ provider: e.target.value as AppSettings['ai']['provider'] })}><option value="anthropic">Anthropic Claude</option><option value="openai">OpenAI</option><option value="none">Kullanma</option></select></Field>
        {settings.ai.provider === 'anthropic' && (
          <Field label="Model" hint="Opus en yüksek kalite; Sonnet ve Haiku daha düşük maliyetlidir.">
            <select className="select" value={settings.ai.model} onChange={(e) => upd({ model: e.target.value })}>
              <option value="claude-opus-5-5">Claude Opus 5.5 (varsayılan)</option>
              <option value="claude-sonnet-5-5">Claude Sonnet 5.5</option>
              <option value="claude-haiku-5-5">Claude Haiku 5.5</option>
            </select>
          </Field>
        )}
        {settings.ai.provider === 'openai' && <Field label="Model"><input className="input" value={settings.ai.openaiModel} onChange={(e) => upd({ openaiModel: e.target.value })} /></Field>}
      </div>
      {settings.ai.provider === 'anthropic' && <SecretField name="anthropic_key" label="Anthropic API anahtarı" status={secrets} onSaved={onSaved} />}
      {settings.ai.provider === 'openai' && <SecretField name="openai_key" label="OpenAI API anahtarı" status={secrets} onSaved={onSaved} />}
      <label className="check"><input type="checkbox" checked={settings.ai.enabled} onChange={(e) => upd({ enabled: e.target.checked })} />Yapay zekâ özelliklerini kullan (kapalıyken şablonlar kullanılır)</label>
      <Callout>Yapay zekâya yalnızca şirket adı, sektör, şehir, web adresi ve analiz bulguları gönderilir. Kişisel veriler (bireysel e-posta/telefon) gönderilmez.</Callout>
    </div>
  )
}
