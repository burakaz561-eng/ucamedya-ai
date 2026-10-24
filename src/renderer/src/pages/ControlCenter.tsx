// Canlı Kontrol Merkezi: ajan tarayıcısı, oturumlar (Google / Gmail / WhatsApp Web), canlı önizleme, işlem akışı,
// kontrol düğmeleri ve kurulum testleri.

import { useEffect, useRef, useState } from 'react'
import { Play, Square, Pause, RotateCcw, ScrollText, FolderOpen, LogIn, RefreshCw, Search, Mail, MessageCircle, MonitorPlay, ShieldCheck } from 'lucide-react'
import { call, useApi, useJobEvents } from '../lib/api'
import { useNav } from '../lib/nav'
import { Badge, Btn, Callout, Card, Field, Progress, useAction } from '../components/ui'
import { RunLog } from './Research'
import { Robot } from '../robot/Robot'
import { JOB_TYPES, RUN_STATUS } from '../lib/format'
import type { PageProps } from '../lib/page'

/* eslint-disable @typescript-eslint/no-explicit-any */
interface AgentEv {
  state: string
  step?: string
  company?: string | null
  detail?: string
  at: string
}
interface Sessions {
  google: boolean
  gmail: boolean
  gmailAccount: string | null
  mailKind?: 'webmail' | 'gmail'
  whatsapp: boolean
  whatsappState: string
}

const STATE: Record<string, [string, string]> = {
  idle: ['Kapalı', 'neutral'], starting: ['Açılıyor', 'brand'], ready: ['Hazır', 'success'], busy: ['Çalışıyor', 'brand'],
  needs_user: ['Sizi bekliyor', 'warning'], closed: ['Kapalı', 'neutral'], error: ['Hata', 'danger']
}

export function useAgentEvents(cb: (e: AgentEv) => void) {
  const ref = useRef(cb)
  ref.current = cb
  useEffect(() => window.api.on('agent', (p) => ref.current(p as AgentEv)), [])
}

