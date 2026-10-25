// Müşteri Havuzu (CRM): filtreler, kayıtlı filtreler, toplu işlemler, içe/dışa aktarma, tekrar bulma ve birleştirme.

import { useMemo, useState } from 'react'
import { Plus, Download, ScanSearch, Sparkles, Archive, Copy, Filter, Save, Upload, RefreshCw } from 'lucide-react'
import { call, useApi } from '../lib/api'
import { useNav } from '../lib/nav'
import { Badge, Btn, Card, Empty, Field, Loading, Modal, useAction, useConfirm } from '../components/ui'
import { DataTable } from '../components/DataTable'
import { RobotHint } from '../robot/Robot'
import { SECTORS, PRIORITY_GROUPS } from '@shared/constants'
import { GROUP_LABELS, GROUP_TONE, SITE_STATUS, fmtDate, oppTone } from '../lib/format'
import type { PageProps } from '../lib/page'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Filters = { q?: string; stage?: string; group?: string; sector?: string; city?: string; websiteStatus?: string; minScore?: number; tag?: string; archived?: boolean; researchId?: number; sort?: string; dir?: 'asc' | 'desc' }

function loadSaved(): { name: string; f: Filters }[] {
  try {
    return JSON.parse(localStorage.getItem('saved-filters:companies') ?? '[]')
  } catch {
    return []
  }
}

