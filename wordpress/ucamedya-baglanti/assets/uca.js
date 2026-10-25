/* UcaMedya Bağlantı — teklif formu soru grupları ve ön analiz aracı. Bağımlılık yok. */
(function () {
  'use strict'
  var REST = (window.UCA_BAG && window.UCA_BAG.rest) || '/wp-json/ucamedya/v1/'

  // ---- Teklif formu: yalnızca seçilen hizmetin soruları görünür
  document.querySelectorAll('[data-uca-quote]').forEach(function (form) {
    var sel = form.querySelector('[data-uca-service]')
    var page = form.querySelector('input[name="uca_page"]')
    if (page) page.value = location.href.split('#')[0]
    function sync() {
      form.querySelectorAll('[data-uca-group]').forEach(function (g) {
        var on = g.getAttribute('data-uca-group') === sel.value
        g.hidden = !on
        g.querySelectorAll('input,select,textarea').forEach(function (el) {
          el.disabled = !on
          if (el.hasAttribute('data-uca-required')) el.required = on
        })
      })
    }
    sel.addEventListener('change', sync)
    sync()
  })

  // ---- Ön analiz
  document.querySelectorAll('[data-uca-audit]').forEach(function (box) {
    var form = box.querySelector('[data-uca-audit-form]')
    var out = box.querySelector('[data-uca-audit-result]')
    var contact = box.querySelector('[data-uca-audit-contact]')
    var msg = box.querySelector('[data-uca-audit-msg]')
    var last = null
    var ICON = { ok: '✓', warn: '!', bad: '✕', na: '–' }

    function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML }

    form.addEventListener('submit', function (e) {
      e.preventDefault()
      var btn = form.querySelector('button')
      btn.disabled = true
      out.hidden = false
      out.innerHTML = '<div class="uca-box">Site kontrol ediliyor… (10–20 saniye sürebilir)</div>'
      contact.hidden = true
      fetch(REST + 'audit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: form.url.value }) })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j } }) })
        .then(function (res) {
          if (!res.ok) throw new Error(res.j && res.j.message ? res.j.message : 'Analiz yapılamadı.')
          last = res.j
          var h = '<div class="uca-report"><div class="uca-report-head"><div><b>' + esc(res.j.url) + '</b><div class="uca-note">Temel otomatik kontroller. Tasarım kalitesi, içerik ve dönüşüm gibi konular uzman incelemesi gerektirir.</div></div>'
          if (res.j.score != null) h += '<div class="uca-score">' + esc(res.j.score) + '<small>/100</small></div>'
          h += '</div><ul class="uca-checks-list">'
          res.j.checks.forEach(function (c) {
            h += '<li class="uca-st-' + esc(c.status) + '"><span class="uca-ic">' + (ICON[c.status] || '') + '</span><div><b>' + esc(c.label) + '</b><div>' + esc(c.detail) + '</div></div></li>'
          })
          out.innerHTML = h + '</ul></div>'
          contact.hidden = false
        })
        .catch(function (err) { out.innerHTML = '<div class="uca-box uca-err">' + esc(err.message) + '</div>' })
        .finally(function () { btn.disabled = false })
    })

    contact.addEventListener('submit', function (e) {
      e.preventDefault()
      var f = contact
      var body = { name: f.name.value, company: f.company.value, email: f.email.value, phone: f.phone.value, pref: f.pref.value, kvkk: f.kvkk.checked, marketing: f.marketing.checked, hp: f.hp.value, audit: last }
      var btn = f.querySelector('button')
      btn.disabled = true
      fetch(REST + 'audit-contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j } }) })
        .then(function (res) {
          msg.hidden = false
          msg.className = 'uca-box ' + (res.ok ? 'uca-ok' : 'uca-err')
          msg.textContent = res.ok ? res.j.message : res.j.message || 'Gönderilemedi.'
          if (res.ok) f.querySelectorAll('input,select,button').forEach(function (el) { el.disabled = true })
        })
        .catch(function () { msg.hidden = false; msg.className = 'uca-box uca-err'; msg.textContent = 'Gönderilemedi. Lütfen tekrar deneyin.' })
        .finally(function () { if (!msg.classList.contains('uca-ok')) btn.disabled = false })
    })
  })
})()
