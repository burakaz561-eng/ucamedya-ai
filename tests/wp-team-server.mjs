// Ekip sunucusu (eklenti 2.0) uçtan uca testi — yerel WordPress Playground'a karşı.
const [B = 'http://127.0.0.1:9420', KEY = 'uca_testkey_1234567890'] = process.argv.slice(2)
const C = { Cookie: 'playground_auto_login_already_happened=1' }
let fails = 0
const ok = (c, l, x = '') => { console.log(`${c ? '✓' : '✗'} ${l}${x ? ' — ' + x : ''}`); if (!c) fails++ }
const api = async (path, { method = 'GET', body, token, key, raw } = {}) => {
  const h = { ...C, Accept: 'application/json' }
  if (token) h['X-UcaMedya-Token'] = token
  if (key) h['X-UcaMedya-Key'] = key
  if (body && !raw) h['Content-Type'] = 'application/json'
  const r = await fetch(`${B}/wp-json/ucamedya/v1/${path}`, { method, headers: h, body: raw ?? (body ? JSON.stringify(body) : undefined) })
  const text = await r.text()
  let j = null
  try { j = JSON.parse(text) } catch { j = text }
  return { s: r.status, j }
}
await fetch(B + '/', { headers: C, redirect: 'manual' })

let r = await api('team/status')
ok(r.s === 200 && r.j.initialized === false && r.j.plugin === '2.0.0', 'durum: kurulmamış, eklenti 2.0', JSON.stringify(r.j))
r = await api('team/bootstrap', { method: 'POST', body: { email: 'burak@ucamedya.com.tr', name: 'Burak', password: 'Guclu-Sifre-123' } })
ok(r.s === 401, 'kurulum anahtarsız reddedilir')
r = await api('team/bootstrap', { method: 'POST', key: KEY, body: { email: 'burak@ucamedya.com.tr', name: 'Burak', password: 'kisa' } })
ok(r.s === 400, 'kısa şifre reddedilir')
r = await api('team/bootstrap', { method: 'POST', key: KEY, body: { email: 'burak@ucamedya.com.tr', name: 'Burak', password: 'Guclu-Sifre-123', device: 'PC-A' } })
ok(r.s === 200 && r.j.token?.startsWith('ucat_') && r.j.user.role === 'admin', 'ilk admin oluşturuldu')
const adminA = r.j.token
r = await api('team/bootstrap', { method: 'POST', key: KEY, body: { email: 'x@y.com', password: 'Guclu-Sifre-123' } })
ok(r.s === 409, 'ikinci kurulum engellenir')

r = await api('team/login', { method: 'POST', body: { email: 'burak@ucamedya.com.tr', password: 'yanlis-sifre' } })
ok(r.s === 401, 'yanlış şifre reddedilir')
r = await api('team/me', { token: 'ucat_' + '0'.repeat(64) })
ok(r.s === 401, 'geçersiz oturum reddedilir')

// kullanıcı yönetimi
r = await api('team/users', { method: 'POST', token: adminA, body: { email: 'ayse@ucamedya.com.tr', name: 'Ayşe', password: 'Ayse-Sifre-456', role: 'member' } })
ok(r.s === 200 && r.j.user.role === 'member', 'üye eklendi (Türkçe ad)', r.j.user?.name)
const ayseId = r.j.user.id
r = await api('team/login', { method: 'POST', body: { email: 'AYSE@ucamedya.com.tr', password: 'Ayse-Sifre-456', device: 'PC-B' } })
ok(r.s === 200, 'üye giriş yaptı (e-posta büyük/küçük harf duyarsız)')
const memberB = r.j.token
r = await api('team/users', { token: memberB })
ok(r.s === 403, 'üye kullanıcı listesini göremez')
r = await api('team/users', { token: adminA })
ok(r.s === 200 && r.j.users.length === 2, 'admin kullanıcıları listeler', r.j.users?.map((u) => `${u.name}:${u.role}`).join(', '))
const adminId = r.j.users.find((u) => u.role === 'admin').id
r = await api(`team/users/${adminId}`, { method: 'POST', token: adminA, body: { role: 'member' } })
ok(r.s === 400, 'son admin üyeye düşürülemez')

