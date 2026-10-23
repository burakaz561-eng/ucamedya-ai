// Ortak arayüz bileşenleri (tasarım sistemi).

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'

type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info' | string

export function Badge({ tone = 'neutral', children, dot }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  return (
    <span className={`badge ${tone}`}>
      {dot && <span className="dot" />}
      {children}
    </span>
  )
}

export function Btn({ variant, size, icon, children, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' | 'dark'; size?: 'sm'; icon?: ReactNode }) {
  return (
    <button type="button" {...p} className={`btn ${variant ?? ''} ${size ?? ''} ${!children ? 'icon' : ''} ${p.className ?? ''}`}>
      {icon}
      {children}
    </button>
  )
}

export function Card({ title, actions, children, pad, className, icon }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; pad?: boolean; className?: string; icon?: ReactNode }) {
  return (
    <section className={`card ${className ?? ''}`}>
      {(title || actions) && (
        <div className="card-head">
          <h3>
            {icon}
            {title}
          </h3>
          <div className="row">{actions}</div>
        </div>
      )}
      <div className={pad === false ? '' : 'card-body'}>{children}</div>
    </section>
  )
}

export function Stat({ label, value, sub, icon, accent }: { label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode; accent?: boolean }) {
  return (
    <div className={`card stat ${accent ? 'accent' : ''}`}>
      <div className="label">
        {icon}
        {label}
      </div>
      <div className="value">{value}</div>
      {sub != null && <div className="sub">{sub}</div>}
    </div>
  )
}

export function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint && <div className="hint">{hint}</div>}
    </div>
  )
}

export function Progress({ value, indeterminate }: { value?: number; indeterminate?: boolean }) {
  return (
    <div className={`progress ${indeterminate ? 'indet' : ''}`}>
      <i style={{ width: `${Math.round((value ?? 0) * 100)}%` }} />
    </div>
  )
}

export function Callout({ tone = 'info', children, icon }: { tone?: 'info' | 'warn' | 'danger' | 'brand'; children: ReactNode; icon?: ReactNode }) {
  const Ic = tone === 'warn' ? AlertTriangle : tone === 'danger' ? XCircle : Info
  return (
    <div className={`callout ${tone}`}>
      {icon ?? <Ic />}
      <div>{children}</div>
    </div>
  )
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { key: T; label: ReactNode }[] }) {
  return (
    <div className="tabs" role="tablist">
      {items.map((i) => (
        <button key={i.key} role="tab" aria-selected={value === i.key} className={`tab ${value === i.key ? 'on' : ''}`} onClick={() => onChange(i.key)}>
          {i.label}
        </button>
      ))}
    </div>
  )
}

export function Seg<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { key: T; label: ReactNode }[] }) {
  return (
    <div className="seg">
      {items.map((i) => (
        <button key={i.key} className={value === i.key ? 'on' : ''} onClick={() => onChange(i.key)}>
          {i.label}
        </button>
      ))}
    </div>
  )
}

export function Chips({ options, value, onChange }: { options: { key: string; label: string }[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="chips">
      {options.map((o) => {
        const on = value.includes(o.key)
        return (
          <button type="button" key={o.key} className={`chip ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== o.key) : [...value, o.key])}>
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function Modal({ title, sub, onClose, children, footer, size }: { title: ReactNode; sub?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; size?: 'wide' | 'xl' }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${size ?? ''}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          <div style={{ flex: 1 }}>
            <h2>{title}</h2>
            {sub && <div className="muted small" style={{ marginTop: 4 }}>{sub}</div>}
          </div>
          <Btn variant="ghost" size="sm" icon={<X />} onClick={onClose} aria-label="Kapat" />
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

export function Empty({ title, children, action, robot }: { title: string; children?: ReactNode; action?: ReactNode; robot?: ReactNode }) {
  return (
    <div className="empty">
      {robot}
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  )
}

export function Spinner() {
  return <span className="spin" aria-label="Yükleniyor" />
}

export function Loading({ text = 'Yükleniyor…' }: { text?: string }) {
  return (
    <div className="row muted" style={{ padding: 24, justifyContent: 'center' }}>
      <Spinner /> {text}
    </div>
  )
}

export function ErrorBox({ error, retry }: { error: string; retry?: () => void }) {
  return (
    <Callout tone="danger">
      <div className="row wrap">
        <span>{error}</span>
        {retry && (
          <Btn size="sm" onClick={retry}>
            Tekrar dene
          </Btn>
        )}
      </div>
    </Callout>
  )
}

// ---------- Bildirimler ----------
interface ToastItem {
  id: number
  kind: 'ok' | 'error' | 'info'
  text: string
}
const ToastCtx = createContext<(text: string, kind?: ToastItem['kind']) => void>(() => undefined)
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const n = useRef(0)
  const push = useCallback((text: string, kind: ToastItem['kind'] = 'ok') => {
    const id = ++n.current
    setItems((x) => [...x.slice(-3), { id, kind, text }])
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), kind === 'error' ? 8000 : 4000)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind === 'error' ? 'error' : ''}`}>
            {t.kind === 'error' ? <XCircle /> : t.kind === 'info' ? <Info /> : <CheckCircle2 />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

/** Bir işlemi çalıştırır; hata olursa bildirim gösterir. */
export function useAction() {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const run = useCallback(
    async <T,>(fn: () => Promise<T>, okText?: string | ((r: T) => string)): Promise<T | undefined> => {
      setBusy(true)
      try {
        const r = await fn()
        if (okText) toast(typeof okText === 'function' ? okText(r) : okText)
        return r
      } catch (e) {
        toast((e as Error).message, 'error')
        return undefined
      } finally {
        setBusy(false)
      }
    },
    [toast]
  )
  return { run, busy }
}

// ---------- Onay penceresi ----------
export function useConfirm() {
  const [state, setState] = useState<{ title: string; body: ReactNode; danger?: boolean; confirm?: string; resolve: (v: boolean) => void } | null>(null)
  const ask = (title: string, body: ReactNode, opts: { danger?: boolean; confirm?: string } = {}) => new Promise<boolean>((resolve) => setState({ title, body, ...opts, resolve }))
  const node = state ? (
    <Modal
      title={state.title}
      onClose={() => (state.resolve(false), setState(null))}
      footer={
        <>
          <Btn onClick={() => (state.resolve(false), setState(null))}>Vazgeç</Btn>
          <Btn variant={state.danger ? 'danger' : 'primary'} onClick={() => (state.resolve(true), setState(null))} autoFocus>
            {state.confirm ?? 'Onayla'}
          </Btn>
        </>
      }
    >
      <div className="muted">{state.body}</div>
    </Modal>
  ) : null
  return { ask, node }
}
