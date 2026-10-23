import { useState } from 'react'
import { FolderOpen, RefreshCw } from 'lucide-react'
import { call, useApi } from '../lib/api'
import { useNav } from '../lib/nav'
import { Badge, Btn, Card, useAction } from '../components/ui'
import { DataTable } from '../components/DataTable'
import { fmtBytes, fmtDate } from '../lib/format'
import type { PageProps } from '../lib/page'

/* eslint-disable @typescript-eslint/no-explicit-any */
const KINDS: Record<string, string> = { screenshot: 'Ekran görüntüsü', analysis_json: 'Analiz verisi', report_pdf: 'Analiz raporu (PDF)', draft: 'İletişim taslağı', offer_pdf: 'Teklif (PDF)', export: 'Dışa aktarım', attachment: 'Ek', company_json: 'Şirket kaydı', research_report: 'Araştırma raporu' }

export default function Files(_: PageProps) {
  const [f, setF] = useState<{ q?: string; kind?: string; from?: string; to?: string }>({})
  const { data, reload } = useApi<any[]>('files:list', f, ['files', 'analyses'])
  const { openCompany } = useNav()
  const { run } = useAction()
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="page-head">
        <div>
          <h1>Dosya Merkezi</h1>
          <p>Şirket klasörleri, ekran görüntüleri, raporlar, taslaklar, teklifler ve dışa aktarımlar. Liste veritabanıyla senkron tutulur.</p>
        </div>
        <div className="actions">
          <Btn icon={<RefreshCw />} onClick={() => run(() => call<any>('files:reconcile'), (r) => `Senkronize edildi: ${r.added} eklendi, ${r.removed} eksik kayıt temizlendi`).then(reload)}>Diskle senkronize et</Btn>
          <Btn variant="primary" icon={<FolderOpen />} onClick={() => run(() => call('files:openRoot'))}>Veri klasörünü aç</Btn>
        </div>
      </div>
      <Card>
        <div className="row wrap">
          <input className="input" style={{ width: 260 }} placeholder="Dosya veya şirket adı" value={f.q ?? ''} onChange={(e) => setF({ ...f, q: e.target.value || undefined })} />
          <select className="select" style={{ width: 220 }} value={f.kind ?? ''} onChange={(e) => setF({ ...f, kind: e.target.value || undefined })} aria-label="Tür"><option value="">Tüm türler</option>{Object.entries(KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <label className="small muted">Başlangıç</label><input className="input" type="date" style={{ width: 160 }} value={f.from ?? ''} onChange={(e) => setF({ ...f, from: e.target.value || undefined })} />
          <label className="small muted">Bitiş</label><input className="input" type="date" style={{ width: 160 }} value={f.to ?? ''} onChange={(e) => setF({ ...f, to: e.target.value || undefined })} />
        </div>
      </Card>
      <Card pad={false}>
        <DataTable id="files" rows={data ?? []} onRowClick={(r) => call('shell:openPath', { path: r.path })}
          empty={<div className="muted small" style={{ padding: 16 }}>Dosya yok.</div>}
          cols={[
            { key: 'name', header: 'Dosya', width: 260, render: (r) => <b className="ellipsis">{r.name}</b> },
            { key: 'kind', header: 'Tür', width: 170, render: (r) => <Badge>{KINDS[r.kind] ?? r.kind}</Badge> },
            { key: 'company_name', header: 'Şirket', width: 200, render: (r) => (r.company_id ? <a href="#" onClick={(e) => (e.preventDefault(), e.stopPropagation(), openCompany(r.company_id))}>{r.company_name}</a> : '—') },
            { key: 'bytes', header: 'Boyut', width: 90, sortValue: (r) => r.bytes, render: (r) => fmtBytes(r.bytes) },
            { key: 'created_at', header: 'Tarih', width: 140, render: (r) => fmtDate(r.created_at, true) },
            { key: 'path', header: 'Konum', width: 300, hidden: true, render: (r) => <span className="tiny muted">{r.path}</span> },
            { key: 'x', header: '', width: 150, render: (r) => <Btn size="sm" variant="ghost" onClick={(e) => (e.stopPropagation(), void call('shell:showItem', { path: r.path }))}>{window.api.platform === 'darwin' ? "Finder'da göster" : 'Klasörde göster'}</Btn> }
          ]}
        />
      </Card>
    </div>
  )
}