export default function Companies({ params }: PageProps) {
  const [f, setF] = useState<Filters>({ sort: 'score', dir: 'desc', ...(params as Filters) })
  const { data, loading } = useApi<{ rows: any[]; total: number }>('companies:list', { ...f, limit: 2000 }, ['companies', 'analyses', 'research', 'drafts', 'outreach'])
  const { data: stages } = useApi<any[]>('stages:list', undefined, [])
  const [sel, setSel] = useState<Set<number>>(new Set())
  const [add, setAdd] = useState(false)
  const [dups, setDups] = useState(false)
  const [saved, setSaved] = useState(loadSaved)
  const { openCompany, go } = useNav()
  const { run } = useAction()
  const { ask, node } = useConfirm()
  const cities = useMemo(() => [...new Set((data?.rows ?? []).map((r) => r.city).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr')), [data])
  const ids = [...sel]
  const [filterName, setFilterName] = useState<string | null>(null)
  const saveFilter = (name: string) => {
    if (!name.trim()) return
    setFilterName(null)
    const next = [...saved.filter((s) => s.name !== name), { name, f }]
    setSaved(next)
    localStorage.setItem('saved-filters:companies', JSON.stringify(next))
  }

  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="page-head">
        <div>
          <h1>Müşteri Havuzu</h1>
          <p>{data ? `${data.total} şirket` : '…'} · Fırsat puanı şirketin mali gücünü veya satın alma niyetini göstermez; gerekçeleri her kartta görünür.</p>
        </div>
        <div className="actions">
          <Btn icon={<Copy />} onClick={() => setDups(true)}>Yinelenenleri bul</Btn>
          <Btn icon={<Upload />} onClick={() => go('finder')}>İçe aktar</Btn>
          <Btn icon={<Download />} onClick={() => run(() => call<string | null>('companies:export', { format: 'xlsx', filters: f }), (p) => (p ? `Excel kaydedildi: ${p}` : 'İptal edildi'))}>Excel</Btn>
          <Btn icon={<Download />} onClick={() => run(() => call<string | null>('companies:export', { format: 'csv', filters: f }), (p) => (p ? `CSV kaydedildi: ${p}` : 'İptal edildi'))}>CSV</Btn>
          <Btn variant="primary" icon={<Plus />} onClick={() => setAdd(true)}>Şirket ekle</Btn>
        </div>
      </div>

      <Card>
        <div className="row wrap" style={{ gap: 8 }}>
          <Filter size={16} className="muted" />
          <input className="input" style={{ width: 220 }} placeholder="Ara: ad, alan adı, e-posta…" value={f.q ?? ''} onChange={(e) => setF({ ...f, q: e.target.value || undefined })} />
          <select className="select" style={{ width: 190 }} value={f.group ?? ''} onChange={(e) => setF({ ...f, group: e.target.value || undefined })} aria-label="Grup">
            <option value="">Tüm gruplar</option>
            {PRIORITY_GROUPS.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
          </select>
          <select className="select" style={{ width: 180 }} value={f.stage ?? ''} onChange={(e) => setF({ ...f, stage: e.target.value || undefined })} aria-label="Aşama">
            <option value="">Tüm aşamalar</option>
            {stages?.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <select className="select" style={{ width: 160 }} value={f.sector ?? ''} onChange={(e) => setF({ ...f, sector: e.target.value || undefined })} aria-label="Sektör">
            <option value="">Tüm sektörler</option>
            {SECTORS.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select className="select" style={{ width: 140 }} value={f.city ?? ''} onChange={(e) => setF({ ...f, city: e.target.value || undefined })} aria-label="Şehir">
            <option value="">Tüm şehirler</option>
            {cities.map((c) => <option key={c}>{c}</option>)}
          </select>
          <select className="select" style={{ width: 170 }} value={f.websiteStatus ?? ''} onChange={(e) => setF({ ...f, websiteStatus: e.target.value || undefined })} aria-label="Site durumu">
            <option value="">Tüm site durumları</option>
            {Object.entries(SITE_STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <input className="input" type="number" style={{ width: 110 }} placeholder="Min. puan" value={f.minScore ?? ''} onChange={(e) => setF({ ...f, minScore: e.target.value ? Number(e.target.value) : undefined })} />
          <input className="input" style={{ width: 120 }} placeholder="Etiket" value={f.tag ?? ''} onChange={(e) => setF({ ...f, tag: e.target.value || undefined })} />
          <label className="check small"><input type="checkbox" checked={!!f.archived} onChange={(e) => setF({ ...f, archived: e.target.checked || undefined })} />Arşiv</label>
          <div className="spacer" />
          <select className="select" style={{ width: 170 }} value="" onChange={(e) => { const s = saved.find((x) => x.name === e.target.value); if (s) setF(s.f) }} aria-label="Kayıtlı filtreler">
            <option value="">Kayıtlı filtreler…</option>
            {saved.map((s) => <option key={s.name}>{s.name}</option>)}
          </select>
          <Btn size="sm" icon={<Save />} onClick={() => setFilterName('')}>Kaydet</Btn>
          <Btn size="sm" variant="ghost" onClick={() => setF({ sort: 'score', dir: 'desc' })}>Temizle</Btn>
        </div>
      </Card>

      <Card pad={false}>
        {loading && !data ? <Loading /> : (
          <DataTable
            id="companies"
            rows={data?.rows ?? []}
            selectable
            selected={sel}
            onSelect={setSel}
            onRowClick={(r) => openCompany(r.id)}
            toolbar={sel.size > 0 && (
              <div className="row wrap" style={{ gap: 6 }}>
                <Btn size="sm" icon={<ScanSearch />} onClick={() => run(() => call('analysis:runCompanies', { ids }), `${ids.length} şirket analiz kuyruğuna alındı`)}>Analiz et</Btn>
                <Btn size="sm" icon={<Sparkles />} onClick={() => run(() => call('drafts:createBulk', { companyIds: ids, channels: ['email', 'whatsapp'], tone: 'professional' }), 'Taslaklar hazırlanıyor')}>Taslak oluştur</Btn>
                <select className="select" style={{ width: 170, minHeight: 30, padding: '2px 8px' }} value="" onChange={(e) => e.target.value && run(() => call('companies:bulkStage', { ids, stage: e.target.value }), 'Aşama güncellendi')} aria-label="Aşama değiştir">
                  <option value="">Aşamayı değiştir…</option>
                  {stages?.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
                <Btn size="sm" icon={<RefreshCw />} onClick={() => run(() => call('companies:rescore', { ids }), 'Puanlar yeniden hesaplandı')}>Puanla</Btn>
                <Btn size="sm" icon={<Archive />} onClick={async () => (await ask('Seçilenler arşivlensin mi?', `${ids.length} şirket arşive taşınır. Veriler silinmez; Arşiv filtresinden geri alınabilir.`)) && run(() => call('companies:archive', { ids, archived: !f.archived }), f.archived ? 'Arşivden çıkarıldı' : 'Arşivlendi').then(() => setSel(new Set()))}>{f.archived ? 'Arşivden çıkar' : 'Arşivle'}</Btn>
              </div>
            )}
            empty={<Empty title="Kayıt bulunamadı" robot={<RobotHint text="Filtrelere uyan şirket yok. Yeni bir araştırma başlatabilir veya şirketi elle ekleyebilirsiniz." />} />}
            cols={[
              { key: 'name', header: 'Şirket', width: 230, render: (r) => <div><div className="ellipsis" style={{ fontWeight: 600 }}>{r.name}</div><div className="tiny muted ellipsis">{r.domain ?? 'web sitesi yok'}</div></div> },
              { key: 'opportunity_score', header: 'Puan', width: 70, render: (r) => (r.opportunity_score != null ? <span className={`score-pill badge ${oppTone(r.opportunity_score)}`}>{r.opportunity_score}</span> : '—') },
              { key: 'priority_group', header: 'Grup', width: 170, render: (r) => (r.priority_group ? <Badge tone={GROUP_TONE[r.priority_group]}>{GROUP_LABELS[r.priority_group]}</Badge> : '—') },
              { key: 'stage_label', header: 'Aşama', width: 150, render: (r) => <Badge tone={r.stage_color}>{r.stage_label}</Badge> },
              { key: 'sector', header: 'Sektör', width: 120 },
              { key: 'city', header: 'Şehir', width: 110, render: (r) => [r.district, r.city].filter(Boolean).join(', ') || '—' },
              { key: 'website_status', header: 'Site', width: 130, render: (r) => <Badge tone={SITE_STATUS[r.website_status]?.[1]}>{SITE_STATUS[r.website_status]?.[0] ?? r.website_status}</Badge> },
              { key: 'email', header: 'E-posta', width: 190, render: (r) => r.email ?? '—' },
              { key: 'phone', header: 'Telefon', width: 140, render: (r) => r.phone ?? '—' },
              { key: 'potential_services', header: 'Potansiyel hizmetler', width: 220, hidden: true, render: (r) => r.potential_services.join(', ') || '—' },
              { key: 'tags', header: 'Etiketler', width: 140, render: (r) => r.tags ?? '' },
              { key: 'owner', header: 'Sorumlu', width: 110, hidden: true, render: (r) => r.owner ?? '—' },
              { key: 'next_action', header: 'Sonraki işlem', width: 180, hidden: true, render: (r) => r.next_action ?? '—' },
              { key: 'last_analysis_at', header: 'Son analiz', width: 120, render: (r) => fmtDate(r.last_analysis_at) },
              { key: 'created_at', header: 'Eklenme', width: 120, hidden: true, render: (r) => fmtDate(r.created_at) }
            ]}
          />
        )}
      </Card>
      {add && <AddCompany onClose={() => setAdd(false)} onCreated={(id) => (setAdd(false), openCompany(id))} />}
      {dups && <Duplicates onClose={() => setDups(false)} />}
      {filterName != null && (
        <Modal title="Filtreyi kaydet" onClose={() => setFilterName(null)} footer={<Btn variant="primary" disabled={!filterName.trim()} onClick={() => saveFilter(filterName)}>Kaydet</Btn>}>
          <Field label="Filtre adı"><input className="input" autoFocus value={filterName} onChange={(e) => setFilterName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveFilter(filterName)} /></Field>
        </Modal>
      )}
      {node}
    </div>
  )
}

function AddCompany({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const [f, setF] = useState({ name: '', sector: '', city: '', district: '', website: '', phone: '', email: '', address: '' })
  const { data: cities } = useApi<{ name: string; districts: string[] }[]>('geo:cities', undefined, [])
  const { run, busy } = useAction()
  return (
    <Modal title="Şirket ekle" onClose={onClose} footer={<><Btn onClick={onClose}>Vazgeç</Btn><Btn variant="primary" disabled={busy || f.name.trim().length < 2} onClick={() => run(() => call<number>('companies:create', Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.trim() || null]))), 'Şirket eklendi').then((id) => id && onCreated(id))}>Ekle</Btn></>}>
      <div className="grid g2">
        <Field label="Şirket adı *"><input className="input" autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Sektör"><input className="input" list="sectors" value={f.sector} onChange={(e) => setF({ ...f, sector: e.target.value })} /><datalist id="sectors">{SECTORS.map((s) => <option key={s} value={s} />)}</datalist></Field>
        <Field label="İl"><select className="select" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value, district: '' })}><option value="" />{cities?.map((c) => <option key={c.name}>{c.name}</option>)}</select></Field>
        <Field label="İlçe"><select className="select" value={f.district} onChange={(e) => setF({ ...f, district: e.target.value })}><option value="" />{cities?.find((c) => c.name === f.city)?.districts.map((d) => <option key={d}>{d}</option>)}</select></Field>
        <Field label="Web sitesi"><input className="input" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} placeholder="ornek.com.tr" /></Field>
        <Field label="Telefon (şirketin yayımladığı)"><input className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="Kurumsal e-posta"><input className="input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Adres"><input className="input" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
      </div>
    </Modal>
  )
}

function Duplicates({ onClose }: { onClose: () => void }) {
  const { data, reload } = useApi<{ a: any; b: any; reason: string; uncertain?: boolean }[]>('companies:duplicates', undefined, ['companies'])
  const { run } = useAction()
  return (
    <Modal title="Yinelenen kayıtlar" sub="Aynı alan adı, telefon veya ad+şehir eşleşmeleri; yalnızca ad benzerliği olanlar onayınızı bekler. Birleştirme, tüm analiz, mesaj ve dosyaları korunan kayda taşır." onClose={onClose} size="wide">
      {!data ? <Loading /> : !data.length ? <div className="muted">Yinelenen kayıt bulunmadı.</div> : data.map((d, i) => (
        <div key={i} className="list-item">
          <div style={{ flex: 1 }}><b>{d.a.name}</b> <span className="muted small">#{d.a.id} · {d.a.city ?? '—'} · {d.a.domain ?? '—'}</span></div>
          <Badge tone={d.uncertain ? 'info' : 'warning'}>{d.reason}</Badge>
          <div style={{ flex: 1 }}><b>{d.b.name}</b> <span className="muted small">#{d.b.id} · {d.b.city ?? '—'} · {d.b.domain ?? '—'}</span></div>
          <Btn size="sm" onClick={() => run(() => call('companies:merge', { keep: d.a.id, drop: d.b.id }), 'Kayıtlar birleştirildi').then(reload)}>Soldakinde birleştir</Btn>
          <Btn size="sm" onClick={() => run(() => call('companies:merge', { keep: d.b.id, drop: d.a.id }), 'Kayıtlar birleştirildi').then(reload)}>Sağdakinde birleştir</Btn>
          <Btn size="sm" variant="ghost" onClick={() => run(() => call('companies:keepSeparate', { a: d.a.id, b: d.b.id }), 'Ayrı kayıt olarak bırakıldı').then(reload)}>Farklı şirketler</Btn>
        </div>
      ))}
    </Modal>
  )
}
