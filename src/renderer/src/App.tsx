// Uygulama kabuğu: açılış → (kilit) → (kurulum sihirbazı) → ana panel.

import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react'
import {
  LayoutDashboard, Radar, Factory, ScanSearch, Users, MessagesSquare, Mail, MessageCircle, Sparkles, FileSignature, CalendarClock,
  BarChart3, FolderOpen, Plug, Workflow, KanbanSquare, Inbox, Settings as SettingsIcon, MonitorPlay, PanelLeftClose, PanelLeftOpen, Search, Bell, Moon, Sun, Lock
} from 'lucide-react'
import { call, useApi, useJobEvents } from './lib/api'
import { NavCtx, useNav, type PageKey, type Route } from './lib/nav'
import { Btn, Loading, ToastProvider, useToast } from './components/ui'
import { Robot, RobotPrefs } from './robot/Robot'
import { Splash } from './pages/Splash'
import { Wizard } from './pages/Wizard'
import { CompanyDrawer } from './pages/CompanyDrawer'
import { SendConfirm, AgentNeedsUser } from './components/SendConfirm'
import { AssistantLauncher } from './components/AssistantPanel'
import type { AppSettings } from '@shared/types'
import type { RobotMood } from './robot/robot-model'
import logoDark from './assets/uca-medya-logo-dark.svg'
import logoLight from './assets/uca-medya-logo-light.svg'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const ControlCenter = lazy(() => import('./pages/ControlCenter'))
const Finder = lazy(() => import('./pages/Finder'))
const Research = lazy(() => import('./pages/Research'))
const Analysis = lazy(() => import('./pages/Analysis'))
const Companies = lazy(() => import('./pages/Companies'))
const Communication = lazy(() => import('./pages/Communication'))
const EmailPage = lazy(() => import('./pages/EmailPage'))
const WhatsAppPage = lazy(() => import('./pages/WhatsAppPage'))
const Studio = lazy(() => import('./pages/Studio'))
const Offers = lazy(() => import('./pages/Offers'))
const FollowUp = lazy(() => import('./pages/FollowUp'))
const Pipeline = lazy(() => import('./pages/Pipeline'))
const Leads = lazy(() => import('./pages/Leads'))
const Reports = lazy(() => import('./pages/Reports'))
const Files = lazy(() => import('./pages/Files'))
const Integrations = lazy(() => import('./pages/Integrations'))
const Automations = lazy(() => import('./pages/Automations'))
const SettingsPage = lazy(() => import('./pages/Settings'))

export const NAV: { key: PageKey; label: string; icon: typeof Radar; group?: string }[] = [
  { key: 'dashboard', label: 'Genel Bakış', icon: LayoutDashboard, group: 'Merkez' },
  { key: 'control', label: 'Canlı Kontrol Merkezi', icon: MonitorPlay },
  { key: 'finder', label: 'AI Müşteri Bulucu', icon: Radar, group: 'Keşif' },
  { key: 'research', label: 'Sektör Araştırması', icon: Factory },
  { key: 'analysis', label: 'Web Sitesi Analizi', icon: ScanSearch },
  { key: 'companies', label: 'Müşteri Havuzu', icon: Users, group: 'Müşteriler' },
  { key: 'pipeline', label: 'Satış Panosu', icon: KanbanSquare },
  { key: 'leads', label: 'Web Sitesi Talepleri', icon: Inbox },
  { key: 'communication', label: 'İletişim Merkezi', icon: MessagesSquare, group: 'İletişim' },
  { key: 'email', label: 'E-posta Kampanyaları', icon: Mail },
  { key: 'whatsapp', label: 'WhatsApp İşlemleri', icon: MessageCircle },
  { key: 'studio', label: 'AI Mesaj Stüdyosu', icon: Sparkles },
  { key: 'offers', label: 'Teklif ve Satış', icon: FileSignature, group: 'Satış' },
  { key: 'followup', label: 'Takip Planlayıcısı', icon: CalendarClock },
  { key: 'reports', label: 'Raporlar ve Analitik', icon: BarChart3 },
  { key: 'files', label: 'Dosya Merkezi', icon: FolderOpen, group: 'Sistem' },
  { key: 'integrations', label: 'Entegrasyonlar', icon: Plug },
  { key: 'automations', label: 'Görevler ve Otomasyonlar', icon: Workflow },
  { key: 'settings', label: 'Uygulama Ayarları', icon: SettingsIcon }
]

type Phase = 'splash' | 'lock' | 'wizard' | 'app'

