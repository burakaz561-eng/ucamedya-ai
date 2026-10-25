// Web Sitesi Talepleri: UcaMedya Bağlantı eklentisinden gelen teklif ve ön analiz talepleri + bağlantı ayarları.

import { Fragment, useEffect, useState } from 'react'
import { Download, RefreshCw, PlugZap, Save } from 'lucide-react'
import { call, useApi } from '../lib/api'
import { useNav } from '../lib/nav'
import { Badge, Btn, Callout, Card, Field, Loading, Seg, useAction } from '../components/ui'
import { fmtDate } from '../lib/format'
import type { PageProps } from '../lib/page'

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Config { siteUrl: string; enabled: boolean; syncMinutes: number; hasKey: boolean; lastSync: string | null; lastError: string | null; newCount: number }
const STATUS: Record<string, [string, string]> = { new: ['Yeni', 'brand'], reviewed: ['İncelendi', 'neutral'], converted: ['Fırsata dönüştü', 'success'], spam: ['İstenmeyen', 'danger'] }
const PREF: Record<string, string> = { email: 'E-posta', phone: 'Telefon', whatsapp: 'WhatsApp' }

export default function Leads(_: PageProps) {
  const [status, setStatus] = useState<'new' | 'reviewed' | 'converted' | 'spam' | ''>('new')
  const { data, reload } = useApi<any[]>('leads:list', { status: status || undefined }, ['companies'])
  const { data: cfg, reload: reloadCfg } = useApi<Config>('leads:config', undefined, ['companies'])
  const { openCompany } = useNav()
  const { run } = useAction()
  const [showCfg, setShowCfg] = useState(false)
  const configured = !!cfg?.siteUrl && !!cfg?.hasKey

  const sync = () => run(() => call<{ imported: number; created: number; matched: number }>('leads:sync'), (r) => (r.imported ? `${r.imported} yeni talep alındı (${r.created} yeni müşteri, ${r.matched} mevcut kayıtla eşleşti)` : 'Yeni talep yok')).then(() => { reload(); reloadCfg() })

  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="page-head">
        <div>
          <h1>Web Sitesi Talepleri</h1>
          <p>ucamedya.com.tr'deki teklif formu ve ücretsiz ön analiz aracından gelen talepler. Her talep müşteri havuzunda eşleştirilir; mevcut şirketse kartına eklenir, değilse yeni kart açılır ve "talebi incele" görevi oluşturulur.</p>
        </div>
        <div className="actions">
          <Seg value={status} onChange={setStatus} items={[{ key: 'new', label: 'Yeni' }, { key: 'reviewed', label: 'İncelendi' }, { key: 'converted', label: 'Fırsat' }, { key: 'spam', label: 'İstenmeyen' }, { key: '', label: 'Tümü' }]} />
          <Btn icon={<PlugZap />} onClick={() => setShowCfg((v) => !v)}>Bağlantı ayarları</Btn>
          <Btn variant="primary" icon={<RefreshCw />} disabled={!configured} onClick={sync}>Şimdi kontrol et</Btn>
        </div>
      </div>

      {cfg && !configured && !showCfg && <Callout tone="brand">Web sitesi bağlantısı henüz kurulmadı. <a href="#" onClick={(e) => { e.preventDefault(); setShowCfg(true) }}>Bağlantı ayarlarını açın</a> — eklentiyi indirip WordPress'e yükleyin, sonra site adresini ve bağlantı anahtarını girin.</Callout>}
      {cfg?.lastError && <Callout tone="warn">Son kontrol başarısız: {cfg.lastError}</Callout>}
      {cfg && (showCfg || !configured) && <ConnectionCard cfg={cfg} onSaved={reloadCfg} />}
      {cfg && configured && <div className="tiny muted">Son kontrol: {cfg.lastSync ? fmtDate(cfg.lastSync, true) : 'henüz yapılmadı'} · {cfg.enabled ? `otomatik, ${cfg.syncMinutes} dakikada bir` : 'otomatik kontrol kapalı'}</div>}

      {!data ? <Loading /> : !data.length ? <Card><div className="muted small">{status === 'new' ? 'Yeni talep yok.' : 'Bu durumda talep yok.'}</div></Card> : data.map((r) => (
        <Card key={r.id}>
          <div className="row" style={{ gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 260 }}>
              <div className="row wrap" style={{ gap: 8 }}>
                <b>{r.kind === 'audit' ? 'Ücretsiz ön analiz → iletişim talebi' : r.kind === 'contact' ? `İletişim formu${r.service && r.service !== 'İletişim formu' ? ` · ${r.service}` : ''}` : r.service ?? 'Teklif talebi'}</b>
                <Badge tone={STATUS[r.status]?.[1] as never}>{STATUS[r.status]?.[0] ?? r.status}</Badge>
                <span className="tiny muted">{fmtDate(r.submitted_at ?? r.received_at, true)}</span>
              </div>
              <div className="small" style={{ marginTop: 6 }}>
                <b>{r.person_name ?? '—'}</b>{r.company_name ? ` · ${r.company_name}` : ''} · {r.email ?? '—'}{r.phone ? ` · ${r.phone}` : ''}{r.contact_pref ? <span className="muted"> · tercih: {PREF[r.contact_pref] ?? r.contact_pref}</span> : null}
              </div>
              {r.website && <div className="tiny muted">Web sitesi: {r.website}</div>}
              {r.message && <div className="small" style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>{r.message}</div>}
              {Object.keys(r.answers ?? {}).length > 0 && (
                <div className="kv small" style={{ marginTop: 8 }}>
                  {Object.entries(r.answers).map(([k, v]) => <Fragment key={k}><div>{k}</div><div>{String(v)}</div></Fragment>)}
                </div>
              )}
              <div className="tiny faint" style={{ marginTop: 6 }}>
                {r.kind === 'contact' ? 'Sitedeki iletişim formundan (Gelen Mesajlar) — ayrı onay kutusu kaydı yok; yalnızca talebe yanıt verin.' : `Onay: aydınlatma metni ${r.consent?.kvkk ? 'onaylandı' : 'kaydı yok'} · pazarlama izni ${r.consent?.marketing ? 'verildi' : 'verilmedi'}`}{r.page_url ? ` · sayfa: ${r.page_url}` : ''}
              </div>
              {r.match_reason && <div className="tiny muted">Eşleştirme: {r.match_reason}</div>}
            </div>
            <div className="col" style={{ gap: 6 }}>
              {r.company_id && <Btn size="sm" variant="primary" onClick={() => openCompany(r.company_id)}>Müşteri kartı{r.company ? `: ${r.company}` : ''}</Btn>}
              {r.status !== 'reviewed' && <Btn size="sm" onClick={() => run(() => call('leads:setStatus', { id: r.id, status: 'reviewed' })).then(reload)}>İncelendi</Btn>}
              {r.status !== 'converted' && <Btn size="sm" onClick={() => run(() => call('leads:setStatus', { id: r.id, status: 'converted' })).then(reload)}>Fırsata dönüştü</Btn>}
              {r.status !== 'spam' && <Btn size="sm" variant="ghost" onClick={() => run(() => call('leads:setStatus', { id: r.id, status: 'spam' })).then(reload)}>İstenmeyen</Btn>}
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}

function ConnectionCard({ cfg, onSaved }: { cfg: Config; onSaved: () => void }) {
  const { run } = useAction()
  const [f, setF] = useState({ siteUrl: cfg.siteUrl, key: '', enabled: cfg.enabled, syncMinutes: cfg.syncMinutes })
  useEffect(() => setF((x) => ({ ...x, siteUrl: cfg.siteUrl, enabled: cfg.enabled, syncMinutes: cfg.syncMinutes })), [cfg.siteUrl, cfg.enabled, cfg.syncMinutes])
  const save = () => run(() => call('leads:saveConfig', { siteUrl: f.siteUrl, key: f.key || undefined, enabled: f.enabled, syncMinutes: f.syncMinutes }), 'Bağlantı ayarları kaydedildi').then((r) => r && (setF({ ...f, key: '' }), onSaved()))
  return (
    <Card title="Web sitesi bağlantısı (UcaMedya Bağlantı eklentisi)">
      <div className="col" style={{ gap: 12, maxWidth: 820 }}>
        <ol className="small" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
          <li><b>Eklentiyi indirin</b> ve WordPress yönetim paneli → Eklentiler → Yeni ekle → Eklenti yükle ile <code>ucamedya-baglanti.zip</code> dosyasını yükleyip etkinleştirin.</li>
          <li>Sitenizdeki mevcut iletişim formu ve canlı destek talepleri (Gelen Mesajlar) <b>otomatik aktarılır</b>; sitede bir şey değiştirmeniz gerekmez. İsterseniz ek olarak <code>[ucamedya_teklif_formu]</code> ve <code>[ucamedya_on_analiz]</code> kısa kodlarını da kullanabilirsiniz.</li>
          <li>WordPress → Ayarlar → <b>UcaMedya Bağlantı</b> sayfasındaki <b>bağlantı anahtarını</b> kopyalayıp aşağıya yapıştırın. KVKK aydınlatma metni bağlantısını da orada girin.</li>
        </ol>
        <div><Btn icon={<Download />} onClick={() => run(() => call<string | null>('leads:exportPlugin'), (p) => (p ? `Kaydedildi: ${p}` : 'İptal edildi'))}>Eklentiyi indir (ucamedya-baglanti.zip)</Btn></div>
        <div className="grid g2">
          <Field label="Site adresi"><input className="input" value={f.siteUrl} placeholder="https://ucamedya.com.tr/" onChange={(e) => setF({ ...f, siteUrl: e.target.value })} /></Field>
          <Field label="Bağlantı anahtarı" hint={cfg.hasKey ? 'Kayıtlı (güvenli depoda). Değiştirmek için yenisini yapıştırın.' : 'WordPress → Ayarlar → UcaMedya Bağlantı'}><input className="input" type="password" value={f.key} placeholder={cfg.hasKey ? '••••••••' : 'uca_…'} onChange={(e) => setF({ ...f, key: e.target.value })} autoComplete="off" /></Field>
          <Field label="Kontrol aralığı (dakika)"><input className="input" type="number" min={2} max={240} value={f.syncMinutes} onChange={(e) => setF({ ...f, syncMinutes: Number(e.target.value) || 5 })} /></Field>
        </div>
        <label className="check"><input type="checkbox" checked={f.enabled} onChange={(e) => setF({ ...f, enabled: e.target.checked })} /><div><b>Yeni talepleri otomatik kontrol et</b><div className="small muted">Uygulama açıkken belirlenen aralıkla siteye sorar; yeni talep gelince bildirim gösterir.</div></div></label>
        <div className="row" style={{ gap: 8 }}>
          <Btn variant="primary" icon={<Save />} onClick={save}>Kaydet</Btn>
          <Btn icon={<PlugZap />} onClick={() => run(() => call<{ site: string; plugin: string; pending: number }>('leads:test'), (r) => `Bağlantı çalışıyor: ${r.site} (eklenti ${r.plugin}) · bekleyen ${r.pending} talep`)}>Bağlantıyı test et</Btn>
        </div>
      </div>
    </Card>
  )
}
