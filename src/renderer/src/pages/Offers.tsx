// Teklif ve Satış Yönetimi: teklifler, düzenlenebilir hizmet kataloğu, satış hunisi.

import { useEffect, useMemo, useState } from 'react'
import { Plus, FileDown, Trash2, Save } from 'lucide-react'
import { call, useApi } from '../lib/api'
import { useNav } from '../lib/nav'
import { Badge, Btn, Callout, Card, Empty, Field, Modal, Tabs, useAction } from '../components/ui'
import { DataTable } from '../components/DataTable'
import { RobotHint } from '../robot/Robot'
import { OFFER_STATUSES, SALES_FUNNEL } from '@shared/constants'
import { computeTotals } from '@shared/offer-math'
import { fmtDate, fmtMoney } from '../lib/format'
import type { PageProps } from '../lib/page'

/* eslint-disable @typescript-eslint/no-explicit-any */
const ST_TONE: Record<string, string> = { draft: 'neutral', sent: 'info', negotiation: 'warning', won: 'success', lost: 'danger', expired: 'neutral' }

export default function Offers({ params }: PageProps) {
  const [tab, setTab] = useState<'offers' | 'catalog'>('offers')
  const { data: offers, reload } = useApi<any[]>('offers:list', {}, ['offers'])
  const [edit, setEdit] = useState<{ id?: number; companyId?: number } | null>(params.offerId ? { id: params.offerId as number } : params.new ? { companyId: params.companyId as number } : null)
  const { openCompany } = useNav()
  const { run } = useAction()
  const funnel = useMemo(() => {
    const by = (s: string) => (offers ?? []).filter((o) => o.status === s)
    return [['Taslak', by('draft')], ['Gönderildi', by('sent')], ['Müzakere', by('negotiation')], ['Kazanıldı', by('won')], ['Kaybedildi', by('lost')]] as [string, any[]][]
  }, [offers])
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="page-head">
        <div>
          <h1>Teklif ve Satış Yönetimi</h1>
          <p>Satış aşamaları: {SALES_FUNNEL.join(' → ')}. Fiyatlar sabit değildir; katalogdan düzenlenir.</p>
        </div>
        <div className="actions"><Btn variant="primary" icon={<Plus />} onClick={() => setEdit({})}>Yeni teklif</Btn></div>
      </div>
      <Tabs value={tab} onChange={setTab} items={[{ key: 'offers', label: 'Teklifler' }, { key: 'catalog', label: 'Hizmet kataloğu' }]} />
      {tab === 'offers' && (
        <>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
            {funnel.map(([l, list]) => (
              <div key={l} className="card stat">
                <div className="label">{l}</div>
                <div className="value">{list.length}</div>
                <div className="sub">{fmtMoney(list.reduce((s, o) => s + o.total, 0))}</div>
              </div>
            ))}
          </div>
          <Card pad={false}>
            <DataTable
              id="offers"
              rows={offers ?? []}
              onRowClick={(r) => setEdit({ id: r.id })}
              empty={<Empty title="Henüz teklif yok" robot={<RobotHint text="İlgilenen bir şirket için teklif hazırlayın; hizmetleri katalogdan seçip KDV ve indirimle hesaplayabilirsiniz." />} />}
              cols={[
                { key: 'number', header: 'No', width: 130, render: (r) => <b>{r.number}</b> },
                { key: 'company_name', header: 'Şirket', width: 200, render: (r) => <a href="#" onClick={(e) => (e.preventDefault(), e.stopPropagation(), openCompany(r.company_id))}>{r.company_name}</a> },
                { key: 'title', header: 'Başlık', width: 240 },
                { key: 'status', header: 'Durum', width: 120, render: (r) => <Badge tone={ST_TONE[r.status]}>{OFFER_STATUSES.find((s) => s.key === r.status)?.label ?? r.status}</Badge> },
                { key: 'total', header: 'Toplam', width: 130, render: (r) => fmtMoney(r.total, r.currency) },
                { key: 'valid_until', header: 'Geçerlilik', width: 120, render: (r) => fmtDate(r.valid_until) },
                { key: 'created_at', header: 'Oluşturma', width: 120, render: (r) => fmtDate(r.created_at) },
                { key: 'pdf', header: '', width: 90, render: (r) => <Btn size="sm" icon={<FileDown />} onClick={(e) => (e.stopPropagation(), void run(() => call<string>('offers:pdf', { id: r.id }), 'PDF oluşturuldu').then((p) => p && call('shell:openPath', { path: p })))}>PDF</Btn> }
              ]}
            />
          </Card>
        </>
      )}
      {tab === 'catalog' && <Catalog />}
      {edit && <OfferEditor id={edit.id} companyId={edit.companyId} onClose={() => (setEdit(null), reload())} />}
    </div>
  )
}