export default function App() {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [phase, setPhase] = useState<Phase>('splash')
  useEffect(() => {
    call<AppSettings>('settings:get').then(setSettings).catch(() => undefined)
  }, [])
  useEffect(() => {
    if (!settings) return
    const dark = settings.theme === 'dark' || (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  }, [settings])
  const afterSplash = useCallback(async () => {
    const lock = await call<{ enabled: boolean; unlocked: boolean }>('lock:status').catch(() => ({ enabled: false, unlocked: true }))
    if (lock.enabled && !lock.unlocked) return setPhase('lock')
    setPhase(settings?.setupCompleted ? 'app' : 'wizard')
  }, [settings])

  if (!settings) return <div className="splash" />
  const prefs = { animations: settings.robotAnimations, light: settings.lightMode }
  return (
    <RobotPrefs.Provider value={prefs}>
      <ToastProvider>
        {phase === 'splash' && <Splash full={settings.showIntro} onDone={afterSplash} />}
        {phase === 'lock' && <LockScreen onUnlock={() => setPhase(settings.setupCompleted ? 'app' : 'wizard')} />}
        {phase === 'wizard' && <Wizard settings={settings} onDone={(s) => (setSettings(s), setPhase('app'))} />}
        {phase === 'app' && <Shell settings={settings} setSettings={setSettings} onLock={() => call('lock:lock').then(() => setPhase('lock'))} />}
      </ToastProvider>
    </RobotPrefs.Provider>
  )
}

function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [pw, setPw] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const submit = async () => {
    try {
      const ok = await call<boolean>('lock:unlock', { password: pw })
      if (ok) onUnlock()
      else setErr('Parola hatalı')
    } catch (e) {
      setErr((e as Error).message)
    }
  }
  return (
    <div className="lock-screen">
      <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        <Robot mood={err ? 'warning' : 'idle'} size={180} />
        <img src={logoLight} alt="UcaMedya" style={{ width: 130 }} />
        <div style={{ color: '#aaa' }}>Uygulama kilitli</div>
        <form onSubmit={(e) => (e.preventDefault(), void submit())} className="row">
          <input className="input" type="password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Parola" style={{ width: 240, background: '#17171a', color: '#eee', borderColor: '#333' }} />
          <button className="btn primary" type="submit">Aç</button>
        </form>
        {err && <div style={{ color: '#ff8f85' }}>{err}</div>}
      </div>
    </div>
  )
}

