// İlk kurulum sihirbazı. Her adım atlanabilir; atlanan entegrasyonlar uygulamanın diğer bölümlerini engellemez.

import { useState } from 'react'
import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
import { call, useApi } from '../lib/api'
import { Btn, Callout, Field, useAction } from '../components/ui'
import { BrandForm, DataDirForm, EmailAccountForm, SecretField, TestButton, WhatsAppForm } from '../components/forms'
import { Robot } from '../robot/Robot'
import type { AppSettings } from '@shared/types'
import logoLight from '../assets/uca-medya-logo-light.svg'

const STEPS = ['Marka ve logo', 'Veri klasörü', 'Yapay zekâ', 'Arama ve analiz', 'E-posta', 'WhatsApp', 'Güvenlik ve iletişim kuralları', 'Hazır']
const TIPS = [
  'Merhaba! Ben Uca. Önce markanızı tanıyalım; logonuz raporlarda ve tekliflerde kullanılacak.',
  'Müşteri klasörleri, ekran görüntüleri ve raporlar bu klasörde düzenli tutulacak.',
  'Yapay zekâ, analiz bulgularından kişiselleştirilmiş mesajlar yazar. Anahtar olmadan da şablonlarla çalışırım.',
  'Şirket keşfi için resmî bir arama API’si gerekir. PageSpeed anahtarı Core Web Vitals ölçümü sağlar.',
  'E-posta hesabınızı bağlarsanız onayladığınız mesajları gönderip yanıtları takip edebilirim.',
  'WhatsApp için hesabınızı riske atmayan yöntemleri kullanıyorum.',
  'Test modu açıkken hiçbir gerçek şirkete mesaj gitmez. Hazır olduğunuzda kapatabilirsiniz.',
  'Her şey hazır! İlk araştırmanızı başlatabilirsiniz.'
]