function Catalog() {
  const { data, reload } = useApi<any[]>('services:list', { all: true }, ['offers'])
  const [rows, setRows] = useState<any[]>([])
  useEffect(() => setRows(data ?? []), [data])
  const { run } = useAction()
  const upd = (i: number, k: string, v: unknown) => setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: v, _dirty: true } : x)))
  return (
    <Card title="Hizmet kataloğu" actions={<Btn size="sm" icon={<Plus />} onClick={() => setRows((r) => [...r, { name: 'Yeni hizmet', description: '', unit: 'proje', price: null, vat_rate: 20, active: 1, _dirty: true }])}>Hizmet ekle</Btn>}>
      <Callout>Fiyat alanını boş bırakabilirsiniz; teklif hazırlarken girilir. Değişiklikler yalnızca yeni tekliflere yansır.</Callout>
      <table className="dt" style={{ marginTop: 12 }}>
        <colgroup><col style={{ width: 220 }} /><col /><col style={{ width: 100 }} /><col style={{ width: 130 }} /><col style={{ width: 80 }} /><col style={{ width: 70 }} /><col style={{ width: 90 }} /></colgroup>
        <thead><tr><th>Hizmet</th><th>Açıklama</th><th>Birim</th><th>Fiyat (TL, KDV hariç)</th><th>KDV %</th><th>Aktif</th><th /></tr></thead>
        <tbody>
          {rows.map((s, i) => (
            <tr key={s.id ?? `n${i}`}>
              <td><input className="input" value={s.name} onChange={(e) => upd(i, 'name', e.target.value)} /></td>
              <td><input className="input" value={s.description ?? ''} onChange={(e) => upd(i, 'description', e.target.value)} /></td>
              <td><input className="input" value={s.unit ?? ''} onChange={(e) => upd(i, 'unit', e.target.value)} /></td>
              <td><input className="input" type="number" min={0} value={s.price ?? ''} placeholder="belirtilmedi" onChange={(e) => upd(i, 'price', e.target.value === '' ? null : Number(e.target.value))} /></td>
              <td><input className="input" type="number" min={0} max={100} value={s.vat_rate} onChange={(e) => upd(i, 'vat_rate', Number(e.target.value))} /></td>
              <td><input type="checkbox" checked={!!s.active} onChange={(e) => upd(i, 'active', e.target.checked ? 1 : 0)} style={{ accentColor: 'var(--brand)' }} aria-label="Aktif" /></td>
              <td>{s._dirty && <Btn size="sm" icon={<Save />} onClick={() => run(() => call('services:save', { id: s.id, name: s.name, description: s.description, unit: s.unit, price: s.price, vatRate: s.vat_rate, active: !!s.active }), 'Kaydedildi').then(reload)}>Kaydet</Btn>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

function OfferEditor({ id, companyId, onClose }: { id?: number; companyId?: number; onClose: () => void }) {
  const { data: existing } = useApi<any>(id ? 'offers:get' : null, { id }, [])
  const { data: services } = useApi<any[]>('services:list', undefined, [])
  const { data: companies } = useApi<{ rows: any[] }>('companies:list', { limit: 2000, sort: 'name', dir: 'asc' }, [])
  const [f, setF] = useState<any>({ companyId: companyId ?? '', title: 'Web sitesi yenileme teklifi', status: 'draft', currency: 'TRY', discountType: 'none', discountValue: 0, vatIncluded: false, deliveryEstimate: '', validUntil: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10), paymentTerms: '%50 sipariş onayında, %50 teslimde.', notes: '', analysisSummary: '', nextSteps: '', items: [] as any[] })
  const { run, busy } = useAction()
  useEffect(() => {
    if (existing) setF({ id: existing.id, companyId: existing.company_id, title: existing.title, status: existing.status, currency: existing.currency, discountType: existing.discount_type, discountValue: existing.discount_value, vatIncluded: !!existing.vat_included, deliveryEstimate: existing.delivery_estimate ?? '', validUntil: existing.valid_until ?? '', paymentTerms: existing.payment_terms ?? '', notes: existing.notes ?? '', analysisSummary: existing.analysis_summary ?? '', nextSteps: existing.next_steps ?? '', items: existing.items.map((i: any) => ({ serviceId: i.service_id, name: i.name, description: i.description, quantity: i.quantity, unit: i.unit, unitPrice: i.unit_price, vatRate: i.vat_rate })) })
  }, [existing])
  const t = computeTotals(f.items, f.discountType, Number(f.discountValue) || 0, f.vatIncluded)
  const setItem = (i: number, k: string, v: unknown) => setF({ ...f, items: f.items.map((x: any, j: number) => (j === i ? { ...x, [k]: v } : x)) })
  const addService = (sid: string) => {
    const s = services?.find((x) => String(x.id) === sid)
    if (s) setF({ ...f, items: [...f.items, { serviceId: s.id, name: s.name, description: s.description, quantity: 1, unit: s.unit, unitPrice: s.price ?? 0, vatRate: s.vat_rate }] })
  }
  const save = async () => {
    const newId = await run(() => call<number>('offers:save', { ...f, companyId: Number(f.companyId), discountValue: Number(f.discountValue) || 0, validUntil: f.validUntil || null, deliveryEstimate: f.deliveryEstimate || null, items: f.items.map((i: any) => ({ ...i, quantity: Number(i.quantity), unitPrice: Number(i.unitPrice), vatRate: Number(i.vatRate) })) }), 'Teklif kaydedildi')
    if (newId) setF((x: any) => ({ ...x, id: newId }))
    return newId
  }
  return (
    <Modal title={existing ? `Teklif ${existing.number}` : 'Yeni teklif'} onClose={onClose} size="xl" footer={<>
      {f.id && f.status === 'draft' && <Btn variant="danger" icon={<Trash2 />} onClick={() => run(() => call('offers:delete', { id: f.id }), 'Teklif silindi').then(onClose)}>Sil</Btn>}
      <div className="spacer" />
      <Btn onClick={onClose}>Kapat</Btn>
      <Btn icon={<FileDown />} disabled={busy || !f.companyId || !f.items.length} onClick={async () => { const oid = f.id ?? (await save()); if (oid) { const p = await run(() => call<string>('offers:pdf', { id: oid }), 'PDF oluşturuldu'); if (p) void call('shell:openPath', { path: p }) } }}>Kaydet ve PDF</Btn>
      <Btn variant="primary" icon={<Save />} disabled={busy || !f.companyId || !f.items.length} onClick={save}>Kaydet</Btn>
    </>}>
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr)', alignItems: 'start' }}>
        <div className="col" style={{ gap: 12 }}>
          <div className="grid g2">
            <Field label="Müşteri"><select className="select" value={f.companyId} onChange={(e) => setF({ ...f, companyId: e.target.value })}><option value="">Seçin</option>{companies?.rows.map((c) => <option key={c.id} value={c.id}>{c.name}{c.city ? ` (${c.city})` : ''}</option>)}</select></Field>
            <Field label="Teklif başlığı"><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          </div>
          <Card title="Hizmet kalemleri" actions={<select className="select" style={{ width: 240, minHeight: 30, padding: '2px 8px' }} value="" onChange={(e) => addService(e.target.value)} aria-label="Hizmet ekle"><option value="">+ Katalogdan hizmet ekle</option>{services?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}>
            {!f.items.length && <div className="muted small">Katalogdan hizmet ekleyin.</div>}
            {f.items.map((it: any, i: number) => (
              <div key={i} className="grid" style={{ gridTemplateColumns: '2fr 70px 90px 120px 70px 36px', gap: 8, marginBottom: 8, alignItems: 'end' }}>
                <Field label={i === 0 ? 'Hizmet / açıklama' : ''}><input className="input" value={it.name} onChange={(e) => setItem(i, 'name', e.target.value)} /><input className="input" value={it.description ?? ''} placeholder="Açıklama" onChange={(e) => setItem(i, 'description', e.target.value)} /></Field>
                <Field label={i === 0 ? 'Miktar' : ''}><input className="input" type="number" min={0} value={it.quantity} onChange={(e) => setItem(i, 'quantity', e.target.value)} /></Field>
                <Field label={i === 0 ? 'Birim' : ''}><input className="input" value={it.unit ?? ''} onChange={(e) => setItem(i, 'unit', e.target.value)} /></Field>
                <Field label={i === 0 ? 'Birim fiyat' : ''}><input className="input" type="number" min={0} value={it.unitPrice} onChange={(e) => setItem(i, 'unitPrice', e.target.value)} /></Field>
                <Field label={i === 0 ? 'KDV %' : ''}><input className="input" type="number" min={0} value={it.vatRate} onChange={(e) => setItem(i, 'vatRate', e.target.value)} /></Field>
                <Btn variant="ghost" icon={<Trash2 />} aria-label="Kalemi sil" onClick={() => setF({ ...f, items: f.items.filter((_: any, j: number) => j !== i) })} />
              </div>
            ))}
          </Card>
          <div className="grid g2">
            <Field label="Tahmini teslim süresi"><input className="input" value={f.deliveryEstimate} onChange={(e) => setF({ ...f, deliveryEstimate: e.target.value })} placeholder="ör. 4-6 hafta" /></Field>
            <Field label="Teklif geçerlilik tarihi"><input className="input" type="date" value={f.validUntil} onChange={(e) => setF({ ...f, validUntil: e.target.value })} /></Field>
          </div>
          <Field label="Ödeme koşulları"><textarea className="textarea" style={{ minHeight: 60 }} value={f.paymentTerms} onChange={(e) => setF({ ...f, paymentTerms: e.target.value })} /></Field>
          {f.items.some((i: any) => !(Number(i.unitPrice) > 0)) && <Callout tone="warn">Fiyatı girilmemiş kalem var. Fiyatları siz girip onaylamadan teklif "Gönderildi" yapılamaz; PDF "TASLAK" uyarısıyla oluşur.</Callout>}
          <Field label="Mevcut durum ve analiz özeti" hint="Analizden gelir; müşteriye gidecek metni kontrol edin."><textarea className="textarea" style={{ minHeight: 90 }} value={f.analysisSummary} onChange={(e) => setF({ ...f, analysisSummary: e.target.value })} /></Field>
          <Field label="Sonraki adımlar"><textarea className="textarea" style={{ minHeight: 70 }} value={f.nextSteps} onChange={(e) => setF({ ...f, nextSteps: e.target.value })} /></Field>
          <Field label="Ek açıklamalar"><textarea className="textarea" style={{ minHeight: 80 }} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        </div>
        <div className="col" style={{ gap: 12 }}>
          <Card title="Durum ve fiyatlandırma">
            <div className="col" style={{ gap: 10 }}>
              <Field label="Durum"><select className="select" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>{OFFER_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></Field>
              <Field label="İndirim">
                <div className="row">
                  <select className="select" style={{ width: 130 }} value={f.discountType} onChange={(e) => setF({ ...f, discountType: e.target.value })}><option value="none">Yok</option><option value="percent">Yüzde</option><option value="amount">Tutar</option></select>
                  <input className="input" type="number" min={0} disabled={f.discountType === 'none'} value={f.discountValue} onChange={(e) => setF({ ...f, discountValue: e.target.value })} />
                </div>
              </Field>
              <label className="check"><input type="checkbox" checked={f.vatIncluded} onChange={(e) => setF({ ...f, vatIncluded: e.target.checked })} />Birim fiyatlara KDV dahil</label>
              <hr className="sep" />
              <div className="kv"><div>Ara toplam</div><div>{fmtMoney(t.subtotal + t.discount, f.currency)}</div>{t.discount > 0 && <><div>İndirim</div><div>−{fmtMoney(t.discount, f.currency)}</div></>}<div>KDV</div><div>{fmtMoney(t.vatTotal, f.currency)}</div><div><b>Genel toplam</b></div><div><b style={{ fontSize: 18 }}>{fmtMoney(t.total, f.currency)}</b></div></div>
            </div>
          </Card>
          {existing?.history?.length > 0 && (
            <Card title="Teklif geçmişi">
              {existing.history.slice().reverse().map((h: any, i: number) => <div key={i} className="list-item small"><span style={{ flex: 1 }}>{h.note}</span><span className="tiny muted">{fmtDate(h.at, true)} · {fmtMoney(h.total)}</span></div>)}
            </Card>
          )}
        </div>
      </div>
    </Modal>
  )
}
