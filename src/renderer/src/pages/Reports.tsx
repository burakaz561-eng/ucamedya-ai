import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts'
import { FileText, Download } from 'lucide-react'
import { call, useApi } from '../lib/api'
import { Btn, Card, Loading, useAction } from '../components/ui'
import { fmtMoney } from '../lib/format'
import type { PageProps } from '../lib/page'

/* eslint-disable @typescript-eslint/no-explicit-any */
const COLORS = ['#e95a1b', '#3f3f46', '#f49a6a', '#255fb3', '#138a4f', '#9a9aa3', '#cc4a10', '#a1a1aa']
const tip = { contentStyle: { background: 'var(--bg-elev)', border: '1px solid var(--line)', borderRadius: 10 } }
const OFFER_LBL: Record<string, string> = { draft: 'Taslak', sent: 'Gönderildi', negotiation: 'Müzakere', won: 'Kazanıldı', lost: 'Kaybedildi', expired: 'Süresi doldu' }

function HBar({ data, height = 260 }: { data: { k: string; n: number }[]; height?: number }) {
  if (!data.length) return <div className="muted small">Veri yok.</div>
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ left: 10 }}>
          <XAxis type="number" allowDecimals={false} hide />
          <YAxis type="category" dataKey="k" width={190} tick={{ fontSize: 11, fill: 'var(--mute)' }} />
          <Tooltip {...tip} />
          <Bar dataKey="n" name="Adet" fill="#e95a1b" radius={[0, 6, 6, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export default function Reports(_: PageProps) {
  const { data: d } = useApi<any>('reports:sales', undefined, ['*'])
  const { data: researches } = useApi<any[]>('research:list', undefined, ['research'])
  const { run } = useAction()
  if (!d) return <Loading />
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="page-head">
        <div>
          <h1>Raporlar ve Analitik</h1>
          <p>Tüm rakamlar veritabanındaki gerçek kayıtlardan hesaplanır.</p>
        </div>
        <div className="actions">
          <Btn icon={<Download />} onClick={() => run(() => call<string | null>('companies:export', { format: 'xlsx', filters: {} }), (p) => (p ? `Excel kaydedildi: ${p}` : 'İptal edildi'))}>Müşteri listesi + bulgular (Excel)</Btn>
        </div>
      </div>
      <div className="grid g2">
        <Card title="Satış hunisi (aşama bazında şirket)"><HBar data={d.funnel.filter((x: any) => x.n > 0)} height={320} /></Card>
        <Card title="En sık görülen web sitesi sorunları"><HBar data={d.topIssues} height={320} /></Card>
      </div>
      <div className="grid g3">
        <Card title="İletişim performansı">
          {d.channels.length ? (
            <table className="dt"><thead><tr><th>Kanal</th><th>Gönderilen</th><th>Başarısız</th><th>Engellenen</th><th>Test</th><th>Yanıt</th></tr></thead>
              <tbody>{d.channels.map((c: any) => <tr key={c.k}><td>{c.k === 'email' ? 'E-posta' : 'WhatsApp'}</td><td>{c.sent}</td><td>{c.failed}</td><td>{c.blocked}</td><td>{c.test}</td><td>{d.replies.find((r: any) => r.k === c.k)?.n ?? 0}</td></tr>)}</tbody>
            </table>
          ) : <div className="muted small">Henüz gönderim yok.</div>}
        </Card>
        <Card title="Teklifler">
          {d.offers.length ? (
            <div style={{ height: 220 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={d.offers.map((o: any) => ({ name: OFFER_LBL[o.k] ?? o.k, value: o.n, total: o.total }))} dataKey="value" innerRadius={50} outerRadius={80} paddingAngle={2}>
                    {d.offers.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip {...tip} formatter={(v: any, _n: any, p: any) => [`${v} teklif · ${fmtMoney(p.payload.total)}`, p.payload.name]} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : <div className="muted small">Teklif yok.</div>}
        </Card>
        <Card title="Sektör dağılımı"><HBar data={d.bySector} height={220} /></Card>
      </div>
      <div className="grid g2">
        <Card title="Şehir dağılımı"><HBar data={d.byCity} /></Card>
        <Card title="Toplu araştırma raporları (PDF)">
          {researches?.length ? researches.map((r) => (
            <div key={r.id} className="list-item small">
              <span style={{ flex: 1 }} className="ellipsis">{r.name}</span>
              <span className="tiny muted">{r.found} şirket</span>
              <Btn size="sm" icon={<FileText />} onClick={() => run(() => call('research:report', { id: r.id }), 'Rapor hazırlanıyor; Dosya Merkezi’ne eklenecek')}>Rapor oluştur</Btn>
            </div>
          )) : <div className="muted small">Araştırma yok.</div>}
        </Card>
      </div>
    </div>
  )
}
