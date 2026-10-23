// Takip Planlayıcısı: görevler (sorumlu, tarih, öncelik, durum) ve hatırlatıcılar.

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { call, useApi } from '../lib/api'
import { useNav } from '../lib/nav'
import { Badge, Btn, Callout, Card, Field, Modal, Seg, useAction } from '../components/ui'
import { DataTable } from '../components/DataTable'
import { TASK_PRIORITIES } from '@shared/constants'
import { fmtDate } from '../lib/format'
import type { PageProps } from '../lib/page'

/* eslint-disable @typescript-eslint/no-explicit-any */
const TEMPLATES = ['Web sitesi analizini kontrol et', 'Mesaj taslağını onayla', 'Müşterinin yanıtını değerlendir', 'Toplantı planla', 'Teklif hazırla', 'Teklifin sonucunu takip et']
const STATUS: Record<string, [string, string]> = { open: ['Açık', 'neutral'], in_progress: ['Sürüyor', 'brand'], done: ['Tamamlandı', 'success'], cancelled: ['İptal', 'neutral'] }

export default function FollowUp({ settings }: PageProps) {
  const [status, setStatus] = useState<'active' | 'done' | ''>('active')
  const { data, reload } = useApi<any[]>('tasks:list', { status: status || undefined }, ['tasks', 'companies'])
  const [edit, setEdit] = useState<any | null>(null)
  const { openCompany } = useNav()
  const { run } = useAction()
  const today = new Date().toISOString().slice(0, 10)
  const overdue = (data ?? []).filter((t) => t.due_at && t.due_at.slice(0, 10) < today && ['open', 'in_progress'].includes(t.status)).length
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="page-head">
        <div>
          <h1>Takip Planlayıcısı</h1>
          <p>Her müşterinin bir sonraki adımı. Ret listesindeki şirketlere takip mesajı otomatik oluşturulmaz; yanıt geldiğinde "yanıtı değerlendir" görevi otomatik açılır.</p>
        </div>
        <div className="actions">
          <Seg value={status} onChange={setStatus} items={[{ key: 'active', label: 'Aktif' }, { key: 'done', label: 'Tamamlanan' }, { key: '', label: 'Tümü' }]} />
          <Btn variant="primary" icon={<Plus />} onClick={() => setEdit({ priority: 'normal', status: 'open' })}>Görev ekle</Btn>
        </div>
      </div>
      {overdue > 0 && <Callout tone="warn">{overdue} görevin tarihi geçti.</Callout>}
      <Card pad={false}>
        <DataTable id="tasks" rows={data ?? []} onRowClick={(r) => setEdit({ ...r, dueAt: r.due_at, remindAt: r.remind_at, companyId: r.company_id })}
          empty={<div className="muted small" style={{ padding: 16 }}>Görev yok.</div>}
          cols={[
            { key: 'done', header: '', width: 44, render: (r) => <input type="checkbox" checked={r.status === 'done'} style={{ accentColor: 'var(--brand)' }} onClick={(e) => e.stopPropagation()} onChange={() => run(() => call('tasks:save', { id: r.id, title: r.title, description: r.description, companyId: r.company_id, assignee: r.assignee, dueAt: r.due_at, remindAt: r.remind_at, priority: r.priority, status: r.status === 'done' ? 'open' : 'done', kind: r.kind })).then(reload)} aria-label="Tamamlandı" /> },
            { key: 'title', header: 'Görev', width: 280, render: (r) => <span style={{ textDecoration: r.status === 'done' ? 'line-through' : undefined, fontWeight: 500 }}>{r.title}</span> },
            { key: 'company_name', header: 'Şirket', width: 200, render: (r) => (r.company_id ? <a href="#" onClick={(e) => (e.preventDefault(), e.stopPropagation(), openCompany(r.company_id))}>{r.company_name}</a> : '—') },
            { key: 'assignee', header: 'Sorumlu', width: 120, render: (r) => r.assignee ?? '—' },
            { key: 'due_at', header: 'Tarih', width: 120, render: (r) => <span style={{ color: r.due_at && r.due_at.slice(0, 10) < today && r.status !== 'done' ? 'var(--danger)' : undefined }}>{fmtDate(r.due_at)}</span> },
            { key: 'priority', header: 'Öncelik', width: 100, render: (r) => <Badge tone={r.priority === 'urgent' ? 'danger' : r.priority === 'high' ? 'warning' : 'neutral'}>{TASK_PRIORITIES.find((p) => p.key === r.priority)?.label}</Badge> },
            { key: 'status', header: 'Durum', width: 110, render: (r) => <Badge tone={STATUS[r.status]?.[1]}>{STATUS[r.status]?.[0]}</Badge> },
            { key: 'remind_at', header: 'Hatırlatıcı', width: 140, render: (r) => (r.remind_at ? fmtDate(r.remind_at, true) : '—') }
          ]}
        />
      </Card>
      {edit && <TaskModal task={edit} owners={settings.owners} onClose={() => (setEdit(null), reload())} />}
    </div>
  )
}

