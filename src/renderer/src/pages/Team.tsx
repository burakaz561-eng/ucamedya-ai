// Ekip ve Kullanıcılar: ekip sunucusunu kurma / ekibe katılma, eşitleme durumu, hesabım, kullanıcı yönetimi (admin).

import { useEffect, useState } from 'react'
import { RefreshCw, LogOut, UserPlus, Users, KeyRound, Server } from 'lucide-react'
import { call, useApi } from '../lib/api'
import { Badge, Btn, Callout, Card, Field, Loading, Modal, useAction, useConfirm } from '../components/ui'
import { fmtDate } from '../lib/format'
import type { PageProps } from '../lib/page'

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Cfg {
  enabled: boolean
  server: string
  userId: number
  email: string
  name: string
  role: 'admin' | 'member'
  loggedIn: boolean
  online: boolean
  deviceId: string
  localCompanies: number
  sync: { pendingChanges: number; waitingParents: number; pendingFiles: number; lastSeq: number; lastSync: string | null; lastError: string | null }
}

export default function Team({ settings }: PageProps) {
  const { data: cfg, reload } = useApi<Cfg>('team:config', undefined, ['team', 'settings'])
  if (!cfg) return <Loading />
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="page-head">
        <div>
          <h1>Ekip ve Kullanıcılar</h1>
          <p>Ekip modunda tüm müşteriler, analizler, taslaklar, teklifler, görevler ve dosyalar ucamedya.com.tr sunucunuzdaki ortak veritabanında tutulur; hangi bilgisayardan giriş yaparsanız yapın aynı bilgileri görürsünüz. Her bilgisayar çevrimdışıyken de çalışır, bağlantı gelince eşitler.</p>
        </div>
      </div>
      {cfg.enabled && cfg.loggedIn ? <Active cfg={cfg} reload={reload} /> : <Setup cfg={cfg} siteUrl={settings.website?.siteUrl || 'https://ucamedya.com.tr/'} reload={reload} />}
    </div>
  )
}

