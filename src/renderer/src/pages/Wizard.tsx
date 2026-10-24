// İlk kurulum sihirbazı. API anahtarı istemez: Google, Gmail ve WhatsApp bilgisayarınızdaki tarayıcı üzerinden,
// sizin giriş yaptığınız oturumlarla kullanılır. Her adım atlanabilir.

import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Play, LogIn, RefreshCw, Search, Mail, MessageCircle } from 'lucide-react'
import { call, useApi } from '../lib/api'
import { Badge, Btn, Callout, Field, useAction } from '../components/ui'
import { BrandForm, DataDirForm } from '../components/forms'
import { Robot } from '../robot/Robot'
import type { AppSettings } from '@shared/types'
import logoLight from '../assets/uca-medya-logo-light.svg'

const STEPS = ['Logo ve marka', 'Çıktı klasörü', 'Tarayıcı', 'Google, Gmail ve WhatsApp girişi', 'Bilgisayar izinleri', 'Mesaj gönderim tercihleri', 'Test', 'Hazır']
const TIPS = [
  'Merhaba! Ben Uca. Önce markanızı tanıyalım; logonuz raporlarda ve tekliflerde kullanılacak.',
  'Müşteri klasörleri, ekran görüntüleri ve raporlar bu klasörde düzenli tutulacak.',
  'Google, Gmail ve WhatsApp için API anahtarı gerekmez: bilgisayarınızdaki Chrome’u kullanacağım.',
  'Girişleri tarayıcı penceresinde siz yaparsınız; şifrenizi hiçbir zaman sormam ve saklamam.',
  'Tarayıcıyı Chrome’un kendi kontrol bağlantısıyla yönetiyorum; ekstra sistem izni gerekmez.',
  'Hiçbir mesaj sizin seçtiğiniz onay yöntemi olmadan gitmez. Başlangıçta test modu açıktır.',
  'Testler gerçek müşterilere hiçbir şey göndermez.',
  'Her şey hazır! "Yeni Müşteri Araştırması" ile başlayabilirsiniz.'
]

interface Sessions {
  google: boolean
  gmail: boolean
  gmailAccount: string | null
  whatsapp: boolean
}

