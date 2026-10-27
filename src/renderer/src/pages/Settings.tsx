// Uygulama Ayarları.

import { useEffect, useState } from 'react'
import { Save, DatabaseBackup, Upload, FolderOpen, Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react'
import { call, useApi } from '../lib/api'
import { Badge, Btn, Callout, Card, Field, Tabs, useAction, useConfirm } from '../components/ui'
import { BrandForm, DataDirForm } from '../components/forms'
import { AppLockSetup } from './Wizard'
import { FINDING_CATEGORIES } from '@shared/constants'
import { fmtBytes, fmtDate } from '../lib/format'
import type { PageProps } from '../lib/page'
import type { AppSettings } from '@shared/types'
import { DEFAULT_TEMPLATES, TEMPLATE_PLACEHOLDERS, renderTemplate } from '@shared/message-templates'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Tab = 'brand' | 'look' | 'analysis' | 'scoring' | 'stages' | 'outreach' | 'backup' | 'security' | 'about'

export default function Settings({ settings, setSettings, params }: PageProps) {
  const [tab, setTab] = useState<Tab>((params.tab as Tab) ?? 'brand')
  const [s, setS] = useState<AppSettings>(settings)
  useEffect(() => setS(settings), [settings])
  const { run } = useAction()
  const save = (patch: Partial<AppSettings>) => run(() => call<AppSettings>('settings:update', patch), 'Ayarlar kaydedildi').then((r) => r && setSettings(r))
  const num = (v: string, min: number, max: number) => Math.max(min, Math.min(max, Number(v) || min))
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="page-head"><div><h1>Uygulama Ayarları</h1><p>Tüm ayarlar yerel veritabanında saklanır ve güncellemelerde korunur.</p></div></div>
      <Tabs value={tab} onChange={setTab} items={[
        { key: 'brand', label: 'Marka' }, { key: 'outreach', label: 'Mesaj gönderimi' }, { key: 'look', label: 'Görünüm ve robot' }, { key: 'analysis', label: 'Analiz' }, { key: 'scoring', label: 'Puanlama' },
        { key: 'stages', label: 'Müşteri aşamaları' }, { key: 'backup', label: 'Yedekleme' }, { key: 'security', label: 'Güvenlik ve veri' }, { key: 'about', label: 'Hakkında' }
      ]} />

      {tab === 'brand' && <Card><BrandForm settings={settings} onChange={setSettings} /></Card>}
      {tab === 'brand' && (
        <Card title="Teklif varsayılanları">
          <div className="col" style={{ gap: 12, maxWidth: 820 }}>
            <div className="small muted">"Analizden teklif taslağı" bu değerlerle başlar. Fiyatlar Teklif ve Satış → Hizmet kataloğundan gelir; katalogda fiyatı olmayan hizmet 0 TL gelir ve siz girmeden teklif gönderildi yapılamaz. Teslim süresi otomatik doldurulmaz.</div>
            <Field label="Teklif geçerlilik süresi (gün)"><input className="input" type="number" min={1} max={365} value={s.offers.validityDays} onChange={(e) => setS({ ...s, offers: { ...s.offers, validityDays: num(e.target.value, 1, 365) } })} style={{ maxWidth: 160 }} /></Field>
            <Field label="Varsayılan ödeme koşulları"><textarea className="textarea" style={{ minHeight: 60 }} value={s.offers.defaultPaymentTerms} onChange={(e) => setS({ ...s, offers: { ...s.offers, defaultPaymentTerms: e.target.value } })} /></Field>
            <Field label="Varsayılan sonraki adımlar"><textarea className="textarea" style={{ minHeight: 80 }} value={s.offers.defaultNextSteps} onChange={(e) => setS({ ...s, offers: { ...s.offers, defaultNextSteps: e.target.value } })} /></Field>
            <div><Btn variant="primary" icon={<Save />} onClick={() => save({ offers: s.offers })}>Kaydet</Btn></div>
          </div>
        </Card>
      )}

      {tab === 'look' && (
        <Card>
          <div className="col" style={{ gap: 14, maxWidth: 640 }}>
            <Field label="Tema"><select className="select" value={s.theme} onChange={(e) => save({ theme: e.target.value as AppSettings['theme'] })}><option value="system">Sistem</option><option value="light">Açık</option><option value="dark">Koyu</option></select></Field>
            <label className="check"><input type="checkbox" checked={s.showIntro} onChange={(e) => save({ showIntro: e.target.checked })} /><div><b>Sinematik açılış animasyonu</b><div className="small muted">Kapalıyken açılış kısa sürer; sistem kontrolleri yine gösterilir.</div></div></label>
            <label className="check"><input type="checkbox" checked={s.robotAnimations} onChange={(e) => save({ robotAnimations: e.target.checked })} /><div><b>Robot animasyonları ve bildirimleri</b><div className="small muted">Kapalıyken robot hareketsiz durur, olay bildirimleri sade uyarı olarak gösterilir.</div></div></label>
            <label className="check"><input type="checkbox" checked={s.lightMode} onChange={(e) => save({ lightMode: e.target.checked })} /><div><b>Hafif mod (düşük performanslı bilgisayarlar)</b><div className="small muted">3D robot yerine 2D çizim kullanılır; WebGL kullanılmaz.</div></div></label>
          </div>
        </Card>
      )}

      {tab === 'analysis' && (
        <Card>
          <div className="grid g2" style={{ maxWidth: 820 }}>
            <Field label="Eşzamanlı analiz sayısı" hint="1–4 arası. Yüksek değer daha fazla bellek kullanır."><input className="input" type="number" min={1} max={4} value={s.analysis.concurrency} onChange={(e) => setS({ ...s, analysis: { ...s.analysis, concurrency: num(e.target.value, 1, 4) } })} /></Field>
            <Field label="Site başına en fazla sayfa" hint="Ana sayfa + hizmetler/hakkımızda/iletişim"><input className="input" type="number" min={1} max={6} value={s.analysis.maxPages} onChange={(e) => setS({ ...s, analysis: { ...s.analysis, maxPages: num(e.target.value, 1, 6) } })} /></Field>
            <Field label="Sayfa zaman aşımı (sn)"><input className="input" type="number" min={10} max={90} value={s.analysis.timeoutSec} onChange={(e) => setS({ ...s, analysis: { ...s.analysis, timeoutSec: num(e.target.value, 10, 90) } })} /></Field>
            <Field label="Araştırma başına en fazla arama sorgusu" hint="API kotasını korur"><input className="input" type="number" min={1} max={60} value={s.search.maxQueriesPerResearch} onChange={(e) => setS({ ...s, search: { ...s.search, maxQueriesPerResearch: num(e.target.value, 1, 60) } })} /></Field>
          </div>
          <div className="col" style={{ marginTop: 12 }}>
            <label className="check"><input type="checkbox" checked={s.analysis.pagespeed} onChange={(e) => setS({ ...s, analysis: { ...s.analysis, pagespeed: e.target.checked } })} />PageSpeed Insights ölçümünü dahil et (anahtar varsa; site başına 30–90 sn ekler)</label>
            <label className="check"><input type="checkbox" checked={s.analysis.respectRobots} disabled onChange={() => undefined} />robots.txt kurallarına uy (her zaman açık)</label>
          </div>
          <Btn variant="primary" icon={<Save />} style={{ marginTop: 14 }} onClick={() => save({ analysis: s.analysis, search: s.search })}>Kaydet</Btn>
        </Card>
      )}

      {tab === 'scoring' && (
        <Card>
          <div className="col" style={{ gap: 14, maxWidth: 820 }}>
            <Callout>Fırsat puanı beş bileşenin ağırlıklı toplamıdır (ağırlıklar otomatik olarak 100'e ölçeklenir). Değişiklik, "Puanla" ile yeniden hesaplanan veya yeni analiz edilen şirketlere uygulanır.</Callout>
            <div className="grid g3">
              {([['improvementNeed', 'Web sitesinin geliştirilme ihtiyacı'], ['serviceFit', 'Hizmet uyumu'], ['activeSignals', 'Aktiflik işaretleri'], ['contactValidity', 'İletişim kanalı geçerliliği'], ['opportunitySignals', 'Gözlemlenen fırsatlar']] as const).map(([k, l]) => (
                <Field key={k} label={l}><input className="input" type="number" min={0} max={100} value={s.scoring.weights[k]} onChange={(e) => setS({ ...s, scoring: { ...s.scoring, weights: { ...s.scoring.weights, [k]: num(e.target.value, 0, 100) } } })} /></Field>
              ))}
              <Field label="Öncelikli inceleme eşiği"><input className="input" type="number" value={s.scoring.priorityThreshold} onChange={(e) => setS({ ...s, scoring: { ...s.scoring, priorityThreshold: num(e.target.value, 0, 100) } })} /></Field>
              <Field label="Yüksek uyum eşiği"><input className="input" type="number" value={s.scoring.highFitThreshold} onChange={(e) => setS({ ...s, scoring: { ...s.scoring, highFitThreshold: num(e.target.value, 0, 100) } })} /></Field>
            </div>
            <h3>Site analizi genel puanında kategori ağırlıkları</h3>
            <div className="grid g3">
              {Object.entries(FINDING_CATEGORIES).map(([k, l]) => (
                <Field key={k} label={l}><input className="input" type="number" min={0} max={5} step={0.5} value={s.scoring.categoryWeights[k as keyof typeof FINDING_CATEGORIES]} onChange={(e) => setS({ ...s, scoring: { ...s.scoring, categoryWeights: { ...s.scoring.categoryWeights, [k]: Number(e.target.value) } } })} /></Field>
              ))}
            </div>
            <div><Btn variant="primary" icon={<Save />} onClick={() => save({ scoring: s.scoring })}>Kaydet</Btn></div>
          </div>
        </Card>
      )}

      {tab === 'stages' && <StagesEditor />}

      {tab === 'outreach' && (
        <Card>
          <div className="col" style={{ gap: 14, maxWidth: 820 }}>
            <div className="grid g3">
              <Field label="Gönderim modu">
                <select className="select" value={s.outreach.sendMode} onChange={(e) => setS({ ...s, outreach: { ...s.outreach, sendMode: e.target.value as AppSettings['outreach']['sendMode'] } })}>
                  <option value="draft">Taslak — gönderme</option>
                  <option value="confirm">Onaylı gönderim — her mesajda sor</option>
                  <option value="queue">Onaylanmış kuyruk — sırayla gönder</option>
                </select>
              </Field>
              <Field label="E-posta kanalı">
                <select className="select" value={s.outreach.emailChannel} onChange={(e) => setS({ ...s, outreach: { ...s.outreach, emailChannel: e.target.value as AppSettings['outreach']['emailChannel'] } })}>
                  <option value="webmail">Webmail — Roundcube (tarayıcı, API gerekmez)</option>
                  <option value="gmail_web">Gmail (tarayıcı, API gerekmez)</option>
                  <option value="smtp">SMTP hesabı (isteğe bağlı)</option>
                </select>
              </Field>
              <Field label="WhatsApp kanalı">
                <select className="select" value={s.outreach.whatsappChannel} onChange={(e) => setS({ ...s, outreach: { ...s.outreach, whatsappChannel: e.target.value as AppSettings['outreach']['whatsappChannel'] } })}>
                  <option value="desktop">WhatsApp masaüstü uygulaması (önerilen — gönderme sizde)</option>
                  <option value="web">WhatsApp Web (tarayıcı, otomatik)</option>
                  <option value="click_to_chat">Manuel tıkla-gönder</option>
                  <option value="cloud_api">WhatsApp Business API (isteğe bağlı)</option>
                </select>
              </Field>
              <Field label="Günlük e-posta sınırı (Gmail web)"><input className="input" type="number" min={1} max={500} value={s.outreach.webDailyLimitEmail} onChange={(e) => setS({ ...s, outreach: { ...s.outreach, webDailyLimitEmail: num(e.target.value, 1, 500) } })} /></Field>
              <Field label="Günlük WhatsApp sınırı (Web)"><input className="input" type="number" min={1} max={200} value={s.outreach.webDailyLimitWhatsapp} onChange={(e) => setS({ ...s, outreach: { ...s.outreach, webDailyLimitWhatsapp: num(e.target.value, 1, 200) } })} /></Field>
            </div>
            {s.outreach.emailChannel === 'webmail' && <Field label="Webmail adresi" hint="Hosting firmanızın webmail giriş sayfası, ör. https://ucamedya.com.tr/webmail/"><input className="input" value={s.outreach.webmailUrl} onChange={(e) => setS({ ...s, outreach: { ...s.outreach, webmailUrl: e.target.value } })} placeholder="https://ucamedya.com.tr/webmail/" /></Field>}
            {s.outreach.whatsappChannel === 'web' && <Callout tone="warn">WhatsApp Web otomasyonu WhatsApp kullanım koşullarına aykırı sayılabilir ve hesabınız kısıtlanabilir. Uygulama spam kontrollerini atlatmaya çalışmaz; her mesajdan önce alıcı numarasını ve metni doğrular. Günlük sınırı düşük tutmanız ve "Onaylı gönderim" modunu kullanmanız önerilir.</Callout>}
            <label className="check"><input type="checkbox" checked={s.outreach.attachReport} onChange={(e) => setS({ ...s, outreach: { ...s.outreach, attachReport: e.target.checked } })} /><div><b>E-postaya PDF analiz raporunu ekle</b><div className="small muted">Webmail / Gmail üzerinden gönderimde şirketin son analiz raporu eklenir.</div></div></label>
            <label className="check"><input type="checkbox" checked={s.outreach.testMode} onChange={(e) => setS({ ...s, outreach: { ...s.outreach, testMode: e.target.checked } })} /><div><b>Test modu</b><div className="small muted">Açıkken uygulamanın kendisinin gönderdiği tüm mesajlar (webmail, WhatsApp Web) test alıcısına yönlendirilir. İstisna: WhatsApp masaüstü uygulamasında sohbet şirketin numarasıyla açılır, çünkü Enter'a siz basmadıkça hiçbir şey gönderilmez.</div></div></label>
            <div className="grid g2">
              <Field label="Test e-posta alıcısı"><input className="input" value={s.outreach.testRecipientEmail} onChange={(e) => setS({ ...s, outreach: { ...s.outreach, testRecipientEmail: e.target.value } })} /></Field>
              <Field label="Test WhatsApp numarası"><input className="input" value={s.outreach.testRecipientPhone} onChange={(e) => setS({ ...s, outreach: { ...s.outreach, testRecipientPhone: e.target.value } })} /></Field>
              <Field label="E-postalar arası bekleme (sn)" hint="Sağlayıcı sınırları ve güvenilirlik için sabit aralık"><input className="input" type="number" min={5} max={600} value={s.outreach.emailIntervalSec} onChange={(e) => setS({ ...s, outreach: { ...s.outreach, emailIntervalSec: num(e.target.value, 5, 600) } })} /></Field>
              <Field label="WhatsApp mesajları arası bekleme (sn)" hint="WhatsApp masaüstü uygulamasında en fazla 2 sn uygulanır (gönderimi siz yaparsınız)"><input className="input" type="number" min={5} max={600} value={s.outreach.whatsappIntervalSec} onChange={(e) => setS({ ...s, outreach: { ...s.outreach, whatsappIntervalSec: num(e.target.value, 5, 600) } })} /></Field>
            </div>
            <label className="check"><input type="checkbox" checked={s.outreach.desktopAutoAdvance !== false} onChange={(e) => setS({ ...s, outreach: { ...s.outreach, desktopAutoAdvance: e.target.checked } })} /><div><b>WhatsApp'ta Enter'a basınca sonraki mesaja otomatik geç</b><div className="small muted">WhatsApp masaüstü uygulamasında (Windows): WhatsApp penceresinde Enter'a bastığınız algılanınca "WhatsApp'ta gönderdim" demenize gerek kalmadan sıradaki sohbet açılır. Yalnızca Enter tuşuna bakılır; başka tuş okunmaz ve kaydedilmez.</div></div></label>
            <label className="check"><input type="checkbox" checked={s.outreach.requireApproval} onChange={(e) => setS({ ...s, outreach: { ...s.outreach, requireApproval: e.target.checked } })} /><div><b>Gönderim için taslak onayı zorunlu</b><div className="small muted">Önerilir. Kapatılırsa taslaklar onaysız kuyruğa alınabilir.</div></div></label>
            <label className="check"><input type="checkbox" checked={s.outreach.includeOptOutLine} onChange={(e) => setS({ ...s, outreach: { ...s.outreach, includeOptOutLine: e.target.checked } })} /><b>Her mesaja ret (iletişim istemiyorum) bilgisi ekle</b></label>
            <Field label="Ret bilgisi metni"><textarea className="textarea" style={{ minHeight: 70 }} value={s.outreach.optOutText} onChange={(e) => setS({ ...s, outreach: { ...s.outreach, optOutText: e.target.value } })} /></Field>
            <label className="check"><input type="checkbox" checked={s.outreach.allowPersonalContacts} onChange={(e) => setS({ ...s, outreach: { ...s.outreach, allowPersonalContacts: e.target.checked } })} /><div><b>Kişisel iletişim bilgilerine gönderime izin ver</b><div className="small muted">Varsayılan kapalı. Bireysel e-posta/telefonlara ticari ileti göndermek açık rıza gerektirebilir.</div></div></label>
            <label className="check"><input type="checkbox" checked={false} disabled onChange={() => undefined} /><div><b>E-posta açılma takibi</b> <Badge>Bu sürümde yok</Badge><div className="small muted">Takip pikseli kullanılmaz (gizlilik/mevzuat ve güvenilirlik nedeniyle).</div></div></label>
            <TemplatesEditor s={s} setS={setS} />
            <Callout tone="warn">Uygulama hukuki uygunluğu otomatik olarak garanti etmez. 6563 sayılı Kanun (ticari elektronik ileti), İYS kayıt yükümlülükleri ve KVKK kapsamındaki değerlendirmeler yoruma açıktır; toplu iletişimden önce hukuki görüş almanız önerilir.</Callout>
            <div><Btn variant="primary" icon={<Save />} onClick={() => save({ outreach: s.outreach })}>Kaydet</Btn></div>
          </div>
        </Card>
      )}

      {tab === 'backup' && <BackupTab s={s} setS={setS} save={save} />}

      {tab === 'security' && (
        <Card>
          <div className="col" style={{ gap: 16, maxWidth: 820 }}>
            <AppLockSetup />
            <DataDirForm settings={settings} onChange={setSettings} />
            <Field label="Kişisel veri saklama süresi (gün)" hint="Bu süreden eski ve iletişime dönüşmemiş kayıtları gözden geçirmeniz için kullanılır."><input className="input" type="number" style={{ maxWidth: 180 }} value={s.retentionDays} onChange={(e) => setS({ ...s, retentionDays: num(e.target.value, 30, 3650) })} /></Field>
            <Field label="Müşteri sorumluları" hint="Virgülle ayırın"><input className="input" value={s.owners.join(', ')} onChange={(e) => setS({ ...s, owners: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} /></Field>
            <div><Btn variant="primary" icon={<Save />} onClick={() => save({ retentionDays: s.retentionDays, owners: s.owners })}>Kaydet</Btn></div>
            <Callout>Silme ve dışa aktarma talepleri: müşteri kartından şirketi kalıcı silebilir (ret kaydı korunur) veya Excel/CSV ile dışa aktarabilirsiniz. API anahtarları ve parolalar işletim sisteminin güvenli kasasıyla şifrelenir; günlük dosyalarında anahtar benzeri değerler maskelenir.</Callout>
          </div>
        </Card>
      )}

      {tab === 'about' && <About />}
    </div>
  )
}

function StagesEditor() {
  const { data, reload } = useApi<any[]>('stages:list', undefined, [])
  const [rows, setRows] = useState<any[]>([])
  useEffect(() => setRows(data ?? []), [data])
  const { run } = useAction()
  const move = (i: number, d: number) => setRows((r) => { const x = [...r]; const [it] = x.splice(i, 1); x.splice(i + d, 0, it); return x })
  return (
    <Card title="Müşteri aşamaları" actions={<Btn size="sm" icon={<Plus />} onClick={() => setRows((r) => [...r, { key: `custom_${Date.now() % 100000}`, label: 'Yeni aşama', color: 'neutral', terminal: 0, system: 0 }])}>Aşama ekle</Btn>}>
      <div className="col" style={{ gap: 6, maxWidth: 720 }}>
        {rows.map((r, i) => (
          <div key={r.key} className="row">
            <span className="tiny faint" style={{ width: 22 }}>{i + 1}</span>
            <input className="input" value={r.label} onChange={(e) => setRows((x) => x.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)))} />
            <select className="select" style={{ width: 120 }} value={r.color} onChange={(e) => setRows((x) => x.map((y, j) => (j === i ? { ...y, color: e.target.value } : y)))}>{['neutral', 'brand', 'info', 'success', 'warning', 'danger'].map((c) => <option key={c}>{c}</option>)}</select>
            <label className="check small"><input type="checkbox" checked={!!r.terminal} onChange={(e) => setRows((x) => x.map((y, j) => (j === i ? { ...y, terminal: e.target.checked ? 1 : 0 } : y)))} />Son aşama</label>
            <Btn size="sm" variant="ghost" icon={<ArrowUp />} disabled={i === 0} onClick={() => move(i, -1)} aria-label="Yukarı" />
            <Btn size="sm" variant="ghost" icon={<ArrowDown />} disabled={i === rows.length - 1} onClick={() => move(i, 1)} aria-label="Aşağı" />
            <Btn size="sm" variant="ghost" icon={<Trash2 />} disabled={!!r.system} title={r.system ? 'Sistem aşaması silinemez' : 'Sil'} onClick={() => setRows((x) => x.filter((_, j) => j !== i))} />
          </div>
        ))}
        <div><Btn variant="primary" icon={<Save />} onClick={() => run(() => call('stages:save', { stages: rows.map((r) => ({ key: r.key, label: r.label, color: r.color, terminal: !!r.terminal })) }), 'Aşamalar kaydedildi').then(reload)}>Kaydet</Btn></div>
      </div>
    </Card>
  )
}

function BackupTab({ s, setS, save }: { s: AppSettings; setS: (s: AppSettings) => void; save: (p: Partial<AppSettings>) => Promise<unknown> }) {
  const { data, reload } = useApi<any[]>('backup:list', undefined, ['jobs'])
  const { run } = useAction()
  const { ask, node } = useConfirm()
  const restore = async (path?: string) => {
    const r = await run(() => call<any>('backup:restore', path ? { path } : {}))
    if (!r?.needsConfirm) return
    if (await ask('Yedekten geri yüklensin mi?', <>{r.message}<br /><br />Mevcut veritabanının "geri yükleme öncesi" yedeği otomatik alınır, ardından uygulama yeniden başlatılır. Yedekten sonraki değişiklikler kaybolur.</>, { danger: true, confirm: 'Geri yükle ve yeniden başlat' })) {
      await run(() => call('backup:restore', { path: r.path, confirm: true }))
    }
  }
  return (
    <div className="grid" style={{ gridTemplateColumns: '1fr 1.4fr', alignItems: 'start' }}>
      <Card title="Yedekleme ayarları">
        <div className="col" style={{ gap: 12 }}>
          <label className="check"><input type="checkbox" checked={s.backup.auto} onChange={(e) => setS({ ...s, backup: { ...s.backup, auto: e.target.checked } })} />Otomatik yedekleme</label>
          <div className="grid g2">
            <Field label="Aralık (saat)"><input className="input" type="number" min={1} value={s.backup.intervalHours} onChange={(e) => setS({ ...s, backup: { ...s.backup, intervalHours: Number(e.target.value) || 24 } })} /></Field>
            <Field label="Saklanacak otomatik yedek"><input className="input" type="number" min={1} value={s.backup.keep} onChange={(e) => setS({ ...s, backup: { ...s.backup, keep: Number(e.target.value) || 10 } })} /></Field>
          </div>
          <Field label="Yedek klasörü" hint="Boşsa uygulama veri klasöründeki 'Yedekler' kullanılır. Harici disk veya bulut senkron klasörü önerilir.">
            <div className="row"><input className="input" readOnly value={s.backup.dir} placeholder="Varsayılan" /><Btn icon={<FolderOpen />} onClick={async () => { const p = await call<string | null>('dialog:pickFolder'); if (p) setS({ ...s, backup: { ...s.backup, dir: p } }) }}>Seç</Btn></div>
          </Field>
          <div className="row"><Btn variant="primary" icon={<Save />} onClick={() => save({ backup: s.backup })}>Kaydet</Btn></div>
          <hr className="sep" />
          <div className="row wrap">
            <Btn icon={<DatabaseBackup />} onClick={() => run(() => call('backup:create'), 'Yedek oluşturuluyor').then(() => setTimeout(reload, 1500))}>Şimdi yedekle</Btn>
            <Btn icon={<Upload />} onClick={() => restore()}>Dosyadan geri yükle</Btn>
          </div>
          <div className="tiny muted">Yedekler SQLite "VACUUM INTO" ile alınır (çalışırken bile tutarlı) ve bütünlük kontrolünden geçer. Geri yüklemeden önce dosya doğrulanır; bozuk veya daha yeni sürüme ait yedek reddedilir. Ekran görüntüleri ve PDF'ler veri klasöründe ayrıca durur.</div>
        </div>
      </Card>
      <Card title="Yedekleme geçmişi" pad={false}>
        {data?.length ? data.map((b) => (
          <div key={b.id} className="list-item small" style={{ padding: '8px 16px' }}>
            <Badge tone={b.status === 'ok' ? 'success' : b.status === 'deleted' ? 'neutral' : 'danger'}>{b.kind === 'auto' ? 'Otomatik' : b.kind === 'pre_restore' ? 'Geri yükleme öncesi' : 'Manuel'}</Badge>
            <div style={{ flex: 1, minWidth: 0 }}><div className="ellipsis">{b.path.split(/[\\/]/).pop()}</div><div className="tiny muted">{fmtDate(b.created_at, true)} · {fmtBytes(b.bytes)} · şema {b.schema_version}{!b.exists ? ' · dosya yok' : ''}</div></div>
            {b.exists && <><Btn size="sm" onClick={() => restore(b.path)}>Geri yükle</Btn><Btn size="sm" variant="ghost" onClick={() => run(() => call<string | null>('backup:export', { path: b.path }), (p) => (p ? `Kopyalandı: ${p}` : 'İptal'))}>Dışa aktar</Btn></>}
          </div>
        )) : <div className="card-body muted small">Henüz yedek yok.</div>}
      </Card>
      {node}
    </div>
  )
}

function About() {
  const { data } = useApi<any>('app:info', undefined, [])
  if (!data) return null
  return (
    <Card>
      <div className="kv" style={{ maxWidth: 760 }}>
        <div>Uygulama</div><div>{data.name} {data.version}</div>
        <div>Platform</div><div>{data.platform} / {data.arch} · Electron {data.electron}</div>
        <div>Veritabanı şeması</div><div>{data.schema}</div>
        <div>Güvenli sır saklama</div><div>{data.safeStorage ? 'Kullanılabilir' : 'Kullanılamıyor'}</div>
        <div>Uygulama verisi</div><div className="small">{data.userData}</div>
        <div>Veri klasörü</div><div className="small">{data.dataDir}</div>
        <div>Kısayollar</div><div className="small">Ctrl+K arama · Ctrl+B menü · Ctrl+N yeni araştırma · Alt+1…9 sayfalar · Esc pencereyi kapat</div>
      </div>
    </Card>
  )
}

const SAMPLE = { company: 'Ramadi Yapı İnşaat | Gebze Fabrika Tadilatı', sector: 'İnşaat', city: 'Kocaeli', website: 'https://ornek.com.tr', findings: ['Sitede SSL sertifikası yok', 'Mobil uyumluluk zayıf'], brandName: 'Uca Medya', brandWeb: 'ucamedya.com.tr' }

function TemplatesEditor({ s, setS }: { s: AppSettings; setS: (v: AppSettings) => void }) {
  const { run } = useAction()
  const [prev, setPrev] = useState<'email' | 'whatsapp'>('email')
  const t = s.outreach.templates
  const set = (patch: Partial<AppSettings['outreach']['templates']>) => setS({ ...s, outreach: { ...s.outreach, templates: { ...t, ...patch } } })
  const vars = { ...SAMPLE, brandName: s.brand.name || SAMPLE.brandName, brandWeb: s.brand.website || SAMPLE.brandWeb }
  const img = s.outreach.image ?? { path: '', email: true, whatsapp: true }
  const [imgData, setImgData] = useState<string | null>(null)
  useEffect(() => {
    call<string | null>('outreach:imageData').then(setImgData).catch(() => setImgData(null))
  }, [img.path])
  const setImg = (patch: Partial<typeof img>) => setS({ ...s, outreach: { ...s.outreach, image: { ...img, ...patch } } })
  const showImg = imgData && (prev === 'email' ? img.email : img.whatsapp)
  return (
    <div className="col" style={{ gap: 12, borderTop: '1px solid var(--line)', paddingTop: 16 }}>
      <div><b>Mesaj şablonları</b><div className="small muted">Yapay zekâ kapalıyken taslaklar bu metinlerden üretilir; açıkken yapay zekâ bu şablonun yapısını ve tonunu korur. E-postada imza, her iki kanalda ret bilgisi otomatik eklenir.</div></div>
      <Field label="E-posta konusu"><input className="input" value={t.emailSubject} onChange={(e) => set({ emailSubject: e.target.value })} /></Field>
      <Field label="E-posta metni"><textarea className="textarea" style={{ minHeight: 220 }} value={t.emailBody} onChange={(e) => set({ emailBody: e.target.value })} /></Field>
      <Field label="WhatsApp metni"><textarea className="textarea" style={{ minHeight: 170 }} value={t.whatsappBody} onChange={(e) => set({ whatsappBody: e.target.value })} /></Field>
      <div className="col" style={{ gap: 8 }}>
        <b className="small">Mesaj görseli (isteğe bağlı)</b>
        <div className="row wrap" style={{ gap: 12, alignItems: 'flex-start' }}>
          {imgData ? <img src={imgData} alt="Mesaj görseli" style={{ width: 140, maxHeight: 140, objectFit: 'contain', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg)' }} /> : <div className="muted small" style={{ width: 140, height: 90, border: '1px dashed var(--line)', borderRadius: 10, display: 'grid', placeItems: 'center', textAlign: 'center' }}>Görsel yok</div>}
          <div className="col" style={{ gap: 6 }}>
            <div className="row" style={{ gap: 6 }}>
              <Btn size="sm" onClick={async () => { const p = await run(() => call<string | null>('outreach:pickImage')); if (p) setImg({ path: p }) }}>{img.path ? 'Görseli değiştir' : 'Görsel seç (PNG/JPG, en fazla 5 MB)'}</Btn>
              {img.path && <Btn size="sm" onClick={() => run(() => call('outreach:copyImage'), 'Görsel panoya kopyalandı — WhatsApp’ta bir sohbete yapıştırarak deneyebilirsiniz')}>Panoya kopyala (dene)</Btn>}
              {img.path && <Btn size="sm" variant="ghost" onClick={async () => { await run(() => call('outreach:clearImage')); setImg({ path: '' }) }}>Kaldır</Btn>}
            </div>
            <label className="check"><input type="checkbox" checked={img.email} onChange={(e) => setImg({ email: e.target.checked })} /><span className="small">E-postalara ek olarak ekle</span></label>
            <label className="check"><input type="checkbox" checked={img.whatsapp} onChange={(e) => setImg({ whatsapp: e.target.checked })} /><span className="small">WhatsApp mesajlarında kullan</span></label>
            {img.whatsapp && <label className="check" style={{ marginLeft: 22 }}><input type="checkbox" checked={img.autoPaste !== false} onChange={(e) => setImg({ autoPaste: e.target.checked })} /><span className="small">Görseli sohbete otomatik yapıştır — sohbet açılınca uygulama WhatsApp penceresine Ctrl+V (Mac'te Cmd+V) gönderir; görsel ve metin tek mesaj olarak hazırlanır, Enter'a siz basarsınız. WhatsApp öne gelemezse hiçbir tuşa basılmaz, elle yapıştırırsınız. (Mac'te Erişilebilirlik izni gerekir.)</span></label>}
          </div>
        </div>
      </div>
      <div className="small muted">Kullanılabilir alanlar: {TEMPLATE_PLACEHOLDERS.map((p) => <span key={p.key} title={p.label} style={{ marginRight: 8 }}><code>{p.key}</code></span>)}</div>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <Btn size="sm" variant={prev === 'email' ? 'primary' : 'ghost'} onClick={() => setPrev('email')}>E-posta önizleme</Btn>
        <Btn size="sm" variant={prev === 'whatsapp' ? 'primary' : 'ghost'} onClick={() => setPrev('whatsapp')}>WhatsApp önizleme</Btn>
        <Btn size="sm" variant="ghost" onClick={() => set({ ...DEFAULT_TEMPLATES })}>Varsayılan metne dön</Btn>
        <Btn size="sm" variant="ghost" onClick={() => run(() => call<AppSettings>('settings:update', { outreach: s.outreach }).then(() => call<number>('drafts:regenerate')), (n) => `${n} gönderilmemiş taslak yeni şablonla yenilendi`)}>Kaydet ve gönderilmemiş taslakları yenile</Btn>
      </div>
      <div className="card" style={{ whiteSpace: 'pre-wrap', fontSize: 13, padding: 14, background: 'var(--bg-2, transparent)' }}>
        {prev === 'email' && <div style={{ marginBottom: 8 }}><b>Konu:</b> {renderTemplate(t.emailSubject, vars)}</div>}
        {renderTemplate(prev === 'email' ? t.emailBody : t.whatsappBody, vars)}
        {showImg && <div style={{ marginTop: 10 }}><div className="tiny muted">{prev === 'email' ? 'Ek:' : 'Görsel:'}</div><img src={imgData!} alt="" style={{ maxWidth: 200, borderRadius: 8, border: '1px solid var(--line)' }} /></div>}
        <div className="tiny muted" style={{ marginTop: 8 }}>Örnek şirket: "{SAMPLE.company}" (sektör: {SAMPLE.sector})</div>
      </div>
    </div>
  )
}