function TaskModal({ task, owners, onClose }: { task: any; owners: string[]; onClose: () => void }) {
  const [t, setT] = useState<any>({ ...task, dueAt: task.dueAt?.slice(0, 10) ?? '', remindAt: task.remindAt?.slice(0, 16) ?? '' })
  const { data: companies } = useApi<{ rows: any[] }>('companies:list', { limit: 2000, sort: 'name', dir: 'asc' }, [])
  const { run } = useAction()
  return (
    <Modal title={t.id ? 'Görevi düzenle' : 'Yeni görev'} onClose={onClose} footer={<>
      {t.id && <Btn variant="danger" icon={<Trash2 />} onClick={() => run(() => call('tasks:delete', { id: t.id }), 'Silindi').then(onClose)}>Sil</Btn>}
      <div className="spacer" />
      <Btn variant="primary" disabled={!t.title?.trim()} onClick={() => run(() => call('tasks:save', { id: t.id, title: t.title, description: t.description || null, companyId: t.companyId ? Number(t.companyId) : null, assignee: t.assignee || null, dueAt: t.dueAt || null, remindAt: t.remindAt || null, priority: t.priority, status: t.status }), 'Kaydedildi').then(onClose)}>Kaydet</Btn>
    </>}>
      <div className="col">
        <Field label="Görev"><input className="input" list="task-templates" value={t.title ?? ''} onChange={(e) => setT({ ...t, title: e.target.value })} autoFocus /><datalist id="task-templates">{TEMPLATES.map((x) => <option key={x} value={x} />)}</datalist></Field>
        <Field label="Şirket"><select className="select" value={t.companyId ?? ''} onChange={(e) => setT({ ...t, companyId: e.target.value })}><option value="">—</option>{companies?.rows.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <div className="grid g2">
          <Field label="Sorumlu"><input className="input" list="owners2" value={t.assignee ?? ''} onChange={(e) => setT({ ...t, assignee: e.target.value })} /><datalist id="owners2">{owners.map((o) => <option key={o} value={o} />)}</datalist></Field>
          <Field label="Tarih"><input className="input" type="date" value={t.dueAt} onChange={(e) => setT({ ...t, dueAt: e.target.value })} /></Field>
          <Field label="Öncelik"><select className="select" value={t.priority} onChange={(e) => setT({ ...t, priority: e.target.value })}>{TASK_PRIORITIES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}</select></Field>
          <Field label="Durum"><select className="select" value={t.status} onChange={(e) => setT({ ...t, status: e.target.value })}>{Object.entries(STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label="Hatırlatıcı" hint="Masaüstü bildirimi gösterilir"><input className="input" type="datetime-local" value={t.remindAt} onChange={(e) => setT({ ...t, remindAt: e.target.value })} /></Field>
        </div>
        <Field label="Açıklama"><textarea className="textarea" style={{ minHeight: 80 }} value={t.description ?? ''} onChange={(e) => setT({ ...t, description: e.target.value })} /></Field>
      </div>
    </Modal>
  )
}