// eşitleme + alan düzeyinde birleştirme
r = await api('team/push', { method: 'POST', token: adminA, body: { changes: [{ entity: 'companies', uid: 'c0ffee000001', patch: { name: 'EmlaXo Türkiye', city: 'Kocaeli', stage_key: 'new', internal_notes: '' } }] } })
ok(r.s === 200 && r.j.applied.length === 1, 'A şirket ekledi', `seq ${r.j.applied?.[0]?.seq}`)
const seq1 = r.j.applied[0].seq
await api('team/push', { method: 'POST', token: adminA, body: { changes: [{ entity: 'companies', uid: 'c0ffee000001', patch: { internal_notes: 'A notu' } }] } })
await api('team/push', { method: 'POST', token: memberB, body: { changes: [{ entity: 'companies', uid: 'c0ffee000001', patch: { stage_key: 'review' } }] } })
r = await api(`team/changes?since=${seq1 - 1}`, { token: memberB })
const last = r.j.changes.filter((c) => c.uid === 'c0ffee000001').pop()
ok(last && last.data.internal_notes === 'A notu' && last.data.stage_key === 'review' && last.data.name === 'EmlaXo Türkiye', 'aynı anda farklı alan değişikliği ikisi de korunur', JSON.stringify(last?.data))
ok(last?.by === 'Ayşe', 'son değiştiren kayıtlı', last?.by)
r = await api('team/push', { method: 'POST', token: memberB, body: { changes: [{ entity: 'settings', uid: 'shared000001', patch: { x: 1 } }, { entity: 'evil_table', uid: 'abcdef12', patch: {} }] } })
ok(r.j.applied.length === 0, 'üye paylaşılan ayarı değiştiremez; bilinmeyen tür reddedilir')
r = await api('team/push', { method: 'POST', token: adminA, body: { changes: [{ entity: 'companies', uid: 'c0ffee000001', deleted: true }] } })
r = await api(`team/changes?since=${seq1}`, { token: memberB })
ok(r.j.changes.some((c) => c.uid === 'c0ffee000001' && c.deleted), 'silme diğer istemciye ulaşır')

// dosyalar
const fd = new FormData()
fd.append('uid', 'f11e00000001')
fd.append('file', new Blob([Buffer.from('UcaMedya test dosyası — ğüşıöç')]), 'a.txt')
r = await fetch(`${B}/wp-json/ucamedya/v1/team/files`, { method: 'POST', headers: { ...C, 'X-UcaMedya-Token': adminA }, body: fd }).then(async (x) => ({ s: x.status, j: await x.json() }))
ok(r.s === 200 && r.j.size > 10, 'dosya yüklendi', JSON.stringify(r.j))
r = await api('team/files/check', { method: 'POST', token: memberB, body: { uids: ['f11e00000001', 'f11e00000002'] } })
ok(JSON.stringify(r.j.have) === '["f11e00000001"]', 'hangi dosyaların sunucuda olduğu bilinir')
let d = await fetch(`${B}/wp-json/ucamedya/v1/team/files/f11e00000001`, { headers: { ...C, 'X-UcaMedya-Token': memberB } })
ok(d.status === 200 && (await d.text()).includes('ğüşıöç'), 'diğer kullanıcı dosyayı indirdi')
d = await fetch(`${B}/wp-json/ucamedya/v1/team/files/f11e00000001`, { headers: C })
ok(d.status === 401, 'oturumsuz dosya indirilemez')

// gönderim kilidi
r = await api('team/claim', { method: 'POST', token: adminA, body: { key: 'msg:abc', device: 'PC-A' } })
ok(r.j.ok === true, 'A kilidi aldı')
r = await api('team/claim', { method: 'POST', token: memberB, body: { key: 'msg:abc', device: 'PC-B' } })
ok(r.j.ok === false && r.j.by === 'Burak', 'B aynı mesajı alamaz (A gönderiyor)', JSON.stringify(r.j))
await api('team/release', { method: 'POST', token: adminA, body: { key: 'msg:abc', device: 'PC-A', done: true } })
r = await api('team/claim', { method: 'POST', token: adminA, body: { key: 'msg:abc', device: 'PC-A' } })
ok(r.j.ok === false && r.j.done === true, 'gönderilmiş mesaj tekrar kilitlenemez')

// devre dışı bırakma oturumu kapatır
r = await api(`team/users/${ayseId}`, { method: 'POST', token: adminA, body: { active: false } })
r = await api('team/me', { token: memberB })
ok(r.s === 401, 'devre dışı bırakılan kullanıcının oturumu kapanır')
r = await api('team/status')
ok(r.j.initialized === true, 'durum: kurulu')

console.log(fails ? `\n${fails} adım başarısız` : '\nTüm adımlar başarılı')
process.exit(fails ? 1 : 0)
