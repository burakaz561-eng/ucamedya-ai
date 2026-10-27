// Ekip modu giriş ekranı: ekip sunucusuna e-posta + şifre ile giriş (şifre uygulamada saklanmaz).

import { useState } from 'react'
import { call } from '../lib/api'
import { Robot } from '../robot/Robot'
import logoLight from '../assets/uca-medya-logo-light.svg'

interface Cfg { server: string; email: string; localCompanies: number }

export function TeamLogin({ cfg, onDone }: { cfg: Cfg; onDone: () => void }) {
  const [server, setServer] = useState(cfg.server)
  const [email, setEmail] = useState(cfg.email)
  const [pw, setPw] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    setBusy(true)
    setErr(null)
    try {
      await call('team:login', { server, email, password: pw, mode: 'keep' })
      onDone()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const local = async () => {
    if (!confirm('Ekip modu kapatılsın mı? Bu bilgisayardaki veriler kalır ama ekiple eşitlenmez.')) return
    await call('team:disable')
    onDone()
  }
  const field = { width: 300, background: '#17171a', color: '#eee', borderColor: '#333' }
  return (
    <div className="lock-screen">
      <form onSubmit={(e) => (e.preventDefault(), void submit())} style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <Robot mood={err ? 'warning' : 'idle'} size={160} />
        <img src={logoLight} alt="UcaMedya" style={{ width: 130 }} />
        <div style={{ color: '#bbb' }}>Ekip hesabınızla giriş yapın</div>
        <input className="input" value={server} onChange={(e) => setServer(e.target.value)} placeholder="https://ucamedya.com.tr/" style={field} aria-label="Ekip sunucusu" />
        <input className="input" type="email" autoFocus={!email} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-posta" style={field} aria-label="E-posta" />
        <input className="input" type="password" autoFocus={!!email} value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Şifre" style={field} aria-label="Şifre" />
        <button className="btn primary" type="submit" disabled={busy || !email || !pw} style={{ width: 300 }}>{busy ? 'Giriş yapılıyor…' : 'Giriş yap'}</button>
        {err && <div style={{ color: '#ff8f85', maxWidth: 340 }}>{err}</div>}
        <button type="button" className="btn ghost" onClick={local} style={{ color: '#999', fontSize: 12 }}>Ekip modunu kapat (yalnızca bu bilgisayar)</button>
      </form>
    </div>
  )
}
