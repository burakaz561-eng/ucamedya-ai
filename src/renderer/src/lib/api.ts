// Ana süreçle iletişim yardımcıları: komut çağırma, veri değişikliğinde otomatik yenileme.

import { useCallback, useEffect, useRef, useState } from 'react'

export const call = <T = any>(channel: string, payload?: unknown) => window.api.invoke<T>(channel, payload) // eslint-disable-line @typescript-eslint/no-explicit-any

/** Veri çeker; ilgili kapsamda "data-changed" veya görev olayı gelirse kendiliğinden yeniler. */
export function useApi<T = any>(channel: string | null, payload?: unknown, scopes: string[] = ['*']) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(!!channel)
  const key = JSON.stringify(payload ?? null)
  const seq = useRef(0)
  const load = useCallback(async () => {
    if (!channel) return
    const my = ++seq.current
    try {
      const r = await call<T>(channel, payload)
      if (my === seq.current) {
        setData(r)
        setError(null)
      }
    } catch (e) {
      if (my === seq.current) setError((e as Error).message)
    } finally {
      if (my === seq.current) setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, key])
  useEffect(() => {
    setLoading(true)
    void load()
  }, [load])
  const scopeKey = scopes.join(',')
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null
    const debounced = () => {
      if (t) clearTimeout(t)
      t = setTimeout(() => void load(), 350)
    }
    const offA = window.api.on('data-changed', (p) => {
      const sc = (p as { scope?: string })?.scope ?? ''
      if (scopeKey === '*' || scopeKey.split(',').includes(sc)) debounced()
    })
    const offB = window.api.on('job', () => {
      if (scopeKey === '*' || scopeKey.split(',').includes('jobs')) debounced()
    })
    return () => {
      offA()
      offB()
      if (t) clearTimeout(t)
    }
  }, [load, scopeKey])
  return { data, error, loading, reload: load, setData }
}

export function useJobEvents(cb: (ev: { runId: number; type: string; status: string; progress: number; message?: string; researchId?: number | null; companyId?: number | null }) => void) {
  const ref = useRef(cb)
  ref.current = cb
  useEffect(() => window.api.on('job', (p) => ref.current(p as Parameters<typeof cb>[0])), [])
}
