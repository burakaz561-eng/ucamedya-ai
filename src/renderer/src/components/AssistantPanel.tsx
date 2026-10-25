// "Uca'ya sor" asistan paneli: kayıtlara dayalı özet ve soru-cevap. Görev oluşturma gibi değişiklikler onayla yapılır;
// gönderme/silme asistan tarafından hiç yapılmaz.

import { useEffect, useRef, useState } from 'react'
import { Send, X } from 'lucide-react'
import { call } from '../lib/api'
import { useNav, type PageKey } from '../lib/nav'
import { Btn, useAction, useConfirm } from './ui'
import { Robot } from '../robot/Robot'

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Reply { text: string; items?: { label: string; sub?: string; companyId?: number; path?: string }[]; actions?: { label: string; kind: 'navigate' | 'create_tasks'; page?: string; params?: Record<string, unknown>; companyIds?: number[]; taskTitle?: string; confirm?: string }[]; source: string }
interface Msg { who: 'me' | 'uca'; text?: string; reply?: Reply }

export function AssistantLauncher() {
  const [open, setOpen] = useState(false)
  return (
    <>
      {!open && (
        <button className="assistant-fab" onClick={() => setOpen(true)} title="Uca'ya sor" aria-label="Asistanı aç">
          <Robot size={46} forceStatic mood="idle" />
          <span>Uca'ya sor</span>
        </button>
      )}
      {open && <AssistantPanel onClose={() => setOpen(false)} />}
    </>
  )
}

function AssistantPanel({ onClose }: { onClose: () => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [examples, setExamples] = useState<string[]>([])
  const { go, openCompany } = useNav()
  const { run } = useAction()
  const { ask, node } = useConfirm()
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => {
    call<{ summary: Reply; examples: string[] }>('assistant:summary').then((r) => { setMsgs([{ who: 'uca', reply: r.summary }]); setExamples(r.examples) }).catch(() => undefined)
  }, [])
  useEffect(() => end.current?.scrollIntoView({ behavior: 'smooth' }), [msgs])

  const send = async (text: string) => {
    const t = text.trim()
    if (!t || busy) return
    setQ('')
    setMsgs((m) => [...m, { who: 'me', text: t }])
    setBusy(true)
    try {
      const reply = await call<Reply>('assistant:ask', { question: t })
      setMsgs((m) => [...m, { who: 'uca', reply }])
    } catch (e) {
      setMsgs((m) => [...m, { who: 'uca', reply: { text: (e as Error).message, source: 'help' } }])
    } finally {
      setBusy(false)
    }
  }

  const act = async (a: NonNullable<Reply['actions']>[number]) => {
    if (a.kind === 'navigate' && a.page) return go(a.page as PageKey, a.params ?? {})
    if (a.kind === 'create_tasks' && a.companyIds?.length) {
      const ok = await ask('Görev oluşturulsun mu?', a.confirm ?? `${a.companyIds.length} şirket için görev oluşturulacak.`, { confirm: 'Oluştur' })
      if (!ok) return
      const n = await run(() => call<number>('assistant:createTasks', { companyIds: a.companyIds, title: a.taskTitle ?? 'Takip et' }), (x) => `${x} görev oluşturuldu`)
      if (n != null) setMsgs((m) => [...m, { who: 'uca', reply: { text: `${n} görev oluşturdum (aynı başlıkta açık görevi olan şirketler atlandı). Takip Planlayıcısı'nda görebilirsiniz.`, source: 'data' } }])
    }
  }

  return (
    <div className="assistant-panel" role="dialog" aria-label="Uca asistan">
      <div className="assistant-head">
        <Robot size={38} forceStatic mood="idle" />
        <div style={{ flex: 1 }}><b>Uca</b><div className="tiny muted">Kayıtlarınıza dayanarak yanıtlar; göndermez, silmez.</div></div>
        <Btn variant="ghost" size="sm" icon={<X />} aria-label="Kapat" onClick={onClose} />
      </div>
      <div className="assistant-body">
        {msgs.map((m, i) => m.who === 'me' ? (
          <div key={i} className="am me">{m.text}</div>
        ) : (
          <div key={i} className="am uca">
            <div>{m.reply?.text}</div>
            {m.reply?.items?.length ? (
              <div className="am-items">
                {m.reply.items.map((it, j) => (
                  <button key={j} className="am-item" disabled={!it.companyId && !it.path && m.reply?.source !== 'help'}
                    onClick={() => (it.path ? call('shell:openPath', { path: it.path }) : it.companyId ? openCompany(it.companyId) : m.reply?.source === 'help' ? send(it.label) : undefined)}>
                    <span>{it.label}</span>{it.sub && <span className="tiny muted">{it.sub}</span>}
                  </button>
                ))}
              </div>
            ) : null}
            {m.reply?.actions?.length ? <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>{m.reply.actions.map((a, j) => <Btn key={j} size="sm" variant={a.kind === 'create_tasks' ? 'primary' : undefined} onClick={() => act(a)}>{a.label}</Btn>)}</div> : null}
            {m.reply?.source === 'ai' && <div className="tiny faint" style={{ marginTop: 6 }}>Yapay zekâ yanıtı — yalnızca özet kayıt verisi gönderildi.</div>}
          </div>
        ))}
        {busy && <div className="am uca muted">Kayıtlara bakıyorum…</div>}
        <div ref={end} />
      </div>
      {msgs.length <= 1 && examples.length > 0 && (
        <div className="assistant-ex">{examples.slice(0, 5).map((e) => <button key={e} className="chip" onClick={() => send(e)}>{e}</button>)}</div>
      )}
      <form className="assistant-input" onSubmit={(e) => { e.preventDefault(); void send(q) }}>
        <input className="input" placeholder="Bir şey sorun… (ör. teklif hazırlamam gereken müşteriler)" value={q} onChange={(e) => setQ(e.target.value)} autoFocus maxLength={500} />
        <Btn variant="primary" icon={<Send />} type="submit" disabled={busy || !q.trim()} aria-label="Sor" />
      </form>
      {node}
    </div>
  )
}