export default function ControlCenter({ settings, setSettings }: PageProps) {
  const { data: browsers } = useApi<{ kind: 'chrome' | 'edge'; label: string }[]>('agent:browsers', undefined, [])
  const { data: initial, reload: reloadStatus } = useApi<AgentEv & { running: boolean; kind: string | null; profileDir: string | null }>('agent:status', undefined, [])
  const { data: runs, reload: reloadRuns } = useApi<any[]>('jobs:list', { active: false }, ['jobs'])
  const [ev, setEv] = useState<AgentEv | null>(null)
  const lastState = useRef<string>('idle')
  const [feed, setFeed] = useState<AgentEv[]>([])
  const [running, setRunning] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [sessions, setSessions] = useState<Sessions | null>(null)
  const [log, setLog] = useState<number | null>(null)
  const [testOut, setTestOut] = useState<{ ok: boolean; text: string } | null>(null)
  const [query, setQuery] = useState('Kocaeli inşaat firmaları')
  const [testMail, setTestMail] = useState('')
  const [testPhone, setTestPhone] = useState(settings.outreach.testRecipientPhone)
  const [progress, setProgress] = useState<{ title: string; p: number; status: string } | null>(null)
  const { run, busy } = useAction()
  const { go } = useNav()

  useEffect(() => {
    if (initial) {
      setRunning(initial.running)
      setEv(initial)
    }
  }, [initial])
  useAgentEvents((e) => {
    setEv(e)
    lastState.current = e.state
    if (['ready', 'busy', 'needs_user', 'starting'].includes(e.state)) setRunning(true)
    if (e.state === 'closed') setRunning(false)
    if (e.step) setFeed((f) => [e, ...f].slice(0, 200))
  })
  useJobEvents((e) => {
    const r = runs?.find((x) => x.id === e.runId)
    setProgress({ title: r?.title ?? `${JOB_TYPES[e.type] ?? e.type} #${e.runId}`, p: e.progress, status: e.status })
    if (['completed', 'failed', 'cancelled'].includes(e.status)) reloadRuns()
  })
  // Canlı önizleme: tarayıcı açıkken birkaç saniyede bir son ekran görüntüsü
  useEffect(() => {
    if (!running) return
    let alive = true
    const tick = async () => {
      // Kullanıcı tarayıcıda giriş/doğrulama yaparken önizleme alınmaz
      if (!alive || document.hidden || lastState.current === 'needs_user') return
      const img = await call<string | null>('agent:preview').catch(() => null)
      if (alive && img) setPreview(img)
    }
    void tick()
    const t = setInterval(tick, Math.max(1, settings.automation.previewIntervalSec) * 1000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [running, settings.automation.previewIntervalSec])

  const active = runs?.find((r) => ['running', 'paused', 'queued'].includes(r.status))
  const lastFailed = runs?.find((r) => ['failed', 'interrupted'].includes(r.status))
  const st = STATE[ev?.state ?? 'idle'] ?? STATE.idle
  const check = () => run(() => call<Sessions>('agent:checkSessions')).then((s) => s && setSessions(s))
  const test = async (fn: () => Promise<string>) => {
    setTestOut(null)
    try {
      setTestOut({ ok: true, text: await fn() })
    } catch (e) {
      setTestOut({ ok: false, text: (e as Error).message })
    }
  }

  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="page-head">
        <div>
          <h1>Canlı Kontrol Merkezi</h1>
          <p>Uygulama; Google'da arama, Gmail ve WhatsApp Web işlemlerini bilgisayarınızdaki Chrome/Edge üzerinden, size ait ayrı bir otomasyon profilinde yapar. Burada ne yaptığını canlı izler ve kontrol edersiniz.</p>
        </div>
        <div className="actions">
          <Btn icon={<FolderOpen />} onClick={() => run(() => call('files:openRoot'))}>Çıktı klasörünü aç</Btn>
        </div>
      </div>

      {ev?.state === 'needs_user' && (
        <Callout tone="warn">
          <div className="row wrap">
            <b style={{ flex: 1 }}>{ev.step}</b>
            <Btn size="sm" variant="primary" onClick={() => call('agent:answer', { ok: true })}>Tamamladım</Btn>
            <Btn size="sm" onClick={() => call('agent:answer', { ok: false })}>Vazgeç</Btn>
          </div>
        </Callout>
      )}

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)', alignItems: 'start' }}>
        <div className="col" style={{ gap: 16 }}>
          <Card title={<span className="row"><MonitorPlay size={18} color="var(--brand)" /> Canlı görünüm</span>} actions={<Badge tone={st[1]} dot>{st[0]}</Badge>}>
            <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', background: 'var(--bg-sunken)', aspectRatio: '16 / 9', display: 'grid', placeItems: 'center', border: '1px solid var(--line)' }}>
              {running && preview ? <img src={preview} alt="Tarayıcı önizlemesi" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : (
                <div className="col" style={{ alignItems: 'center', gap: 6, padding: 20, textAlign: 'center' }}>
                  <Robot mood="idle" size={120} />
                  <div className="muted small">{running ? 'Önizleme bekleniyor…' : 'Otomasyon tarayıcısı kapalı. Başlattığınızda burada canlı görüntü gösterilir.'}</div>
                </div>
              )}
            </div>
            <div className="row wrap" style={{ marginTop: 12, gap: 8 }}>
              <select className="select" style={{ width: 180 }} value={settings.automation.browser} onChange={(e) => run(() => call('settings:update', { automation: { ...settings.automation, browser: e.target.value } })).then((s: any) => s && setSettings(s))} aria-label="Tarayıcı">
                {browsers?.map((b) => <option key={b.kind} value={b.kind}>{b.label}</option>)}
              </select>
              {!running ? (
                <Btn variant="primary" icon={<Play />} disabled={busy || !browsers?.length} onClick={() => run(() => call('agent:start', { kind: settings.automation.browser }), 'Tarayıcı başlatıldı').then(() => (setRunning(true), reloadStatus()))}>Tarayıcıyı başlat</Btn>
              ) : (
                <Btn icon={<Square />} onClick={() => run(() => call('agent:stop'), 'Tarayıcı kapatıldı').then(() => (setRunning(false), setPreview(null)))}>Tarayıcıyı kapat</Btn>
              )}
              <div className="spacer" />
              {ev?.step && <span className="small muted ellipsis" style={{ maxWidth: 380 }}>{ev.step}{ev.company ? ` — ${ev.company}` : ''}</span>}
            </div>
            {!browsers?.length && <Callout tone="danger">Google Chrome veya Microsoft Edge bulunamadı. Tarayıcı üzerinden çalışmak için birini kurun.</Callout>}
            <div className="tiny muted" style={{ marginTop: 8 }}>Profil klasörü: {initial?.profileDir ?? 'tarayıcı başlatılınca oluşturulur'} · Asıl Chrome profilinize ve kayıtlı şifrelerinize erişilmez.</div>
          </Card>

          <Card title="Çalışan işlem" actions={<Btn size="sm" variant="ghost" onClick={() => go('automations')}>Tüm görevler</Btn>}>
            {active ? (
              <div className="col" style={{ gap: 8 }}>
                <div className="row"><b style={{ flex: 1 }}>{active.title}</b><Badge tone={RUN_STATUS[active.status]?.[1]}>{RUN_STATUS[active.status]?.[0]}</Badge></div>
                <Progress value={progress && progress.title === active.title ? progress.p : active.progress} />
                <div className="row wrap">
                  {active.status === 'running' && <Btn size="sm" icon={<Pause />} onClick={() => run(() => call('jobs:pause', { id: active.id }), 'Duraklatıldı')}>Duraklat</Btn>}
                  {active.status === 'paused' && <Btn size="sm" icon={<Play />} onClick={() => run(() => call('jobs:resume', { id: active.id }), 'Devam ediyor')}>Devam ettir</Btn>}
                  <Btn size="sm" variant="danger" icon={<Square />} onClick={() => run(() => call('jobs:cancel', { id: active.id }), 'İptal edildi')}>İptal et</Btn>
                  <Btn size="sm" variant="ghost" icon={<ScrollText />} onClick={() => setLog(active.id)}>Günlükleri göster</Btn>
                </div>
              </div>
            ) : <div className="muted small">Şu an çalışan görev yok.</div>}
            <div className="row wrap" style={{ marginTop: 10 }}>
              <Btn size="sm" icon={<RotateCcw />} disabled={!lastFailed} onClick={() => lastFailed && run(() => call('jobs:resume', { id: lastFailed.id }), 'Son işlem yeniden deneniyor')}>Son işlemi tekrar dene{lastFailed ? ` (#${lastFailed.id})` : ''}</Btn>
              {lastFailed && <Btn size="sm" variant="ghost" icon={<ScrollText />} onClick={() => setLog(lastFailed.id)}>Hata günlüğü</Btn>}
              <Btn size="sm" variant="primary" icon={<Search />} onClick={() => go('finder', { new: 1 })}>Yeni müşteri araştırması</Btn>
            </div>
          </Card>

          <Card title="İşlem akışı">
            <div style={{ maxHeight: 320, overflow: 'auto' }}>
              {feed.length ? feed.map((f, i) => (
                <div key={i} className="list-item small" style={{ padding: '6px 0' }}>
                  <span className="tiny faint" style={{ width: 60 }}>{new Date(f.at).toLocaleTimeString('tr-TR')}</span>
                  <Badge tone={STATE[f.state]?.[1]}>{STATE[f.state]?.[0] ?? f.state}</Badge>
                  <span style={{ flex: 1 }}>{f.step}{f.company ? <b> — {f.company}</b> : null}{f.detail ? <span className="muted"> ({f.detail})</span> : null}</span>
                </div>
              )) : <div className="muted small">Bu oturumda henüz tarayıcı işlemi yapılmadı.</div>}
            </div>
          </Card>
        </div>

        <div className="col" style={{ gap: 16 }}>
          <Card title="Oturumlar" actions={<Btn size="sm" icon={<RefreshCw />} disabled={!running || busy} onClick={check}>Kontrol et</Btn>}>
            <div className="col" style={{ gap: 8 }}>
              {([
                ['google', 'Google hesabı', sessions?.google, 'Arama için giriş şart değildir; Gmail için gerekir.'],
                [settings.outreach.emailChannel === 'webmail' ? 'webmail' : 'gmail', settings.outreach.emailChannel === 'webmail' ? 'Webmail (Roundcube)' : 'Gmail', sessions?.gmail, sessions?.gmailAccount ?? (settings.outreach.emailChannel === 'webmail' ? settings.outreach.webmailUrl || 'Adres Ayarlar’da girilmeli' : null)],
                ['whatsapp', settings.outreach.whatsappChannel === 'desktop' ? 'WhatsApp Web (kullanılmıyor — masaüstü uygulaması seçili)' : 'WhatsApp Web', settings.outreach.whatsappChannel === 'desktop' ? null : sessions?.whatsapp, settings.outreach.whatsappChannel === 'desktop' ? 'Mesajlar bilgisayarınızdaki WhatsApp uygulamasında açılır; giriş gerekmez.' : sessions && !sessions.whatsapp ? 'QR kodu telefonunuzla taratın (Bağlı cihazlar → Cihaz bağla)' : null]
              ] as const).map(([k, label, ok, note]) => (
                <div key={k} className="list-item">
                  <Badge tone={ok == null ? 'neutral' : ok ? 'success' : 'warning'} dot>{ok == null ? 'Kontrol edilmedi' : ok ? 'Açık' : 'Kapalı'}</Badge>
                  <div style={{ flex: 1 }}><b>{label}</b>{note && <div className="tiny muted">{note}</div>}</div>
                  <Btn size="sm" icon={<LogIn />} disabled={!running} onClick={() => run(() => call('agent:openLogin', { service: k }))}>Giriş yap</Btn>
                </div>
              ))}
            </div>
            <div className="tiny muted" style={{ marginTop: 8 }}>Girişi tarayıcı penceresinde kendiniz yaparsınız; şifreniz uygulamaya girilmez ve saklanmaz. Oturum, otomasyon profilinde kalır.</div>
          </Card>

          <Card title={<span className="row"><ShieldCheck size={17} /> Kurulum testleri</span>}>
            <div className="col" style={{ gap: 12 }}>
              <Field label="Test araması (Google, tarayıcı üzerinden)">
                <div className="row"><input className="input" value={query} onChange={(e) => setQuery(e.target.value)} /><Btn icon={<Search />} disabled={busy || !running} onClick={() => test(async () => { const r = await call<any[]>('agent:testSearch', { query }); return `${r.length} şirket bulundu: ${r.slice(0, 5).map((h) => h.name).join(', ')}${r.length > 5 ? '…' : ''}` })}>Ara</Btn></div>
              </Field>
              <Field label={`Test e-posta taslağı — ${settings.outreach.emailChannel === 'webmail' ? 'Webmail' : 'Gmail'} (gönderilmez)`} hint="Boş bırakırsanız kendi adresinize taslak oluşturulur.">
                <div className="row"><input className="input" value={testMail} onChange={(e) => setTestMail(e.target.value)} placeholder="kendi adresiniz" /><Btn icon={<Mail />} disabled={busy || !running} onClick={() => test(async () => (await call<any>('agent:testGmailDraft', { to: testMail })).message)}>Taslak oluştur</Btn></div>
              </Field>
              <Field label="Test WhatsApp sohbeti (gönderilmez)" hint="Kendi numaranızı girin; sohbet açılır, test metni yazılıp silinir.">
                <div className="row"><input className="input" value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="05xx xxx xx xx" /><Btn icon={<MessageCircle />} disabled={busy || (!running && settings.outreach.whatsappChannel !== 'desktop')} onClick={() => test(async () => (await call<any>('agent:testWhatsapp', { phone: testPhone })).message)}>Sohbeti aç</Btn></div>
              </Field>
              {testOut && <Callout tone={testOut.ok ? 'brand' : 'danger'}>{testOut.text}</Callout>}
            </div>
          </Card>

          <Card title="Gönderim tercihleri" actions={<Btn size="sm" variant="ghost" onClick={() => go('settings', { tab: 'outreach' })}>Ayarlar</Btn>}>
            <div className="kv">
              <div>Gönderim modu</div><div><b>{settings.outreach.sendMode === 'draft' ? 'Taslak (gönderilmez)' : settings.outreach.sendMode === 'confirm' ? 'Her mesaj için onay' : 'Onaylanmış kuyruk'}</b></div>
              <div>E-posta</div><div>{settings.outreach.emailChannel === 'webmail' ? 'Webmail / Roundcube (tarayıcı)' : settings.outreach.emailChannel === 'gmail_web' ? 'Gmail (tarayıcı)' : 'SMTP hesabı'}</div>
              <div>WhatsApp</div><div>{settings.outreach.whatsappChannel === 'desktop' ? 'WhatsApp masaüstü uygulaması (gönderme sizde)' : settings.outreach.whatsappChannel === 'web' ? 'WhatsApp Web (tarayıcı)' : settings.outreach.whatsappChannel === 'cloud_api' ? 'Business API' : 'Manuel tıkla-gönder'}</div>
              <div>Günlük sınır</div><div>E-posta {settings.outreach.webDailyLimitEmail} · WhatsApp {settings.outreach.webDailyLimitWhatsapp}</div>
              <div>Test modu</div><div>{settings.outreach.testMode ? <Badge tone="warning">Açık — gerçek alıcıya gitmez</Badge> : <Badge tone="brand">Kapalı</Badge>}</div>
            </div>
          </Card>
        </div>
      </div>
      {log && <RunLog id={log} onClose={() => setLog(null)} />}
    </div>
  )
}
