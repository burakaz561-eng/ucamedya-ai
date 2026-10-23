import { useState } from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Building2, ScanSearch, Hourglass, MailCheck, MessageCircle, Reply, Handshake, FileSignature, Trophy, TrendingUp, AlertTriangle, Radar, ClipboardCheck } from 'lucide-react'
import { useApi } from '../lib/api'
import { useNav } from '../lib/nav'
import { Badge, Btn, Card, ErrorBox, Loading, Seg, Stat } from '../components/ui'
import { Robot } from '../robot/Robot'
import { fmtDate, fmtMoney, fmtNum, fmtRel, GROUP_LABELS, JOB_TYPES, RUN_STATUS } from '../lib/format'
import type { PageProps } from '../lib/page'

/* eslint-disable @typescript-eslint/no-explicit-any */
export default function Dashboard({ settings }: PageProps) {
  const { data: d, error, reload } = useApi<any>('dashboard:stats', undefined, ['*'])
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('day')
  const { data: series } = useApi<any[]>('dashboard:series', { period, span: period === 'day' ? 14 : period === 'week' ? 12 : 12 }, ['*'])
  const { go, openCompany } = useNav()
  void openCompany
  if (error) return <ErrorBox error={error} retry={reload} />
  if (!d) return <Loading />
  const empty = d.companies === 0
  const hour = new Date().getHours()
  const greet = hour < 5 ? 'İyi geceler' : hour < 12 ? 'Günaydın' : hour < 18 ? 'İyi günler' : 'İyi akşamlar'
  return (
    <div className="col" style={{ gap: 18 }}>
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 22px 6px 6px', background: 'linear-gradient(110deg, var(--bg-elev) 55%, var(--brand-soft))', overflow: 'hidden' }}>
        <Robot mood={empty ? 'wave' : 'idle'} size={150} />
        <div style={{ flex: 1 }}>
          <h1>{greet}{settings.brand.senderName ? `, ${settings.brand.senderName}` : ''}</h1>
          <p className="muted" style={{ margin: '6px 0 12px', maxWidth: 640 }}>
            {empty
              ? 'Henüz kayıtlı şirket yok. İlk araştırmanızı başlatın: sektör ve şehir seçin, gerisini ben hallederim — şirketleri bulur, sitelerini inceler ve kanıta dayalı mesaj taslakları hazırlarım.'
              : `${fmtNum(d.reviewPending)} şirket inceleme bekliyor, ${fmtNum(d.draftsPending)} mesaj taslağı onayınızı bekliyor.`}
          </p>
          <div className="row">
            <Btn variant="primary" icon={<Radar />} onClick={() => go('finder', { new: 1 })}>Yeni araştırma</Btn>
            {!empty && <Btn icon={<ClipboardCheck />} onClick={() => go('studio')}>Taslakları incele</Btn>}
            {!empty && <Btn variant="ghost" onClick={() => go('companies', { stage: 'review' })}>İnceleme bekleyenler</Btn>}
          </div>
        </div>
      </div>

      <div className="grid g6">
        <Stat accent icon={<Building2 />} label="Bulunan şirket" value={fmtNum(d.companies)} />
        <Stat icon={<ScanSearch />} label="Analizi tamamlanan" value={fmtNum(d.analyzed)} />
        <Stat icon={<Hourglass />} label="İnceleme bekleyen" value={fmtNum(d.reviewPending)} />
        <Stat icon={<ClipboardCheck />} label="Onay bekleyen mesaj" value={fmtNum(d.draftsPending)} sub={`${fmtNum(d.approvedDrafts)} onaylı, gönderilmedi`} />
        <Stat icon={<MailCheck />} label="Gönderilen e-posta" value={fmtNum(d.emailsSent)} sub={d.emailsFailed ? `${d.emailsFailed} başarısız` : 'Sunucu kabul etti'} />
        <Stat icon={<MessageCircle />} label="WhatsApp (sonucu bilinen)" value={fmtNum(d.whatsappSent)} sub={d.whatsappDelivered ? `${d.whatsappDelivered} teslim` : 'Teslim bilgisi webhook gerektirir'} />
        <Stat icon={<Reply />} label="Yanıt veren şirket" sub={d.positive ? `${d.positive} şirket olumlu ilerliyor` : undefined} value={fmtNum(d.replies)} />
        <Stat icon={<Handshake />} label="Toplantıya dönüşen" value={fmtNum(d.meetings)} />
        <Stat icon={<FileSignature />} label="Hazırlanan teklif" value={fmtNum(d.offers)} />
        <Stat icon={<Trophy />} label="Kazanılan müşteri" value={fmtNum(d.won)} sub={d.wonValue ? fmtMoney(d.wonValue) : undefined} />
        <Stat icon={<TrendingUp />} label="Açık teklif tutarı" value={d.pipelineValue ? fmtMoney(d.pipelineValue) : '—'} sub="Taslak + gönderilen + müzakere" />
        <Stat icon={<AlertTriangle />} label="Başarısız / yarım görev" value={fmtNum(d.failedRuns)} sub={d.failedRuns ? <a href="#" onClick={(e) => (e.preventDefault(), go('automations'))}>İncele</a> : undefined} />
      </div>

      <div className="grid" style={{ gridTemplateColumns: '2fr 1fr' }}>
        <Card title="Etkinlik" actions={<Seg value={period} onChange={setPeriod} items={[{ key: 'day', label: 'Günlük' }, { key: 'week', label: 'Haftalık' }, { key: 'month', label: 'Aylık' }]} />}>
          {series && series.some((s) => s.found + s.analyzed + s.sent + s.replies > 0) ? (
            <div style={{ height: 260 }}>
              <ResponsiveContainer>
                <AreaChart data={series} margin={{ left: -18, right: 6, top: 6 }}>
                  <defs>
                    <linearGradient id="gF" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e95a1b" stopOpacity={0.35} /><stop offset="1" stopColor="#e95a1b" stopOpacity={0} /></linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--line)" vertical={false} />
                  <XAxis dataKey="k" tick={{ fontSize: 11, fill: 'var(--mute)' }} tickFormatter={(v: string) => (period === 'day' ? v.slice(5) : v)} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--mute)' }} />
                  <Tooltip contentStyle={{ background: 'var(--bg-elev)', border: '1px solid var(--line)', borderRadius: 10 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area type="monotone" dataKey="found" name="Bulunan" stroke="#e95a1b" fill="url(#gF)" strokeWidth={2} />
                  <Area type="monotone" dataKey="analyzed" name="Analiz" stroke="#3f3f46" fill="transparent" strokeWidth={2} />
                  <Area type="monotone" dataKey="sent" name="Gönderilen" stroke="#255fb3" fill="transparent" strokeWidth={2} />
                  <Area type="monotone" dataKey="replies" name="Yanıt" stroke="#138a4f" fill="transparent" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="empty" style={{ padding: 30 }}>Bu dönemde kayıtlı etkinlik yok. Grafikler gerçek kayıtlardan çizilir; örnek veri gösterilmez.</div>
          )}
        </Card>
        <Card title="Öncelik grupları">
          {d.byGroup.length ? (
            <div className="col" style={{ gap: 8 }}>
              {d.byGroup.map((g: any) => (
                <button key={g.k} className="btn ghost" style={{ justifyContent: 'space-between', width: '100%' }} onClick={() => go('companies', { group: g.k })}>
                  <span>{GROUP_LABELS[g.k] ?? g.k}</span>
                  <Badge tone={g.k === 'priority' ? 'brand' : 'neutral'}>{g.n}</Badge>
                </button>
              ))}
            </div>
          ) : <div className="muted small">Puanlanmış şirket yok.</div>}
        </Card>
      </div>

      <div className="grid g3">
        <Card title="Satış süreci">
          {d.byStage.every((s: any) => !s.n) ? <div className="muted small">Kayıtlı şirket yok.</div> : <div style={{ height: 240 }}>
            <ResponsiveContainer>
              <BarChart data={d.byStage.filter((s: any) => s.n > 0)} layout="vertical" margin={{ left: 40 }}>
                <XAxis type="number" allowDecimals={false} hide />
                <YAxis type="category" dataKey="k" width={130} tick={{ fontSize: 11, fill: 'var(--mute)' }} />
                <Tooltip contentStyle={{ background: 'var(--bg-elev)', border: '1px solid var(--line)', borderRadius: 10 }} />
                <Bar dataKey="n" name="Şirket" fill="#e95a1b" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>}
        </Card>
        <Card title="Son çalışan otomasyonlar" actions={<Btn size="sm" variant="ghost" onClick={() => go('automations')}>Tümü</Btn>}>
          {d.recentRuns.length ? d.recentRuns.map((r: any) => (
            <div key={r.id} className="list-item small">
              <Badge tone={RUN_STATUS[r.status]?.[1]}>{RUN_STATUS[r.status]?.[0] ?? r.status}</Badge>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="ellipsis">{r.title}</div>
                <div className="tiny muted">{JOB_TYPES[r.type] ?? r.type} · {fmtRel(r.created_at)}{r.total ? ` · ${r.done}/${r.total}` : ''}{r.failed ? ` · ${r.failed} hata` : ''}</div>
              </div>
            </div>
          )) : <div className="muted small">Henüz otomasyon çalışmadı.</div>}
        </Card>
        <Card title="Yaklaşan görevler" actions={<Btn size="sm" variant="ghost" onClick={() => go('followup')}>Tümü</Btn>}>
          {d.upcomingTasks.length ? d.upcomingTasks.map((t: any) => (
            <div key={t.id} className="list-item small">
              <Badge tone={t.priority === 'urgent' || t.priority === 'high' ? 'danger' : 'neutral'}>{t.due_at ? fmtDate(t.due_at) : 'Tarihsiz'}</Badge>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="ellipsis">{t.title}</div>
                {t.company_name && <div className="tiny muted">{t.company_name}</div>}
              </div>
            </div>
          )) : <div className="muted small">Açık görev yok.</div>}
        </Card>
      </div>

      <div className="grid g2">
        <Card title="Başarısız görevler">
          {d.failedTasks.length ? d.failedTasks.map((r: any) => (
            <div key={r.id} className="list-item small">
              <Badge tone="danger">{RUN_STATUS[r.status]?.[0]}</Badge>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="ellipsis">{r.title}</div>
                <div className="tiny muted ellipsis">{r.error}</div>
              </div>
              <Btn size="sm" onClick={() => go('automations', { run: r.id })}>Aç</Btn>
            </div>
          )) : <div className="muted small">Başarısız görev yok.</div>}
        </Card>
        <Card title="Son oluşturulan raporlar" actions={<Btn size="sm" variant="ghost" onClick={() => go('files')}>Dosya Merkezi</Btn>}>
          {d.recentReports.length ? d.recentReports.map((f: any) => (
            <div key={f.id} className="list-item small">
              <Badge tone="info">{f.kind === 'offer_pdf' ? 'Teklif' : f.kind === 'research_report' ? 'Araştırma' : 'Analiz'}</Badge>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="ellipsis">{f.company_name ?? f.name}</div>
                <div className="tiny muted">{fmtRel(f.created_at)}</div>
              </div>
              <Btn size="sm" onClick={() => window.api.invoke('shell:openPath', { path: f.path })}>Aç</Btn>
            </div>
          )) : <div className="muted small">Henüz rapor yok.</div>}
        </Card>
      </div>
    </div>
  )
}