export function Wizard({ settings: initial, onDone }: { settings: AppSettings; onDone: (s: AppSettings) => void }) {
  const [step, setStep] = useState(0)
  const [settings, setSettings] = useState(initial)
  const { data: secrets, reload: reloadSecrets } = useApi<Record<string, boolean>>('secrets:status')
  const { data: info } = useApi<{ safeStorage: boolean }>('app:info')
  const { run } = useAction()
  const upd = async (patch: Record<string, unknown>) => {
    const s = await call<AppSettings>('settings:update', patch)
    setSettings(s)
  }
  const finish = async () => {
    const s = await run(() => call<AppSettings>('settings:update', { setupCompleted: true }))
    if (s) onDone(s)
  }
  return (
    <div className="wizard">
      <aside>
        <img src={logoLight} alt="UcaMedya" style={{ width: 140 }} />
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600 }}>Kurulum sihirbazı</div>
          <div style={{ color: '#9a9aa3', fontSize: 13 }}>Birkaç dakikada hazırsınız. Her adımı sonra Ayarlar'dan değiştirebilirsiniz.</div>
        </div>
        <div className="steps">
          {STEPS.map((s, i) => (
            <button key={s} className={`step ${i === step ? 'on' : i < step ? 'done' : ''}`} style={{ border: 0, background: i === step ? undefined : 'transparent', cursor: 'pointer', textAlign: 'left', font: 'inherit' }} onClick={() => setStep(i)}>
              <i>{i < step ? <Check size={12} /> : i + 1}</i>
              {s}
            </button>
          ))}
        </div>
        <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'flex-end', gap: 6 }}>
          <Robot mood={step === 0 ? 'wave' : step === STEPS.length - 1 ? 'success' : 'idle'} size={130} />
          <div style={{ background: '#1d1d21', borderRadius: 14, padding: '10px 12px', fontSize: 12.5, color: '#d6d6db', marginBottom: 24 }}>{TIPS[step]}</div>
        </div>
      </aside>
      <main>
        <div className="inner">
          <div className="muted small">Adım {step + 1} / {STEPS.length}</div>
          <h1 style={{ margin: '6px 0 18px' }}>{STEPS[step]}</h1>

          {step === 0 && <BrandForm settings={settings} onChange={setSettings} />}
          {step === 1 && <DataDirForm settings={settings} onChange={setSettings} />}
          {step === 2 && (
            <div className="col" style={{ gap: 14 }}>
              {info && !info.safeStorage && <Callout tone="danger">İşletim sisteminin güvenli sır saklama özelliği kullanılamıyor; API anahtarları kaydedilemez.</Callout>}
              <Field label="Sağlayıcı">
                <select className="select" value={settings.ai.provider} onChange={(e) => upd({ ai: { ...settings.ai, provider: e.target.value } })}>
                  <option value="anthropic">Anthropic Claude (önerilen)</option>
                  <option value="openai">OpenAI</option>
                  <option value="none">Kullanma (yalnızca şablonlar)</option>
                </select>
              </Field>
              {settings.ai.provider === 'anthropic' && <SecretField name="anthropic_key" label="Anthropic API anahtarı" status={secrets} onSaved={reloadSecrets} hint="console.anthropic.com > API Keys" />}
              {settings.ai.provider === 'openai' && <SecretField name="openai_key" label="OpenAI API anahtarı" status={secrets} onSaved={reloadSecrets} />}
              {settings.ai.provider !== 'none' && <TestButton integration="ai" />}
            </div>
          )}
          {step === 3 && (
            <div className="col" style={{ gap: 14 }}>
              <Field label="Şirket keşfi için arama sağlayıcısı">
                <select className="select" value={settings.search.provider} onChange={(e) => upd({ search: { ...settings.search, provider: e.target.value } })}>
                  <option value="google_places">Google Places API (önerilen — işletme adı, adres, site, telefon)</option>
                  <option value="serpapi">SerpAPI (Google Haritalar sonuçları)</option>
                  <option value="brave">Brave Search API (genel web araması)</option>
                </select>
              </Field>
              {settings.search.provider === 'google_places' && <SecretField name="google_places_key" label="Google Maps Platform API anahtarı" status={secrets} onSaved={reloadSecrets} hint="Google Cloud Console'da 'Places API (New)' etkin olmalı ve faturalandırma tanımlı olmalı." />}
              {settings.search.provider === 'serpapi' && <SecretField name="serpapi_key" label="SerpAPI anahtarı" status={secrets} onSaved={reloadSecrets} />}
              {settings.search.provider === 'brave' && <SecretField name="brave_key" label="Brave Search API anahtarı" status={secrets} onSaved={reloadSecrets} />}
              <TestButton integration={settings.search.provider} />
              <hr className="sep" />
              <SecretField name="pagespeed_key" label="Google PageSpeed Insights API anahtarı" status={secrets} onSaved={reloadSecrets} hint="Core Web Vitals ve Lighthouse ölçümleri için. Yoksa bu ölçümler raporda 'yapılamadı' olarak görünür; tahmin üretilmez." />
              <Callout>Arama anahtarınız yoksa da başlayabilirsiniz: AI Müşteri Bulucu ekranında "CSV içe aktar" ile kendi şirket listenizi yükleyip analiz edebilirsiniz.</Callout>
            </div>
          )}
          {step === 4 && <EmailAccountForm />}
          {step === 5 && <WhatsAppForm />}
          {step === 6 && (
            <div className="col" style={{ gap: 14 }}>
              <label className="check">
                <input type="checkbox" checked={settings.outreach.testMode} onChange={(e) => upd({ outreach: { ...settings.outreach, testMode: e.target.checked } })} />
                <div><b>Test modu</b><div className="small muted">Açıkken tüm gönderimler aşağıdaki test alıcısına yönlendirilir; hiçbir şirkete mesaj gitmez.</div></div>
              </label>
              <div className="grid g2">
                <Field label="Test e-posta adresi"><input className="input" value={settings.outreach.testRecipientEmail} onChange={(e) => setSettings({ ...settings, outreach: { ...settings.outreach, testRecipientEmail: e.target.value } })} onBlur={() => upd({ outreach: settings.outreach })} /></Field>
                <Field label="Test WhatsApp numarası"><input className="input" value={settings.outreach.testRecipientPhone} onChange={(e) => setSettings({ ...settings, outreach: { ...settings.outreach, testRecipientPhone: e.target.value } })} onBlur={() => upd({ outreach: settings.outreach })} placeholder="05xx xxx xx xx" /></Field>
              </div>
              <label className="check">
                <input type="checkbox" checked={settings.outreach.includeOptOutLine} onChange={(e) => upd({ outreach: { ...settings.outreach, includeOptOutLine: e.target.checked } })} />
                <div><b>Her mesaja ret (iletişim istemiyorum) bilgisi ekle</b><div className="small muted">Ticari elektronik ileti kurallarına uyum için önerilir.</div></div>
              </label>
              <Callout tone="warn">
                Şirketlerin yayımladığı iletişim bilgileri her türlü pazarlama iletişimine izin verildiği anlamına gelmez. Uygulama ret listesi, onay ve tekrar gönderim kontrollerini uygular; ancak 6563 sayılı Kanun, İYS ve KVKK açısından hukuki uygunluğu garanti etmez. Toplu gönderimden önce hukuki danışmanlık almanızı öneririz.
              </Callout>
              <AppLockSetup />
            </div>
          )}
          {step === 7 && (
            <div className="col" style={{ gap: 14 }}>
              <p className="muted">Kurulum tamamlandı. Atladığınız entegrasyonları <b>Entegrasyonlar</b> sayfasından istediğiniz zaman ekleyebilirsiniz.</p>
              <Callout tone="brand">Önerilen ilk adım: <b>AI Müşteri Bulucu</b> → sektör ve şehir seçip 10 şirketlik küçük bir araştırma başlatın.</Callout>
            </div>
          )}

          <div className="row" style={{ marginTop: 32 }}>
            {step > 0 && <Btn icon={<ArrowLeft />} onClick={() => setStep(step - 1)}>Geri</Btn>}
            <div className="spacer" />
            {step < STEPS.length - 1 && <Btn variant="ghost" onClick={() => setStep(step + 1)}>Bu adımı atla</Btn>}
            {step < STEPS.length - 1 ? (
              <Btn variant="primary" onClick={() => setStep(step + 1)}>Devam <ArrowRight size={16} /></Btn>
            ) : (
              <Btn variant="primary" onClick={finish}>Uygulamaya geç</Btn>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

export function AppLockSetup() {
  const { data, reload } = useApi<{ enabled: boolean }>('lock:status')
  const [pw, setPw] = useState('')
  const { run } = useAction()
  return (
    <Field label="Uygulama kilidi (isteğe bağlı)" hint="Açılışta parola sorulur. Parola scrypt ile özetlenir, düz metin saklanmaz.">
      <div className="row">
        <input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder={data?.enabled ? 'Kilit açık — yeni parola girerek değiştirin' : 'En az 6 karakter'} autoComplete="new-password" />
        <Btn disabled={pw.length < 6} onClick={() => run(() => call('lock:set', { password: pw }), 'Uygulama kilidi ayarlandı').then(() => (setPw(''), reload()))}>Kilidi ayarla</Btn>
        {data?.enabled && <Btn variant="ghost" onClick={() => run(() => call('lock:set', { password: null }), 'Kilit kaldırıldı').then(reload)}>Kaldır</Btn>}
      </div>
    </Field>
  )
}
