// Satış Panosu: müşteriler aşama sütunlarında; kart sürüklenip bırakılınca aşama değişir ve geçmişe yazılır.
// "İletişim istemiyor" sütununa bırakılan şirket ret listesine alınır (tüm kanallarda gönderim durur).

import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { call, useApi } from '../lib/api'
import { useNav } from '../lib/nav'
import { Badge, Btn, Callout, Loading, useAction, useConfirm } from '../components/ui'
import { PRIORITY_GROUPS } from '@shared/constants'
import { fmtDate } from '../lib/format'
import type { PageProps } from '../lib/page'

interface Card {
  id: number
  name: string
  city: string | null
  sector: string | null
  stage_key: string
  opportunity_score: number | null
  priority_group: string | null
  stage_at: string | null
  task_title: string | null
  task_due: string | null
}
interface Board {
  stages: { key: string; label: string; color: string; terminal: number }[]
  cards: Card[]
}

const GROUP = Object.fromEntries(PRIORITY_GROUPS.map((g) => [g.key, g.label]))

export default function Pipeline(_: PageProps) {
  const { data, reload } = useApi<Board>('pipeline:board', undefined, ['companies', 'tasks'])
  const { openCompany, go } = useNav()
  const { run } = useAction()
  const { ask, node } = useConfirm()
  const [q, setQ] = useState('')
  const [drag, setDrag] = useState<number | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const [moved, setMoved] = useState<Record<number, string>>({})

  const cards = useMemo(() => {
    const f = q.trim().toLocaleLowerCase('tr-TR')
    return (data?.cards ?? []).map((c) => (moved[c.id] ? { ...c, stage_key: moved[c.id] } : c)).filter((c) => !f || `${c.name} ${c.city ?? ''} ${c.sector ?? ''}`.toLocaleLowerCase('tr-TR').includes(f))
  }, [data, q, moved])

  if (!data) return <Loading />

  const drop = async (stage: string) => {
    setOver(null)
    const id = drag
    setDrag(null)
    if (id == null) return
    const card = cards.find((c) => c.id === id)
    if (!card || card.stage_key === stage) return
    const st = data.stages.find((s) => s.key === stage)
    if (stage === 'do_not_contact') {
      const ok = await ask('İletişim istemiyor olarak işaretlensin mi?', <>{card.name} ret listesine alınır; e-posta ve WhatsApp kuyruklarındaki bekleyen mesajları gönderilmez. Bu kayıt silinmez.</>, { danger: true, confirm: 'Ret listesine al' })
      if (!ok) return
    }
    setMoved((m) => ({ ...m, [id]: stage }))
    const r = await run(() => call('companies:update', { id, patch: { stage_key: stage } }), `${card.name} → ${st?.label ?? stage}`)
    if (r === undefined) setMoved((m) => { const n = { ...m }; delete n[id]; return n })
    else reload()
  }

  const today = new Date().toISOString().slice(0, 10)
  return (
    <div className="col" style={{ gap: 16, minHeight: 0 }}>
      <div className="page-head">
        <div>
          <h1>Satış Panosu</h1>
          <p>Kartı sürükleyip başka bir aşamaya bırakın. Her değişiklik tarihiyle şirketin aşama geçmişine yazılır. Aşamaları Ayarlar → Aşamalar'dan düzenleyebilirsiniz.</p>
        </div>
        <div className="actions">
          <div className="search" style={{ width: 260 }}><Search /><input placeholder="Şirket, şehir, sektör…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <Btn onClick={() => go('settings', { tab: 'stages' })}>Aşamaları düzenle</Btn>
        </div>
      </div>
      {!data.cards.length && <Callout>Henüz müşteri kaydı yok. AI Müşteri Bulucu ile arama yaptığınızda ya da web sitenizden talep geldiğinde kartlar burada görünür.</Callout>}
      <div className="kanban">
        {data.stages.map((s) => {
          const list = cards.filter((c) => c.stage_key === s.key)
          return (
            <div key={s.key} className={`kanban-col${over === s.key ? ' over' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setOver(s.key) }} onDragLeave={() => setOver((o) => (o === s.key ? null : o))} onDrop={(e) => { e.preventDefault(); drop(s.key) }}>
              <div className="kanban-head"><Badge tone={s.color as never} dot>{s.label}</Badge><span className="muted small">{list.length}</span></div>
              <div className="kanban-list">
                {list.slice(0, 150).map((c) => (
                  <div key={c.id} className="kanban-card" draggable onDragStart={(e) => { setDrag(c.id); e.dataTransfer.effectAllowed = 'move' }} onDragEnd={() => setDrag(null)} onClick={() => openCompany(c.id)}>
                    <div className="row" style={{ gap: 6, alignItems: 'flex-start' }}>
                      <b className="small" style={{ flex: 1, minWidth: 0 }}>{c.name}</b>
                      {c.opportunity_score != null && <Badge tone={c.opportunity_score >= 70 ? 'success' : c.opportunity_score >= 45 ? 'brand' : 'neutral'}>{c.opportunity_score}</Badge>}
                    </div>
                    <div className="tiny muted">{[c.city, c.sector].filter(Boolean).join(' · ') || '—'}</div>
                    {c.priority_group && <div className="tiny faint">{GROUP[c.priority_group] ?? c.priority_group}</div>}
                    {c.task_title && <div className={`tiny ${c.task_due && c.task_due.slice(0, 10) < today ? 'danger-text' : 'muted'}`}>▸ {c.task_title}{c.task_due ? ` · ${fmtDate(c.task_due)}` : ''}</div>}
                    {c.stage_at && <div className="tiny faint">Bu aşamada: {fmtDate(c.stage_at)}</div>}
                  </div>
                ))}
                {list.length > 150 && <div className="tiny muted" style={{ padding: 6 }}>+{list.length - 150} kayıt daha (Müşteri Havuzu'nda filtreleyin)</div>}
              </div>
            </div>
          )
        })}
      </div>
      {node}
    </div>
  )
}
