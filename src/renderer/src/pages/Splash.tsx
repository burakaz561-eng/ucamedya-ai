// Açılış: sinematik koyu sahne → logo ışıkla belirir → robot kamera hareketiyle girer ve selam verir →
// gerçek sistem kontrolleri çalışır. Başarısız kontrol başarılı gösterilmez. "Atla" ile her an geçilebilir.

import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import { Robot } from '../robot/Robot'
import { call } from '../lib/api'
import type { CheckResult } from '@shared/types'
import logoLight from '../assets/uca-medya-logo-light.svg'

const LABELS = ['Yerel veritabanı kontrol ediliyor', 'Yapay zekâ bağlantısı kontrol ediliyor', 'İzin verilen entegrasyonlar kontrol ediliyor', 'Son oturum verileri hazırlanıyor']

export function Splash({ onDone, full }: { onDone: (checks: CheckResult[]) => void; full: boolean }) {
  const [checks, setChecks] = useState<CheckResult[] | null>(null)
  const [mood, setMood] = useState<'enter' | 'wave' | 'idle' | 'warning' | 'success'>('enter')
  const [minDone, setMinDone] = useState(!full)
  const finished = useRef(false)

  useEffect(() => {
    let alive = true
    call<CheckResult[]>('app:checks')
      .then((r) => alive && setChecks(r))
      .catch((e) => alive && setChecks([{ key: 'db', label: LABELS[0], ok: false, status: 'error', message: (e as Error).message }]))
    const t1 = setTimeout(() => setMood('wave'), 1400)
    const t2 = setTimeout(() => setMinDone(true), 3400)
    return () => {
      alive = false
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [])

  useEffect(() => {
    if (!checks) return
    setMood(checks.some((c) => c.status === 'error') ? 'warning' : 'success')
  }, [checks])

  useEffect(() => {
    if (!checks || !minDone || finished.current) return
    const hasError = checks.some((c) => c.status === 'error')
    // Hata varsa kullanıcı okuyabilsin diye otomatik geçilmez
    if (hasError) return
    finished.current = true
    const t = setTimeout(() => onDone(checks), 700)
    return () => clearTimeout(t)
  }, [checks, minDone, onDone])

  const finish = () => {
    if (finished.current) return
    finished.current = true
    onDone(checks ?? [])
  }

  useEffect(() => {
    const h = (e: KeyboardEvent) => (e.key === 'Escape' || e.key === 'Enter') && finish()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  })

  const hasError = checks?.some((c) => c.status === 'error')
  return (
    <div className="splash">
      <div style={{ position: 'absolute', right: '4vw', top: 0, bottom: 0, width: '56vw' }}>
        {full ? <Robot mood={mood} size="100%" camera="cinematic" /> : <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}><Robot mood={mood} size={340} /></div>}
      </div>
      <div className="grain" />
      <div className="logo-wrap">
        <img src={logoLight} alt="UcaMedya" />
        <div className="title">
          UcaMedya <b>AI</b> Growth Studio
        </div>
        <div className="subtitle">Müşteri bulma, web sitesi analizi ve satış süreçleri tek merkezde.</div>
        <div className="checks" aria-live="polite">
          {LABELS.map((l, i) => {
            const c = checks?.[i]
            return (
              <div key={l} className="check-row">
                <span className="ic">
                  {!c ? <span className="spin" style={{ borderColor: '#3a3a40', borderTopColor: '#e95a1b' }} /> : c.status === 'ok' ? <CheckCircle2 size={17} color="#3ccf86" /> : c.status === 'warn' ? <AlertTriangle size={17} color="#f2b347" /> : <XCircle size={17} color="#ff6b5f" />}
                </span>
                <div>
                  <div>{l}</div>
                  {c && <div className="msg">{c.message}</div>}
                </div>
              </div>
            )
          })}
        </div>
        {hasError && (
          <button className="btn primary" style={{ marginTop: 18 }} onClick={finish}>
            Hataları gördüm, devam et
          </button>
        )}
      </div>
      <button className="skip" onClick={finish}>
        Atla <kbd style={{ marginLeft: 6, background: 'transparent', color: '#aaa', borderColor: '#555' }}>Esc</kbd>
      </button>
    </div>
  )
}