function Setup({ cfg, siteUrl, reload }: { cfg: Cfg; siteUrl: string; reload: () => void }) {
  const { data: leads } = useApi<{ hasKey: boolean; siteUrl: string }>('leads:config', undefined, [])
  const [server, setServer] = useState(cfg.server || siteUrl)
  const [st, setSt] = useState<{ initialized: boolean; plugin: string } | null>(null)
  const [stErr, setStErr] = useState<string | null>(null)
  const { run, busy } = useAction()
  useEffect(() => {
    setSt(null)
    setStErr(null)
    const t = setTimeout(() => {
      call<{ initialized: boolean; plugin: string }>('team:serverStatus', { server }).then(setSt, (e) => setStErr((e as Error).message))
    }, 500)
    return () => clearTimeout(t)
  }, [server])
  const [boot, setBoot] = useState({ name: '', email: '', password: '', password2: '', key: '', useLeadsKey: true, uploadExisting: true })
  const [join, setJoin] = useState({ email: cfg.email, password: '', mode: 'merge' as 'merge' | 'replace' })
  const hasLeadsKey = !!leads?.hasKey
  return (
    <>
      <Card title="Ekip sunucusu">
        <div className="col" style={{ gap: 10, maxWidth: 720 }}>
          <Field label="Sunucu (web siteniz)" hint="UcaMedya Bağlantı 2.0 eklentisi kurulu olmalı (Web Sitesi Talepleri → Eklentiyi indir ile güncel sürümü yükleyin)."><input className="input" value={server} onChange={(e) => setServer(e.target.value)} /></Field>
          <div className="small">
            {stErr ? <span style={{ color: 'var(--danger)' }}>{stErr}</span> : !st ? <span className="muted">Kontrol ediliyor…</span> : st.initialized ? <><Badge tone="success">Ekip sunucusu kurulu</Badge> <span className="muted">eklenti {st.plugin} — aşağıdan ekibe katılın</span></> : <><Badge tone="warning">Henüz kurulmamış</Badge> <span className="muted">eklenti {st.plugin} — ilk kez kuruyorsanız aşağıdan admin hesabını oluşturun</span></>}
          </div>
        </div>
      </Card>

      {st && !st.initialized && (
        <Card title="Ekip sunucusunu kur (ilk kez — admin hesabı)">
          <div className="col" style={{ gap: 12, maxWidth: 720 }}>
            <div className="grid g2">
              <Field label="Adınız"><input className="input" value={boot.name} onChange={(e) => setBoot({ ...boot, name: e.target.value })} /></Field>
              <Field label="E-posta (giriş adı)"><input className="input" type="email" value={boot.email} onChange={(e) => setBoot({ ...boot, email: e.target.value })} /></Field>
              <Field label="Şifre (en az 8 karakter)"><input className="input" type="password" value={boot.password} onChange={(e) => setBoot({ ...boot, password: e.target.value })} autoComplete="new-password" /></Field>
              <Field label="Şifre (tekrar)"><input className="input" type="password" value={boot.password2} onChange={(e) => setBoot({ ...boot, password2: e.target.value })} autoComplete="new-password" /></Field>
            </div>
            {hasLeadsKey ? (
              <label className="check"><input type="checkbox" checked={boot.useLeadsKey} onChange={(e) => setBoot({ ...boot, useLeadsKey: e.target.checked })} /><div><b>Web sitesi bağlantısındaki anahtarı kullan</b><div className="small muted">Kurulum yalnızca bir kez, sitenin bağlantı anahtarıyla yapılabilir.</div></div></label>
            ) : null}
            {(!hasLeadsKey || !boot.useLeadsKey) && <Field label="Bağlantı anahtarı" hint="WordPress → Ayarlar → UcaMedya Bağlantı"><input className="input" type="password" value={boot.key} onChange={(e) => setBoot({ ...boot, key: e.target.value })} placeholder="uca_…" /></Field>}
            <label className="check"><input type="checkbox" checked={boot.uploadExisting} onChange={(e) => setBoot({ ...boot, uploadExisting: e.target.checked })} /><div><b>Bu bilgisayardaki verileri ekip sunucusuna yükle</b><div className="small muted">{cfg.localCompanies} şirket ve tüm bağlı kayıtlar, ekran görüntüleri ve PDF'ler yüklenir (ilk yükleme internet hızınıza göre birkaç dakika sürebilir; bu sırada çalışabilirsiniz).</div></div></label>
            <div>
              <Btn variant="primary" icon={<Server />} disabled={busy || !boot.name || !boot.email || boot.password.length < 8 || boot.password !== boot.password2} onClick={() => run(() => call('team:bootstrap', { server, name: boot.name, email: boot.email, password: boot.password, key: boot.key || undefined, useLeadsKey: hasLeadsKey && boot.useLeadsKey, uploadExisting: boot.uploadExisting }), 'Ekip sunucusu kuruldu; admin olarak giriş yapıldı').then(reload)}>Ekip sunucusunu kur</Btn>
              {boot.password2 && boot.password !== boot.password2 && <span className="small" style={{ color: 'var(--danger)', marginLeft: 10 }}>Şifreler aynı değil</span>}
            </div>
          </div>
        </Card>
      )}

      {st?.initialized && (
        <Card title="Ekibe katıl (giriş yap)">
          <div className="col" style={{ gap: 12, maxWidth: 720 }}>
            <div className="grid g2">
              <Field label="E-posta"><input className="input" type="email" value={join.email} onChange={(e) => setJoin({ ...join, email: e.target.value })} /></Field>
              <Field label="Şifre"><input className="input" type="password" value={join.password} onChange={(e) => setJoin({ ...join, password: e.target.value })} /></Field>
            </div>
            {cfg.localCompanies > 0 && (
              <div className="col" style={{ gap: 6 }}>
                <div className="small"><b>Bu bilgisayarda {cfg.localCompanies} şirket kaydı var.</b> Ne yapılsın?</div>
                <label className="check"><input type="radio" name="mode" checked={join.mode === 'merge'} onChange={() => setJoin({ ...join, mode: 'merge' })} /><div><b>Ekibe ekle</b><div className="small muted">Buradaki kayıtlar da ortak veritabanına yüklenir (aynı şirket iki yerde varsa "Yinelenenleri bul" ile birleştirebilirsiniz).</div></div></label>
                <label className="check"><input type="radio" name="mode" checked={join.mode === 'replace'} onChange={() => setJoin({ ...join, mode: 'replace' })} /><div><b>Buradakileri bırak, ekipteki verileri al</b><div className="small muted">Önce tam yedek alınır, sonra bu bilgisayardaki kayıtlar temizlenip sunucudaki veriler indirilir.</div></div></label>
              </div>
            )}
            <div><Btn variant="primary" icon={<Users />} disabled={busy || !join.email || !join.password} onClick={() => run(() => call('team:login', { server, email: join.email, password: join.password, mode: cfg.localCompanies > 0 ? join.mode : 'keep' }), 'Giriş yapıldı; veriler eşitleniyor').then(reload)}>Giriş yap</Btn></div>
          </div>
        </Card>
      )}
    </>
  )
}

