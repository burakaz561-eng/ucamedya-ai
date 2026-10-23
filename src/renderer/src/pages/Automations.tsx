// Görevler ve Otomasyonlar: kalıcı iş kuyruğu (başlat/duraklat/devam/iptal/yeniden dene/günlük) ve otomasyon profilleri.

import { useState } from 'react'
import { Pause, Play, Square, RotateCcw, ScrollText, Trash2, Rocket } from 'lucide-react'
import { call, useApi } from '../lib/api'
import { useNav } from '../lib/nav'
import { Badge, Btn, Callout, Card, Progress, Tabs, useAction, useConfirm } from '../components/ui'
import { DataTable } from '../components/DataTable'
import { RunLog } from './Research'
import { JOB_TYPES, RUN_STATUS, fmtDate } from '../lib/format'
import type { PageProps } from '../lib/page'

/* eslint-disable @typescript-eslint/no-explicit-any */
const STEPS = ['Araştırma', 'Doğrulama', 'Analiz', 'Rapor', 'Mesaj taslağı', 'Kontrol', 'Onay', 'İletişim', 'Yanıt yönetimi', 'Satış süreci', 'Raporlama']

export default function Automations({ params }: PageProps) {
  const [tab, setTab] = useState<'runs' | 'profiles' | 'flow'>('runs')
  const { data: runs } = useApi<any[]>('jobs:list', {}, ['jobs'])
  const { data: profiles, reload: rp } = useApi<any[]>('profiles:list', undefined, [])
  const [log, setLog] = useState<number | null>((params.run as number) ?? null)
  const { run } = useAction()
  const { ask, node } = useConfirm()
  const { go } = useNav()
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="page-head">
        <div>
          <h1>Görevler ve Otomasyonlar</h1>
          <p>Araştırma, analiz, rapor ve iletişim işleri ayrı görevler olarak çalışır. Uygulama kapanırsa yarım kalan görevler işaretlenir ve kaldığı yerden devam ettirilebilir; tamamlanan adımlar tekrar yapılmaz.</p>
        </div>
      </div>
      <Tabs value={tab} onChange={setTab} items={[{ key: 'runs', label: 'Görev kuyruğu' }, { key: 'profiles', label: `Otomasyon profilleri (${profiles?.length ?? 0})` }, { key: 'flow', label: 'Uçtan uca iş akışı' }]} />
      {tab === 'runs' && (
        <Card pad={false}>
          <DataTable id="runs" rows={runs ?? []} onRowClick={(r) => setLog(r.id)} cols={[
            { key: 'id', header: 'No', width: 60 },
            { key: 'type', header: 'Tür', width: 130, render: (r) => JOB_TYPES[r.type] ?? r.type },
            { key: 'title', header: 'Görev', width: 280 },
            { key: 'status', header: 'Durum', width: 120, render: (r) => <Badge tone={RUN_STATUS[r.status]?.[1]}>{RUN_STATUS[r.status]?.[0] ?? r.status}</Badge> },
            { key: 'progress', header: 'İlerleme', width: 150, render: (r) => <div className="row"><div style={{ flex: 1 }}><Progress value={r.progress} /></div><span className="tiny muted">{r.total ? `${r.done}/${r.total}` : `${Math.round(r.progress * 100)}%`}</span></div> },
            { key: 'failed', header: 'Hata', width: 70 },
            { key: 'attempts', header: 'Deneme', width: 80, hidden: true },
            { key: 'error', header: 'Sonuç / hata', width: 240, render: (r) => <span className="small" style={{ color: r.error ? 'var(--danger)' : undefined }}>{r.error ?? ''}</span> },
            { key: 'created_at', header: 'Başlangıç', width: 140, render: (r) => fmtDate(r.started_at ?? r.created_at, true) },
            { key: 'finished_at', header: 'Bitiş', width: 140, render: (r) => fmtDate(r.finished_at, true) },
            { key: 'x', header: 'Kontrol', width: 190, render: (r) => (
              <div className="row" style={{ gap: 4 }} onClick={(e) => e.stopPropagation()}>
                {r.status === 'running' && <Btn size="sm" icon={<Pause />} title="Duraklat" onClick={() => run(() => call('jobs:pause', { id: r.id }))} />}
                {r.status === 'paused' && <Btn size="sm" icon={<Play />} title="Devam ettir" onClick={() => run(() => call('jobs:resume', { id: r.id }))} />}
                {['interrupted', 'failed', 'cancelled'].includes(r.status) && <Btn size="sm" icon={<RotateCcw />} title="Yeniden dene / devam et" onClick={() => run(() => call('jobs:resume', { id: r.id }), 'Yeniden kuyruğa alındı')} />}
                {['running', 'paused', 'queued', 'interrupted'].includes(r.status) && <Btn size="sm" variant="danger" icon={<Square />} title="İptal et" onClick={() => run(() => call('jobs:cancel', { id: r.id }))} />}
                <Btn size="sm" variant="ghost" icon={<ScrollText />} title="Günlükleri aç" onClick={() => setLog(r.id)} />
              </div>
            ) }
          ]} />
        </Card>
      )}
      {tab === 'profiles' && (
        <div className="grid g3">
          {profiles?.map((p) => (
            <Card key={p.id} title={p.name} actions={<Btn size="sm" variant="ghost" icon={<Trash2 />} aria-label="Sil" onClick={async () => (await ask('Profil silinsin mi?', p.name, { danger: true, confirm: 'Sil' })) && run(() => call('profiles:delete', { id: p.id }), 'Silindi').then(rp)} />}>
              <div className="small muted">{p.description}</div>
              <div className="kv" style={{ marginTop: 10 }}>
                <div>Sektör</div><div>{p.config.sectors?.join(', ') || 'seçilmedi'}</div>
                <div>Konum</div><div>{p.config.locations?.map((l: any) => l.district ?? l.city).join(', ') || 'seçilmedi'}</div>
                <div>Hedef</div><div>{p.config.targetCount} şirket</div>
                <div>Analiz</div><div>{p.config.analysisTypes?.length ?? 0} kategori</div>
                <div>Çıktılar</div><div>{Object.entries(p.config.steps ?? {}).filter(([, v]) => v).map(([k]) => ({ analyze: 'analiz', screenshots: 'görüntü', pdf: 'PDF', drafts: 'taslak' } as any)[k]).join(', ')}</div>
                <div>Kanal / ton</div><div>{p.config.channels?.join(', ')} · {p.config.tone}</div>
              </div>
              <Btn size="sm" variant="primary" icon={<Rocket />} style={{ marginTop: 12 }} onClick={() => go('finder')}>Bu profille araştırma</Btn>
            </Card>
          ))}
          <Callout>Yeni profil oluşturmak için AI Müşteri Bulucu ekranında ayarları yapıp "Profil olarak kaydet" deyin.</Callout>
        </div>
      )}
      {tab === 'flow' && (
        <Card title="Araştırmadan satışa tek iş akışı">
          <div className="row wrap" style={{ gap: 6 }}>
            {STEPS.map((s, i) => <span key={s} className="badge" style={{ background: i < 5 ? 'var(--brand-soft)' : i < 8 ? 'var(--warning-soft)' : 'var(--success-soft)' }}>{i + 1}. {s}</span>)}
          </div>
          <div className="small" style={{ marginTop: 14, lineHeight: 1.8 }}>
            <b>1–5 otomatik:</b> AI Müşteri Bulucu'da başlatılan araştırma şirketleri bulur, tekrarları ayıklar, siteleri analiz eder, PDF raporu ve taslakları üretir. Her adım ayrı başlatılabilir (Müşteri Havuzu'ndan analiz / taslak).<br />
            <b>6–7 sizde:</b> AI Mesaj Stüdyosu'nda taslakları inceleyip onaylarsınız. Onaysız hiçbir mesaj kuyruğa giremez.<br />
            <b>8 kontrollü:</b> E-posta / WhatsApp kuyruğunu siz başlatırsınız; duraklat/devam/iptal her an mümkündür.<br />
            <b>9–11:</b> Yanıtlar şirket kartına eklenir, görevler açılır; teklifler ve raporlar ilgili ekranlardan yönetilir.
          </div>
        </Card>
      )}
      {log && <RunLog id={log} onClose={() => setLog(null)} />}
      {node}
    </div>
  )
}