export function Wizard({ settings: initial, onDone }: { settings: AppSettings; onDone: (s: AppSettings) => void }) {
  const [step, setStep] = useState(0)
  const [settings, setSettings] = useState(initial)
  const { data: browsers } = useApi<{ kind: 'chrome' | 'edge'; label: string }[]>('agent:browsers', undefined, [])
  const { data: info } = useApi<{ platform: string }>('app:info', undefined, [])
  const [agentOn, setAgentOn] = useState(false)
  const [sessions, setSessions] = useState<Sessions | null>(null)
  const [testOut, setTestOut] = useState<Record<string, { ok: boolean; text: string }>>({})
  const [testPhone, setTestPhone] = useState(initial.outreach.testRecipientPhone)
  const { run, busy } = useAction()
  useEffect(() => {
    call<{ running: boolean }>('agent:status').then((s) => setAgentOn(s.running)).catch(() => undefined)
    return window.api.on('agent', (p) => {
      const st = (p as { state: string }).state
      if (st === 'closed') setAgentOn(false)
      else if (st !== 'idle') setAgentOn(true)
    })
  }, [])
  const upd = async (patch: Record<string, unknown>) => setSettings(await call<AppSettings>('settings:update', patch))
  const finish = async () => {
    const s = await run(() => call<AppSettings>('settings:update', { setupCompleted: true }))
    if (s) onDone(s)
  }
  const startAgent = () => run(() => call('agent:start', { kind: settings.automation.browser }), 'Otomasyon tarayıcısı açıldı').then(() => setAgentOn(true))
  const check = () => run(() => call<Sessions>('agent:checkSessions')).then((s) => s && setSessions(s))
  const test = async (key: string, fn: () => Promise<string>) => {
    setTestOut((t) => ({ ...t, [key]: { ok: true, text: 'Çalışıyor…' } }))
    try {
      setTestOut((t) => ({ ...t, [key]: { ok: true, text: '' } }))
      const text = await fn()
      setTestOut((t) => ({ ...t, [key]: { ok: true, text } }))
    } catch (e) {
      setTestOut((t) => ({ ...t, [key]: { ok: false, text: (e as Error).message } }))
    }
  }
  const o = settings.outreach

  return (
    <div className="wizard">
      <aside>
        <img src={logoLight} alt="UcaMedya" style={{ width: 140 }} />
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600 }}>Kurulum</div>
          <div style={{ color: '#9a9aa3', fontSize: 13 }}>API anahtarı gerekmez. Her adımı sonra değiştirebilirsiniz.</div>
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
              {!browsers?.length ? <Callout tone="danger">Google Chrome veya Microsoft Edge bulunamadı. Lütfen birini kurup uygulamayı yeniden açın.</Callout> : (
                <Field label="Araştırma ve gönderim için kullanılacak tarayıcı">
                  <select className="select" value={settings.automation.browser} onChange={(e) => upd({ automation: { ...settings.automation, browser: e.target.value } })}>
                    {browsers.map((b) => <option key={b.kind} value={b.kind}>{b.label}</option>)}
                  </select>
                </Field>
              )}
              <Callout>
                Uygulama, seçtiğiniz tarayıcıyı <b>size ait ayrı bir otomasyon profiliyle</b> açar. Asıl Chrome profilinize, kayıtlı şifrelerinize ve kartlarınıza erişmez. Chrome güvenlik nedeniyle ana profilin dışarıdan yönetilmesine izin vermediği için bu yöntem gereklidir; Google, Gmail ve WhatsApp girişlerini bu profilde bir kez yaparsınız.
              </Callout>
              <div className="row">
                <Btn variant="primary" icon={<Play />} disabled={busy || !browsers?.length || agentOn} onClick={startAgent}>{agentOn ? 'Tarayıcı açık' : 'Tarayıcıyı aç'}</Btn>
                {agentOn && <Badge tone="success" dot>Açık</Badge>}
              </div>
            </div>
          )}
          {step === 3 && (
            <div className="col" style={{ gap: 14 }}>
              {!agentOn && <Callout tone="warn">Önce önceki adımda tarayıcıyı açın. <Btn size="sm" onClick={startAgent}>Şimdi aç</Btn></Callout>}
              {([
                ['google', 'Google hesabı', 'Gmail ile aynı hesap. Arama için giriş zorunlu değildir.', sessions?.google],
                ['gmail', 'Gmail', sessions?.gmailAccount ? `Hesap: ${sessions.gmailAccount}` : 'E-postalar bu hesaptan tarayıcı üzerinden hazırlanır.', sessions?.gmail],
                ['whatsapp', 'WhatsApp Web', 'Telefonunuzda WhatsApp → Ayarlar → Bağlı cihazlar → Cihaz bağla ile QR kodu taratın.', sessions?.whatsapp]
              ] as const).map(([k, l, d, ok]) => (
                <div key={k} className="card pad row">
                  <div style={{ flex: 1 }}>
                    <b>{l}</b> {ok != null && <Badge tone={ok ? 'success' : 'warning'} dot>{ok ? 'Oturum açık' : 'Oturum kapalı'}</Badge>}
                    <div className="small muted">{d}</div>
                  </div>
                  <Btn icon={<LogIn />} disabled={!agentOn} onClick={() => run(() => call('agent:openLogin', { service: k }))}>Giriş sayfasını aç</Btn>
                </div>
              ))}
              <div className="row">
                <Btn variant="primary" icon={<RefreshCw />} disabled={!agentOn || busy} onClick={check}>{busy ? 'Kontrol ediliyor…' : 'Oturumları kontrol et'}</Btn>
                <span className="small muted">Girişleri yaptıktan sonra kontrol edin. Şifreniz uygulamaya girilmez.</span>
              </div>
            </div>
          )}
          {step === 4 && (
            <div className="col" style={{ gap: 14 }}>
              <Callout tone="brand">
                <b>Ek izin gerekmez.</b> Uygulama tarayıcıyı fare ve klavyeyi ele geçirerek değil, Chrome/Edge'in kendi kontrol bağlantısı üzerinden yönetir. Bu nedenle {info?.platform === 'darwin' ? 'macOS’ta Erişilebilirlik veya Ekran Kaydı izni' : 'Windows’ta yönetici yetkisi veya özel bir izin'} istenmez. Tarayıcı işlem yaparken pencereyi kullanabilirsiniz ancak aynı sekmelerde değişiklik yapmamanız önerilir.
              </Callout>
              <Callout>
                Tarayıcı dışındaki masaüstü uygulamalarını fare/klavye ile yönetme özelliği (ekran okuma, pencere seçme) bu sürümde yoktur; Google, Gmail ve WhatsApp için gerekmediği için eklenmedi. Klasör açma ve dosya kaydetme işletim sisteminin kendi araçlarıyla yapılır.
              </Callout>
            </div>
          )}
          {step === 5 && (
            <div className="col" style={{ gap: 14 }}>
              <Field label="Gönderim yöntemi">
                <div className="col" style={{ gap: 8 }}>
                  {([
                    ['draft', 'Taslak', 'Mesajlar Gmail taslaklarına / WhatsApp sohbetine yazılır, gönderilmez. Gönderme tuşuna siz basarsınız.'],
                    ['confirm', 'Onaylı gönderim (önerilen)', 'Her mesaj tarayıcıda hazırlanır, uygulamada önizlemesi gösterilir; siz "Gönder" deyince gönderilir.'],
                    ['queue', 'Onaylanmış kuyruk', 'Önceden onayladığınız mesajlar sırayla gönderilir. Alıcı doğrulanamazsa, hata veya beklenmeyen ekran olursa kuyruk durur.']
                  ] as const).map(([k, l, d]) => (
                    <label key={k} className="check card pad" style={{ borderColor: o.sendMode === k ? 'var(--brand)' : undefined }}>
                      <input type="radio" name="mode" checked={o.sendMode === k} onChange={() => upd({ outreach: { ...o, sendMode: k } })} />
                      <div><b>{l}</b><div className="small muted">{d}</div></div>
                    </label>
                  ))}
                </div>
              </Field>
              {o.sendMode === 'queue' && <Callout tone="warn">WhatsApp, resmî olmayan otomasyonu kullanım koşullarına aykırı sayabilir ve hesabı kısıtlayabilir. Kuyruk modunda günlük sınırı düşük tutun; uygulama spam kontrollerini atlatmaya çalışmaz.</Callout>}
              <div className="grid g2">
                <Field label="Günlük e-posta sınırı"><input className="input" type="number" min={1} max={500} value={o.webDailyLimitEmail} onChange={(e) => setSettings({ ...settings, outreach: { ...o, webDailyLimitEmail: Number(e.target.value) || 1 } })} onBlur={() => upd({ outreach: settings.outreach })} /></Field>
                <Field label="Günlük WhatsApp sınırı"><input className="input" type="number" min={1} max={200} value={o.webDailyLimitWhatsapp} onChange={(e) => setSettings({ ...settings, outreach: { ...o, webDailyLimitWhatsapp: Number(e.target.value) || 1 } })} onBlur={() => upd({ outreach: settings.outreach })} /></Field>
              </div>
              <label className="check"><input type="checkbox" checked={o.testMode} onChange={(e) => upd({ outreach: { ...o, testMode: e.target.checked } })} /><div><b>Test modu</b><div className="small muted">Açıkken tüm gönderimler aşağıdaki test alıcılarına gider; hiçbir şirkete mesaj gitmez.</div></div></label>
              <div className="grid g2">
                <Field label="Test e-posta adresi"><input className="input" value={o.testRecipientEmail} onChange={(e) => setSettings({ ...settings, outreach: { ...o, testRecipientEmail: e.target.value } })} onBlur={() => upd({ outreach: settings.outreach })} /></Field>
                <Field label="Test WhatsApp numarası"><input className="input" value={o.testRecipientPhone} onChange={(e) => setSettings({ ...settings, outreach: { ...o, testRecipientPhone: e.target.value } })} onBlur={() => upd({ outreach: settings.outreach })} placeholder="05xx xxx xx xx" /></Field>
              </div>
              <label className="check"><input type="checkbox" checked={o.includeOptOutLine} onChange={(e) => upd({ outreach: { ...o, includeOptOutLine: e.target.checked } })} /><div><b>Her mesaja "istemiyorsanız yanıtlayın" satırı ekle</b><div className="small muted">Ticari elektronik ileti kurallarına uyum için önerilir.</div></div></label>
              <Callout tone="warn">Şirketlerin yayımladığı iletişim bilgileri her türlü pazarlama iletişimine izin verildiği anlamına gelmez. Uygulama ret listesi, onay ve tekrar gönderim kontrollerini uygular; 6563 sayılı Kanun, İYS ve KVKK açısından hukuki uygunluğu garanti etmez.</Callout>
            </div>
          )}
          {step === 6 && (
            <div className="col" style={{ gap: 14 }}>
              {!agentOn && <Callout tone="warn">Testler için tarayıcı açık olmalı. <Btn size="sm" onClick={startAgent}>Tarayıcıyı aç</Btn></Callout>}
              <div className="card pad col">
                <b>1. Test araması</b>
                <div className="small muted">Google'da "mimarlık ofisi Kocaeli" aranır ve bulunan şirketler listelenir (kaydedilmez).</div>
                <div><Btn icon={<Search />} disabled={!agentOn} onClick={() => test('search', async () => { const r = await call<{ name: string }[]>('agent:testSearch', { query: 'mimarlık ofisi Kocaeli' }); return `${r.length} şirket bulundu: ${r.slice(0, 4).map((x) => x.name).join(', ')}…` })}>Test araması yap</Btn></div>
                {testOut.search?.text && <Callout tone={testOut.search.ok ? 'brand' : 'danger'}>{testOut.search.text}</Callout>}
              </div>
              <div className="card pad col">
                <b>2. Test Gmail taslağı</b>
                <div className="small muted">Kendi Gmail adresinize bir taslak oluşturulur ve gönderilmeden Taslaklar'a kaydedilir.</div>
                <div><Btn icon={<Mail />} disabled={!agentOn} onClick={() => test('gmail', async () => (await call<{ message: string }>('agent:testGmailDraft', {})).message)}>Test taslağı oluştur</Btn></div>
                {testOut.gmail?.text && <Callout tone={testOut.gmail.ok ? 'brand' : 'danger'}>{testOut.gmail.text}</Callout>}
              </div>
              <div className="card pad col">
                <b>3. Test WhatsApp sohbeti</b>
                <div className="small muted">Girdiğiniz numarayla sohbet açılır, test metni yazılıp silinir; mesaj gönderilmez. Kendi numaranızı girin.</div>
                <div className="row"><input className="input" style={{ maxWidth: 240 }} value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="05xx xxx xx xx" /><Btn icon={<MessageCircle />} disabled={!agentOn} onClick={() => test('wa', async () => (await call<{ message: string }>('agent:testWhatsapp', { phone: testPhone })).message)}>Sohbeti aç</Btn></div>
                {testOut.wa?.text && <Callout tone={testOut.wa.ok ? 'brand' : 'danger'}>{testOut.wa.text}</Callout>}
              </div>
            </div>
          )}
          {step === 7 && (
            <div className="col" style={{ gap: 14 }}>
              <p className="muted">Kurulum tamamlandı. Atladığınız adımları <b>Canlı Kontrol Merkezi</b> ve <b>Ayarlar</b>'dan istediğiniz zaman yapabilirsiniz.</p>
              <Callout tone="brand">Önerilen ilk adım: <b>Yeni Müşteri Araştırması</b> → sektör ve şehir seçip 10 şirketlik küçük bir araştırma başlatın; ilerlemeyi Canlı Kontrol Merkezi'nden izleyin.</Callout>
              <Callout>Yapay zekâ isteğe bağlıdır: mesaj taslakları analiz bulgularına göre hazır şablonlarla yazılır. Daha doğal metinler için Ayarlar &gt; Entegrasyonlar'dan bilgisayarınızda çalışan yerel bir model (Ollama) veya bir API ekleyebilirsiniz.</Callout>
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