function Active({ cfg, reload }: { cfg: Cfg; reload: () => void }) {
  const { run, busy } = useAction()
  const { ask, node } = useConfirm()
  const [pw, setPw] = useState({ current: '', next: '', next2: '' })
  const s = cfg.sync
  const state = !cfg.online ? ['danger', 'Çevrimdışı — değişiklikler bağlantı gelince gönderilir'] : s.lastError ? ['warning', `Son eşitlemede sorun: ${s.lastError}`] : s.pendingChanges || s.pendingFiles ? ['brand', 'Eşitleniyor…'] : ['success', 'Güncel']
  return (
    <>
      <div className="grid g2">
        <Card title="Eşitleme durumu" actions={<Btn size="sm" icon={<RefreshCw />} disabled={busy} onClick={() => run(() => call('team:syncNow'), 'Eşitlendi').then(reload)}>Şimdi eşitle</Btn>}>
          <div className="col" style={{ gap: 8 }}>
            <div><Badge tone={state[0] as never} dot>{state[1]}</Badge></div>
            <div className="kv small">
              <div>Sunucu</div><div>{cfg.server}</div>
              <div>Son eşitleme</div><div>{s.lastSync ? fmtDate(s.lastSync, true) : '—'}</div>
              <div>Gönderilmeyi bekleyen değişiklik</div><div>{s.pendingChanges}</div>
              <div>Aktarılmayı bekleyen dosya</div><div>{s.pendingFiles}</div>
              {s.waitingParents > 0 && <><div>Bağlı kaydı beklenen</div><div>{s.waitingParents}</div></>}
              <div>Bu bilgisayar</div><div className="tiny">{cfg.deviceId}</div>
            </div>
          </div>
        </Card>
        <Card title="Hesabım" actions={<Btn size="sm" icon={<LogOut />} onClick={async () => (await ask('Çıkış yapılsın mı?', 'Bu bilgisayardaki veriler silinmez; tekrar giriş yapana kadar eşitleme durur ve giriş ekranı açılır.', { confirm: 'Çıkış yap' })) && run(() => call('team:logout'), 'Çıkış yapıldı').then(() => location.reload())}>Çıkış yap</Btn>}>
          <div className="col" style={{ gap: 10 }}>
            <div><b>{cfg.name}</b> <Badge tone={cfg.role === 'admin' ? 'brand' : 'neutral'}>{cfg.role === 'admin' ? 'Admin' : 'Üye'}</Badge><div className="small muted">{cfg.email}</div></div>
            <div className="grid g3">
              <input className="input" type="password" placeholder="Mevcut şifre" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
              <input className="input" type="password" placeholder="Yeni şifre (8+)" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" />
              <input className="input" type="password" placeholder="Yeni şifre (tekrar)" value={pw.next2} onChange={(e) => setPw({ ...pw, next2: e.target.value })} autoComplete="new-password" />
            </div>
            <div><Btn size="sm" icon={<KeyRound />} disabled={busy || !pw.current || pw.next.length < 8 || pw.next !== pw.next2} onClick={() => run(() => call('team:changePassword', { current: pw.current, next: pw.next }), 'Şifreniz değiştirildi').then((r) => r !== undefined && setPw({ current: '', next: '', next2: '' }))}>Şifremi değiştir</Btn></div>
            <div className="tiny muted">Ekip modunu tamamen kapatmak için: <a href="#" onClick={async (e) => { e.preventDefault(); if (await ask('Ekip modu kapatılsın mı?', 'Bu bilgisayar ekiple eşitlenmeyi bırakır; veriler burada kalır.', { danger: true, confirm: 'Kapat' })) run(() => call('team:disable'), 'Ekip modu kapatıldı').then(reload) }}>Ekip modunu kapat</a></div>
          </div>
        </Card>
      </div>
      {cfg.role === 'admin' ? <UsersCard me={cfg.userId} /> : <Callout>Kullanıcı ekleme ve yetki verme admin hesabıyla yapılır. Paylaşılan ayarları (marka, mesaj şablonları, puanlama, teklif) yalnızca admin değiştirebilir.</Callout>}
      {node}
    </>
  )
}

