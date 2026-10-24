// AI Müşteri Bulucu: araştırma oluşturma + canlı ilerleme.

import { useEffect, useMemo, useState } from 'react'
import { Play, Upload, Plus, X, Radar } from 'lucide-react'
import { call, useApi } from '../lib/api'
import { useNav } from '../lib/nav'
import { Badge, Btn, Callout, Card, Chips, Field, Progress, useAction, useToast } from '../components/ui'
import { RobotHint } from '../robot/Robot'
import { CUSTOMER_TYPES, FINDING_CATEGORIES, MESSAGE_TONES, RESEARCH_TARGETS, SECTORS } from '@shared/constants'
import { RUN_STATUS, fmtRel } from '../lib/format'
import type { PageProps } from '../lib/page'
import { ResearchLive } from './Research'

/* eslint-disable @typescript-eslint/no-explicit-any */
export default function Finder({ settings }: PageProps) {
  const { data: cities } = useApi<{ code: string; name: string; districts: string[] }[]>('geo:cities', undefined, [])
  const { data: profiles } = useApi<any[]>('profiles:list', undefined, [])
  const { data: secrets } = useApi<Record<string, boolean>>('secrets:status', undefined, [])
  const { data: browsers } = useApi<{ kind: string; label: string }[]>('agent:browsers', undefined, [])
  const { data: researches } = useApi<any[]>('research:list', undefined, ['research', 'jobs'])
  const { go } = useNav()
  const toast = useToast()
  const { run, busy } = useAction()
  const [f, setF] = useState({
    name: '', sectors: [] as string[], customSector: '', locations: [] as { city: string; district?: string }[], city: '', district: '',
    customerTypes: [] as string[], analysisTypes: Object.keys(FINDING_CATEGORIES), targetCount: 25, provider: settings.search.provider,
    steps: { analyze: true, screenshots: true, pdf: true, drafts: true, contacts: true }, channels: ['email', 'whatsapp'] as ('email' | 'whatsapp')[], tone: 'professional', extraQueries: ''
  })
  const [watch, setWatch] = useState<number | null>(null)
  const providerKey = ({ google_places: 'google_places_key', serpapi: 'serpapi_key', brave: 'brave_key' } as Record<string, string>)[f.provider as string]
  const providerReady = f.provider === 'google_browser' ? !!browsers?.length : !!(providerKey && secrets?.[providerKey])
  const districts = useMemo(() => cities?.find((c) => c.name === f.city)?.districts ?? [], [cities, f.city])
  const active = researches?.find((r) => ['running', 'queued', 'paused'].includes(r.status))
  useEffect(() => {
    if (active && watch == null) setWatch(active.id)
  }, [active, watch])

  const applyProfile = (id: string) => {
    const p = profiles?.find((x) => String(x.id) === id)
    if (!p) return
    const c = p.config
    setF((x) => ({ ...x, name: p.name, sectors: c.sectors ?? [], locations: c.locations ?? [], customerTypes: c.customerTypes ?? [], analysisTypes: c.analysisTypes ?? x.analysisTypes, targetCount: c.targetCount ?? 25, steps: c.steps ?? x.steps, channels: c.channels ?? x.channels, tone: c.tone ?? 'professional', extraQueries: (c.extraQueries ?? []).join(', ') }))
  }
  const addLocation = () => {
    if (!f.city) return
    const loc = { city: f.city, ...(f.district ? { district: f.district } : {}) }
    if (f.locations.some((l) => l.city === loc.city && l.district === loc.district)) return
    setF({ ...f, locations: [...f.locations, loc], district: '' })
  }
  const sectors = [...f.sectors, ...(f.customSector.trim() ? [f.customSector.trim()] : [])]
  const autoName = `${sectors.join(', ') || 'Firmalar'} — ${f.locations.map((l) => l.district ?? l.city).join(', ') || 'Türkiye'}`
  const start = async () => {
    const id = await run(() => call<number>('research:start', {
      name: f.name.trim() || autoName, sectors, locations: f.locations, customerTypes: f.customerTypes, analysisTypes: f.analysisTypes, targetCount: Number(f.targetCount),
      provider: f.provider, extraQueries: f.extraQueries.split(',').map((s) => s.trim()).filter(Boolean), steps: f.steps, channels: f.channels, tone: f.tone
    }), 'Araştırma başlatıldı')
    if (id) setWatch(id)
  }
  const saveProfile = () =>
    run(() => call('profiles:save', { name: f.name.trim() || autoName, description: `${f.targetCount} şirket hedefi`, config: { sectors, locations: f.locations, customerTypes: f.customerTypes, analysisTypes: f.analysisTypes, extraQueries: f.extraQueries.split(',').map((s) => s.trim()).filter(Boolean), targetCount: f.targetCount, tone: f.tone, channels: f.channels, steps: f.steps, reportFormat: 'standard' } }), 'Otomasyon profili kaydedildi')
  const importCsv = async () => {
    const r = await run(() => call<any>('research:importCsv', { analyze: f.steps.analyze, drafts: f.steps.drafts }))
    if (r) {
      toast(`CSV içe aktarıldı: ${r.new} yeni, ${r.duplicate} yinelenen, ${r.skipped} atlanan kayıt.`)
      setWatch(r.researchId)
    }
  }

  return (
    <div className="col" style={{ gap: 18 }}>
      <div className="page-head">
        <div>
          <h1>AI Müşteri Bulucu</h1>
          <p>Sektör, konum ve fırsat türünü seçin; şirketleri bulup sitelerini inceleyeyim ve size öncelik sırasıyla sunayım.</p>
        </div>
        <div className="actions">
          <select className="select" style={{ width: 260 }} defaultValue="" onChange={(e) => applyProfile(e.target.value)} aria-label="Profil seç">
            <option value="">Kayıtlı profilden başla…</option>
            {profiles?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <Btn icon={<Upload />} onClick={importCsv} title="Şirket, il, web sitesi, telefon, e-posta sütunları olan CSV">CSV içe aktar</Btn>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1fr)', alignItems: 'start' }}>
        <Card title="Yeni araştırma" icon={<Radar size={18} color="var(--brand)" />}>
          <div className="col" style={{ gap: 16 }}>
            <Field label="Sektör">
              <Chips options={SECTORS.map((s) => ({ key: s, label: s }))} value={f.sectors} onChange={(v) => setF({ ...f, sectors: v })} />
              <input className="input" placeholder="Diğer sektör (kendiniz yazın, ör. 'Klima servisi')" value={f.customSector} onChange={(e) => setF({ ...f, customSector: e.target.value })} />
            </Field>
            <Field label="Konum" hint="Birden fazla il veya ilçe ekleyebilirsiniz. Boş bırakılırsa tüm Türkiye aranır.">
              <div className="row">
                <select className="select" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value, district: '' })} aria-label="İl">
                  <option value="">İl seçin</option>
                  {cities?.map((c) => <option key={c.code} value={c.name}>{c.name}</option>)}
                </select>
                <select className="select" value={f.district} onChange={(e) => setF({ ...f, district: e.target.value })} disabled={!f.city} aria-label="İlçe">
                  <option value="">Tüm ilçeler</option>
                  {districts.map((d) => <option key={d}>{d}</option>)}
                </select>
                <Btn icon={<Plus />} onClick={addLocation} disabled={!f.city}>Ekle</Btn>
              </div>
              <div className="chips">
                {f.locations.map((l, i) => (
                  <span key={i} className="chip on" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    {l.district ? `${l.district}, ${l.city}` : l.city}
                    <X size={13} style={{ cursor: 'pointer' }} onClick={() => setF({ ...f, locations: f.locations.filter((_, j) => j !== i) })} />
                  </span>
                ))}
              </div>
            </Field>
            <Field label="Müşteri türü (aradığınız fırsatlar)" hint="Seçilen fırsatlar puanlamada ağırlık kazanır.">
              <Chips options={CUSTOMER_TYPES.map((c) => ({ key: c.key, label: c.label }))} value={f.customerTypes} onChange={(v) => setF({ ...f, customerTypes: v })} />
            </Field>
            <div className="grid g2">
              <Field label="Araştırma hedefi" hint="Bu bir hedeftir; aramada bu sayıda geçerli şirket bulunacağı garanti edilmez.">
                <div className="row">
                  <div className="seg">
                    {RESEARCH_TARGETS.map((n) => <button key={n} className={f.targetCount === n ? 'on' : ''} onClick={() => setF({ ...f, targetCount: n })}>{n}</button>)}
                  </div>
                  <input className="input" type="number" min={1} max={500} style={{ width: 90 }} value={f.targetCount} onChange={(e) => setF({ ...f, targetCount: Number(e.target.value) })} aria-label="Özel hedef" />
                </div>
              </Field>
              <Field label="Arama sağlayıcısı">
                <select className="select" value={f.provider} onChange={(e) => setF({ ...f, provider: e.target.value as typeof f.provider })}>
                  <option value="google_browser">Google (bilgisayarınızdaki tarayıcı ile — API gerekmez)</option>
                  <option value="google_places">Google Places API (isteğe bağlı, anahtar gerekir)</option>
                  <option value="serpapi">SerpAPI (Google Haritalar)</option>
                  <option value="brave">Brave Search API</option>
                </select>
              </Field>
            </div>
            {!providerReady && (
              <Callout tone="warn">
                {f.provider === 'google_browser' ? 'Google Chrome veya Microsoft Edge bulunamadı; tarayıcı üzerinden arama yapılamaz.' : <>Bu sağlayıcının API anahtarı girilmemiş. Varsayılan seçenek olan <b>Google (tarayıcı ile)</b> anahtar gerektirmez; ya da <a href="#" onClick={(e) => (e.preventDefault(), go('integrations'))}>Entegrasyonlar</a>'dan anahtar ekleyin.</>}
              </Callout>
            )}
            <Field label="Analiz türü">
              <Chips options={Object.entries(FINDING_CATEGORIES).map(([k, l]) => ({ key: k, label: l }))} value={f.analysisTypes} onChange={(v) => setF({ ...f, analysisTypes: v })} />
            </Field>
            <Field label="Çıktılar">
              <div className="grid g2">
                {([['analyze', 'Web sitesi analizi'], ['screenshots', 'Ekran görüntüleri'], ['contacts', 'İletişim bilgilerini araştır'], ['pdf', 'PDF raporları'], ['drafts', 'Mesaj taslakları']] as const).map(([k, l]) => (
                  <label key={k} className="check"><input type="checkbox" checked={f.steps[k]} onChange={(e) => setF({ ...f, steps: { ...f.steps, [k]: e.target.checked } })} />{l}</label>
                ))}
              </div>
            </Field>
            {f.steps.drafts && (
              <div className="grid g2">
                <Field label="Taslak kanalları"><Chips options={[{ key: 'email', label: 'E-posta' }, { key: 'whatsapp', label: 'WhatsApp' }]} value={f.channels} onChange={(v) => setF({ ...f, channels: v as typeof f.channels })} /></Field>
                <Field label="Mesaj tonu">
                  <select className="select" value={f.tone} onChange={(e) => setF({ ...f, tone: e.target.value })}>{MESSAGE_TONES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select>
                </Field>
              </div>
            )}
            <div className="grid g2">
              <Field label="Araştırma adı"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={autoName} /></Field>
              <Field label="Arama kelimeleri" hint="Virgülle ayırın; her biri seçtiğiniz şehirlerle birlikte aranır (isteğe bağlı)"><input className="input" value={f.extraQueries} onChange={(e) => setF({ ...f, extraQueries: e.target.value })} placeholder="ör. prefabrik yapı, çelik konstrüksiyon" /></Field>
            </div>
            <Callout>
              {f.provider === 'google_browser' ? <>Arama, bilgisayarınızdaki tarayıcıda Google'a yazılarak yapılır; sorgular arasında bekleme vardır. Google doğrulama (CAPTCHA) isterse işlem durur ve sizin tamamlamanız beklenir. İlerlemeyi <a href="#" onClick={(e) => (e.preventDefault(), go('control'))}>Canlı Kontrol Merkezi</a>'nden izleyebilirsiniz.</> : 'Şirketler resmî arama API’sinden bulunur.'} Web siteleri robots.txt kurallarına uyularak ziyaret edilir. İletişim bilgileri şirketin kendi sitesinde veya sağlayıcıda yayımlanan kurumsal bilgilerle sınırlıdır ve kaynağıyla birlikte kaydedilir. Hiçbir mesaj sizin onayınız olmadan gönderilmez.
            </Callout>
            <div className="row">
              <Btn variant="primary" icon={<Play />} disabled={busy || !providerReady || (!sectors.length && !f.extraQueries.trim())} onClick={start}>Araştırmayı başlat</Btn>
              <Btn variant="ghost" onClick={saveProfile}>Profil olarak kaydet</Btn>
              <span className="muted small">Kısayol: Ctrl+N</span>
            </div>
          </div>
        </Card>

        <div className="col" style={{ gap: 16 }}>
          {watch ? (
            <ResearchLive id={watch} compact />
          ) : (
            <Card>
              <RobotHint text={<>Bir araştırma başlattığınızda her şirketin aşamasını burada canlı izleyebilirsiniz: <i>Şirket bulundu → Web sitesi tespit edildi → Analiz → Ekran görüntüleri → Profil → Tamamlandı</i>.</>} mood="idle" />
            </Card>
          )}
          <Card title="Son araştırmalar" actions={<Btn size="sm" variant="ghost" onClick={() => go('research')}>Tümü</Btn>}>
            {researches?.length ? researches.slice(0, 6).map((r) => (
              <div key={r.id} className="list-item small" style={{ cursor: 'pointer' }} onClick={() => setWatch(r.id)}>
                <Badge tone={RUN_STATUS[r.status]?.[1]}>{RUN_STATUS[r.status]?.[0] ?? r.status}</Badge>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="ellipsis">{r.name}</div>
                  <div className="tiny muted">{r.found} şirket · {r.done_count} tamamlandı{r.failed_count ? ` · ${r.failed_count} hata` : ''} · {fmtRel(r.created_at)}</div>
                </div>
                <div style={{ width: 70 }}><Progress value={r.found ? (r.done_count + r.failed_count) / r.found : 0} /></div>
              </div>
            )) : <div className="muted small">Henüz araştırma yok.</div>}
          </Card>
        </div>
      </div>
    </div>
  )
}