function Shell({ settings, setSettings, onLock }: { settings: AppSettings; setSettings: (s: AppSettings) => void; onLock: () => void }) {
  const [route, setRoute] = useState<Route>({ page: 'dashboard' })
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebar') === '1')
  const [company, setCompany] = useState<number | null>(null)
  const go = useCallback((page: PageKey, params?: Record<string, unknown>) => setRoute({ page, params }), [])
  const nav = useMemo(() => ({ route, go, openCompany: (id: number) => setCompany(id) }), [route, go])
  const { data: dash } = useApi<{ draftsPending: number; reviewPending: number }>('dashboard:stats', undefined, ['drafts', 'research', 'analyses'])
  const toggleTheme = async () => {
    const isDark = document.documentElement.dataset.theme === 'dark'
    setSettings(await call<AppSettings>('settings:update', { theme: isDark ? 'light' : 'dark' }))
  }

  useEffect(() => {
    localStorage.setItem('sidebar', collapsed ? '1' : '0')
  }, [collapsed])

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        setCollapsed((c) => !c)
      }
      if (e.altKey && /^[1-9]$/.test(e.key)) {
        e.preventDefault()
        const item = NAV[Number(e.key) - 1]
        if (item) go(item.key)
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        go('finder', { new: Date.now() })
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [go])

  const Page = { dashboard: Dashboard, control: ControlCenter, finder: Finder, research: Research, analysis: Analysis, companies: Companies, communication: Communication, email: EmailPage, whatsapp: WhatsAppPage, studio: Studio, offers: Offers, followup: FollowUp, pipeline: Pipeline, leads: Leads, reports: Reports, files: Files, integrations: Integrations, automations: Automations, settings: SettingsPage }[route.page]
  const counts: Partial<Record<PageKey, number>> = { studio: dash?.draftsPending ?? 0, companies: dash?.reviewPending ?? 0 }
  const dark = settings.theme === 'dark' || (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  let lastGroup = ''
  return (
    <NavCtx.Provider value={nav}>
      <div className={`shell ${collapsed ? 'collapsed' : ''}`}>
        <aside className="sidebar">
          <div className="brand">
            <img src={dark ? logoLight : logoDark} alt="UcaMedya" style={collapsed ? { height: 18 } : undefined} />
            <span className="tag">AI</span>
          </div>
          <nav aria-label="Ana menü">
            {NAV.map((n, i) => {
              const head = n.group && n.group !== lastGroup ? n.group : null
              if (n.group) lastGroup = n.group
              const Ic = n.icon
              return (
                <div key={n.key}>
                  {head && <div className="nav-group">{head}</div>}
                  <button className={`nav-item ${route.page === n.key ? 'active' : ''}`} onClick={() => go(n.key)} title={`${n.label}${i < 9 ? ` (Alt+${i + 1})` : ''}`} aria-current={route.page === n.key ? 'page' : undefined}>
                    <Ic />
                    <span>{n.label}</span>
                    {!!counts[n.key] && <span className="count">{counts[n.key]}</span>}
                  </button>
                </div>
              )
            })}
          </nav>
          <div className="foot">
            <Btn variant="ghost" size="sm" icon={collapsed ? <PanelLeftOpen /> : <PanelLeftClose />} onClick={() => setCollapsed((c) => !c)} title="Menüyü daralt/genişlet (Ctrl+B)" aria-label="Menüyü daralt" />
          </div>
        </aside>
        <div className="main">
          <header className="topbar">
            <GlobalSearch />
            <div className="spacer" />
            <Notifications />
            <Btn variant="ghost" icon={dark ? <Sun /> : <Moon />} onClick={toggleTheme} title="Tema" aria-label="Temayı değiştir" />
            {settings.security.lockEnabled && <Btn variant="ghost" icon={<Lock />} onClick={onLock} title="Kilitle" aria-label="Uygulamayı kilitle" />}
            {settings.outreach.testMode && <span className="badge warning" title="Test modunda hiçbir şirkete mesaj gönderilmez">TEST MODU</span>}
          </header>
          <div className="content">
            <Suspense fallback={<Loading />}>
              <Page key={route.page + JSON.stringify(route.params ?? {})} params={route.params ?? {}} settings={settings} setSettings={setSettings} />
            </Suspense>
          </div>
        </div>
      </div>
      {company != null && <CompanyDrawer id={company} onClose={() => setCompany(null)} />}
      <RobotNotifier enabled={settings.robotAnimations} />
      <SendConfirm />
      <AssistantLauncher />
      <AgentNeedsUser />
    </NavCtx.Provider>
  )
}

function GlobalSearch() {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [sel, setSel] = useState(0)
  const ref = useRef<HTMLInputElement>(null)
  const { openCompany, go } = useNav()
  const { data } = useApi<{ rows: { id: number; name: string; city: string | null; domain: string | null; stage_label: string }[] }>(q.length >= 2 ? 'companies:list' : null, { q, limit: 8 }, [])
  const pages = q.length >= 2 ? NAV.filter((n) => n.label.toLocaleLowerCase('tr').includes(q.toLocaleLowerCase('tr'))).slice(0, 4) : []
  const items = [...pages.map((p) => ({ kind: 'page' as const, key: p.key, label: p.label })), ...(data?.rows ?? []).map((r) => ({ kind: 'co' as const, key: r.id, label: r.name, sub: [r.city, r.domain, r.stage_label].filter(Boolean).join(' · ') }))]
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        ref.current?.focus()
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])
  const pick = (i: number) => {
    const it = items[i]
    if (!it) return
    if (it.kind === 'page') go(it.key as PageKey)
    else openCompany(it.key as number)
    setQ('')
    setOpen(false)
  }
  return (
    <div className="search">
      <Search />
      <input
        ref={ref}
        value={q}
        placeholder="Şirket, alan adı, e-posta veya sayfa ara…"
        onChange={(e) => (setQ(e.target.value), setOpen(true), setSel(0))}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setSel((s) => Math.min(items.length - 1, s + 1))
          if (e.key === 'ArrowUp') setSel((s) => Math.max(0, s - 1))
          if (e.key === 'Enter') pick(sel)
          if (e.key === 'Escape') (e.currentTarget.blur(), setOpen(false))
        }}
        aria-label="Genel arama"
      />
      {!q && <kbd>Ctrl K</kbd>}
      {open && q.length >= 2 && (
        <div className="search-results">
          {items.length ? (
            items.map((it, i) => (
              <button key={`${it.kind}${it.key}`} className={i === sel ? 'sel' : ''} onMouseDown={() => pick(i)}>
                <span className="badge">{it.kind === 'page' ? 'Sayfa' : 'Şirket'}</span>
                <span>
                  {it.label}
                  {'sub' in it && it.sub && <div className="tiny muted">{it.sub}</div>}
                </span>
              </button>
            ))
          ) : (
            <div className="muted small" style={{ padding: 10 }}>Sonuç yok</div>
          )}
        </div>
      )}
    </div>
  )
}