function UsersCard({ me }: { me: number }) {
  const { data: users, reload, error } = useApi<any[]>('team:users', undefined, ['team'])
  const { run, busy } = useAction()
  const { ask, node } = useConfirm()
  const [add, setAdd] = useState<null | { name: string; email: string; password: string; role: 'admin' | 'member' }>(null)
  const [reset, setReset] = useState<null | { id: number; name: string; password: string }>(null)
  return (
    <Card title="Kullanıcılar" actions={<Btn size="sm" variant="primary" icon={<UserPlus />} onClick={() => setAdd({ name: '', email: '', password: '', role: 'member' })}>Kullanıcı ekle</Btn>}>
      {error ? <Callout tone="warn">{error}</Callout> : !users ? <Loading /> : (
        <div style={{ overflowX: 'auto' }}><table className="dt" style={{ tableLayout: 'auto', minWidth: 860 }}>
          <thead><tr><th>Ad</th><th>E-posta</th><th style={{ width: 130 }}>Rol</th><th style={{ width: 110 }}>Durum</th><th style={{ width: 150 }}>Son görülme</th><th style={{ width: 290 }}></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td><b>{u.name || '—'}</b>{u.id === me && <span className="tiny muted"> (siz)</span>}</td>
                <td>{u.email}</td>
                <td>
                  <select className="select" style={{ minHeight: 30, padding: '2px 8px' }} value={u.role} disabled={busy} onChange={(e) => run(() => call('team:updateUser', { id: u.id, patch: { role: e.target.value } }), 'Rol güncellendi').then(reload)}>
                    <option value="member">Üye</option><option value="admin">Admin</option>
                  </select>
                </td>
                <td>{u.active ? <Badge tone="success">Aktif</Badge> : <Badge>Devre dışı</Badge>}</td>
                <td className="small">{u.last_seen ? fmtDate(u.last_seen + 'Z', true) : u.last_login ? fmtDate(u.last_login + 'Z', true) : '—'}</td>
                <td>
                  <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                    <Btn size="sm" onClick={() => setReset({ id: u.id, name: u.name || u.email, password: '' })}>Şifre sıfırla</Btn>
                    {u.id !== me && (u.active
                      ? <Btn size="sm" variant="ghost" onClick={async () => (await ask(`${u.name || u.email} devre dışı bırakılsın mı?`, 'Bu kişinin tüm oturumları hemen kapanır ve giriş yapamaz. Kayıtları silinmez.', { danger: true, confirm: 'Devre dışı bırak' })) && run(() => call('team:updateUser', { id: u.id, patch: { active: false } }), 'Kullanıcı devre dışı bırakıldı').then(reload)}>Devre dışı bırak</Btn>
                      : <Btn size="sm" onClick={() => run(() => call('team:updateUser', { id: u.id, patch: { active: true } }), 'Kullanıcı etkinleştirildi').then(reload)}>Etkinleştir</Btn>)}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
      {add && (
        <Modal title="Kullanıcı ekle" sub="Kişi bu e-posta ve şifreyle istediği bilgisayardan giriş yapar; ilk girişten sonra şifresini Hesabım'dan değiştirebilir." onClose={() => setAdd(null)} footer={<>
          <Btn onClick={() => setAdd(null)}>Vazgeç</Btn>
          <Btn variant="primary" disabled={busy || !add.name || !add.email || add.password.length < 8} onClick={() => run(() => call('team:createUser', add), 'Kullanıcı eklendi').then((r) => r && (setAdd(null), reload()))}>Ekle</Btn>
        </>}>
          <div className="grid g2">
            <Field label="Ad soyad"><input className="input" value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} /></Field>
            <Field label="E-posta"><input className="input" type="email" value={add.email} onChange={(e) => setAdd({ ...add, email: e.target.value })} /></Field>
            <Field label="Geçici şifre (en az 8)"><input className="input" value={add.password} onChange={(e) => setAdd({ ...add, password: e.target.value })} autoComplete="off" /></Field>
            <Field label="Rol"><select className="select" value={add.role} onChange={(e) => setAdd({ ...add, role: e.target.value as 'admin' | 'member' })}><option value="member">Üye — müşteri, analiz, mesaj, teklif işleri</option><option value="admin">Admin — ayrıca kullanıcılar ve paylaşılan ayarlar</option></select></Field>
          </div>
        </Modal>
      )}
      {reset && (
        <Modal title={`${reset.name} — şifre sıfırla`} sub="Yeni şifreyi kişiye siz iletin. Kişinin açık oturumları kapanır." onClose={() => setReset(null)} footer={<>
          <Btn onClick={() => setReset(null)}>Vazgeç</Btn>
          <Btn variant="primary" disabled={busy || reset.password.length < 8} onClick={() => run(() => call('team:updateUser', { id: reset.id, patch: { password: reset.password } }), 'Şifre sıfırlandı').then((r) => r && setReset(null))}>Kaydet</Btn>
        </>}>
          <Field label="Yeni şifre (en az 8)"><input className="input" value={reset.password} onChange={(e) => setReset({ ...reset, password: e.target.value })} autoComplete="off" /></Field>
        </Modal>
      )}
      {node}
    </Card>
  )
}