interface Note {
  id: number
  text: string
  tone: 'ok' | 'warn' | 'info'
  at: number
}

function Notifications() {
  const [notes, setNotes] = useState<Note[]>([])
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const n = useRef(0)
  const add = useCallback((text: string, tone: Note['tone']) => {
    setNotes((x) => [{ id: ++n.current, text, tone, at: Date.now() }, ...x].slice(0, 40))
    setUnread((u) => u + 1)
  }, [])
  useJobEvents((ev) => {
    if (ev.status === 'completed') add(`Tamamlandı: ${ev.type === 'research' ? 'araştırma' : ev.type === 'analysis' ? 'site analizi' : ev.type} #${ev.runId}`, 'ok')
    if (ev.status === 'failed') add(`Başarısız: görev #${ev.runId} — ${ev.message ?? ''}`, 'warn')
  })
  useEffect(() => window.api.on('notification', (p) => add(`Hatırlatıcı: ${(p as { title: string }).title}`, 'info')), [add])
  return (
    <div style={{ position: 'relative' }}>
      <Btn variant="ghost" icon={<Bell />} onClick={() => (setOpen((o) => !o), setUnread(0))} aria-label="Bildirimler" title="Bildirimler" />
      {unread > 0 && <span style={{ position: 'absolute', right: 4, top: 4, width: 8, height: 8, borderRadius: 8, background: 'var(--brand)' }} />}
      {open && (
        <div className="card" style={{ position: 'absolute', right: 0, top: 44, width: 360, maxHeight: 420, overflow: 'auto', boxShadow: 'var(--shadow-3)', zIndex: 20 }} onMouseLeave={() => setOpen(false)}>
          <div className="card-head"><h3>Bildirimler</h3></div>
          <div className="card-body">
            {notes.length ? notes.map((x) => (
              <div key={x.id} className="list-item small">
                <span className={`badge ${x.tone === 'ok' ? 'success' : x.tone === 'warn' ? 'danger' : 'info'}`}>{x.tone === 'ok' ? 'Başarılı' : x.tone === 'warn' ? 'Hata' : 'Bilgi'}</span>
                <span style={{ flex: 1 }}>{x.text}</span>
                <span className="tiny faint">{new Date(x.at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            )) : <div className="muted small">Bu oturumda bildirim yok.</div>}
          </div>
        </div>
      )}
    </div>
  )
}

/** Önemli olaylarda köşede kısa süreliğine beliren robot (Ayarlar'dan kapatılabilir). */
function RobotNotifier({ enabled }: { enabled: boolean }) {
  const [state, setState] = useState<{ mood: RobotMood; text: string } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const toast = useToast()
  useJobEvents((ev) => {
    let s: { mood: RobotMood; text: string } | null = null
    if (ev.status === 'completed' && ev.type === 'research') s = { mood: 'success', text: 'Araştırma tamamlandı! Yeni şirketler Müşteri Havuzu’nda.' }
    else if (ev.status === 'completed' && ev.type === 'analysis') s = { mood: 'success', text: 'Web sitesi analizi bitti.' }
    else if (ev.status === 'completed' && ev.type === 'research_report') s = { mood: 'success', text: 'Rapor hazır, Dosya Merkezi’nde.' }
    else if (ev.status === 'failed') s = { mood: 'warning', text: `Bir görev başarısız oldu: ${ev.message ?? ''}`.slice(0, 140) }
    if (!s) return
    if (!enabled) {
      toast(s.text, s.mood === 'warning' ? 'error' : 'ok')
      return
    }
    setState(s)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setState(null), 5000)
  })
  if (!state) return null
  return (
    <div style={{ position: 'fixed', left: 20, bottom: 16, zIndex: 40, display: 'flex', alignItems: 'flex-end', gap: 4, pointerEvents: 'none' }}>
      <Robot mood={state.mood} size={110} />
      <div className="robot-bubble" style={{ marginBottom: 30, maxWidth: 280 }}>{state.text}</div>
    </div>
  )
}
