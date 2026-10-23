// Ziyaret edilen sayfanın içinde çalışan ölçüm betiği. Paketleyicinin eklediği yardımcı fonksiyonlar
// sayfa bağlamında bulunmadığı için metin olarak tutulur ve `page.evaluate(string)` ile çalıştırılır.
// Yalnızca OKUMA yapar: tıklama, form doldurma veya gezinme yapmaz.

export const COLLECT_SCRIPT = String.raw`(() => {
  const vw = window.innerWidth, vh = window.innerHeight
  const doc = document.documentElement
  const body = document.body || doc
  const txt = (el) => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim()
  const visible = (el) => {
    const r = el.getBoundingClientRect()
    if (r.width < 1 || r.height < 1) return false
    const cs = getComputedStyle(el)
    return cs.visibility !== 'hidden' && cs.display !== 'none' && parseFloat(cs.opacity || '1') > 0.05
  }
  const sel = (el) => {
    if (!el || !el.tagName) return ''
    let s = el.tagName.toLowerCase()
    if (el.id) return s + '#' + el.id
    if (el.classList && el.classList.length) s += '.' + [...el.classList].slice(0, 2).join('.')
    return s
  }

  // --- Metin boyutları ve kontrast ---
  const parseColor = (c) => { const m = c && c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/); return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null }
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]) }
  const bgOf = (el) => {
    let e = el
    while (e && e.nodeType === 1) {
      const cs = getComputedStyle(e)
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return null
      const c = parseColor(cs.backgroundColor)
      if (c && c[3] > 0.9) return c
      e = e.parentElement
    }
    return [255, 255, 255, 1]
  }
  let textEls = 0, smallText = 0, tinyText = 0, lowContrast = 0, contrastChecked = 0
  const fontFamilies = new Map(), fontSizes = new Map(), textColors = new Map()
  const lowContrastSamples = [], smallTextSamples = []
  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT)
  const seenParents = new Set()
  let n, guard = 0
  while ((n = walker.nextNode()) && guard < 4000) {
    guard++
    const t = (n.textContent || '').trim()
    if (t.length < 3) continue
    const el = n.parentElement
    if (!el || seenParents.has(el)) continue
    seenParents.add(el)
    if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName) || !visible(el)) continue
    const cs = getComputedStyle(el)
    const fs = parseFloat(cs.fontSize)
    textEls++
    fontSizes.set(Math.round(fs), (fontSizes.get(Math.round(fs)) || 0) + 1)
    const fam = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim().toLowerCase()
    fontFamilies.set(fam, (fontFamilies.get(fam) || 0) + t.length)
    textColors.set(cs.color, (textColors.get(cs.color) || 0) + 1)
    if (fs < 12) { smallText++; if (smallTextSamples.length < 5) smallTextSamples.push({ sel: sel(el), size: fs, text: t.slice(0, 60) }) }
    if (fs < 10) tinyText++
    const fg = parseColor(cs.color), bg = bgOf(el)
    if (fg && bg && contrastChecked < 1500) {
      contrastChecked++
      const L1 = lum(fg), L2 = lum(bg)
      const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)
      const large = fs >= 24 || (fs >= 18.66 && parseInt(cs.fontWeight) >= 700)
      if (ratio < (large ? 3 : 4.5)) { lowContrast++; if (lowContrastSamples.length < 5) lowContrastSamples.push({ sel: sel(el), ratio: Math.round(ratio * 100) / 100, text: t.slice(0, 60) }) }
    }
  }

  // --- Taşma (yatay kaydırma) ---
  const scrollW = Math.max(doc.scrollWidth, body.scrollWidth)
  const overflowEls = []
  if (scrollW > vw + 2) {
    for (const el of body.querySelectorAll('*')) {
      if (overflowEls.length >= 8) break
      const r = el.getBoundingClientRect()
      if (r.right > vw + 2 && r.width > 0 && r.width <= scrollW && visible(el)) {
        const p = el.parentElement && el.parentElement.getBoundingClientRect()
        if (!p || p.right <= vw + 2) overflowEls.push({ sel: sel(el), right: Math.round(r.right), width: Math.round(r.width), top: Math.round(r.top + scrollY) })
      }
    }
  }

  // --- Dokunma alanları ---
  const clickables = [...document.querySelectorAll('a[href], button, input[type=submit], [role=button]')].filter(visible)
  let smallTargets = 0
  const smallTargetSamples = []
  for (const el of clickables.slice(0, 400)) {
    const r = el.getBoundingClientRect()
    if (r.width < 32 || r.height < 32) {
      if (txt(el).length > 0 || el.querySelector('svg,img')) { smallTargets++; if (smallTargetSamples.length < 5) smallTargetSamples.push({ sel: sel(el), w: Math.round(r.width), h: Math.round(r.height), text: txt(el).slice(0, 30) }) }
    }
  }

  // --- Görseller ---
  const dpr = window.devicePixelRatio || 1
  const imgs = [...document.images]
  const images = { total: imgs.length, missingAlt: 0, upscaled: 0, upscaledSamples: [], oversized: 0, lazy: 0, broken: 0 }
  for (const im of imgs) {
    if (!im.hasAttribute('alt')) images.missingAlt++
    if (im.loading === 'lazy') images.lazy++
    if (im.complete && im.naturalWidth === 0 && im.currentSrc) images.broken++
    const r = im.getBoundingClientRect()
    if (!visible(im) || r.width < 80 || !im.naturalWidth) continue
    if (im.naturalWidth < r.width * dpr * 0.75 && im.naturalWidth < 1200) {
      images.upscaled++
      if (images.upscaledSamples.length < 5) images.upscaledSamples.push({ src: (im.currentSrc || im.src).slice(0, 200), natural: im.naturalWidth + 'x' + im.naturalHeight, shown: Math.round(r.width) + 'x' + Math.round(r.height), sel: sel(im), top: Math.round(r.top + scrollY) })
    }
    if (im.naturalWidth > r.width * dpr * 2.5 && im.naturalWidth > 1600) images.oversized++
  }

  // --- Bağlantılar ve sayfa yapısı ---
  const anchors = [...document.querySelectorAll('a[href]')]
  const links = anchors.map((a) => ({ href: a.href, text: txt(a).slice(0, 80), inNav: !!a.closest('nav, header, [role=navigation]'), vis: visible(a) })).filter((l) => /^https?:/i.test(l.href))
  const mailtos = [...new Set(anchors.map((a) => a.getAttribute('href') || '').filter((h) => /^mailto:/i.test(h)).map((h) => h.slice(7).split('?')[0]))]
  const tels = [...new Set(anchors.map((a) => a.getAttribute('href') || '').filter((h) => /^tel:/i.test(h)).map((h) => h.slice(4)))]
  const whatsappLinks = [...new Set(anchors.map((a) => a.href).filter((h) => /wa\.me|api\.whatsapp\.com|whatsapp:\/\//i.test(h)))]
  const bodyText = txt(body)
  const emailsInText = [...new Set((bodyText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).map((e) => e.toLowerCase()))].slice(0, 10)
  const phonesInText = [...new Set((bodyText.match(/(?:\+90|0)\s*\(?\d{3}\)?[\s.-]*\d{3}[\s.-]*\d{2}[\s.-]*\d{2}/g) || []))].slice(0, 10)
  const socials = [...new Set(links.map((l) => l.href).filter((h) => /(facebook|instagram|linkedin|youtube|twitter|x)\.com\//i.test(h)))].slice(0, 10)

  const low = (s) => s.toLocaleLowerCase('tr-TR')
  const ctaRe = /(teklif|iletişim|iletisim|bize ulaş|ulaşın|bize yazın|hemen ara|bizi arayın|randevu|rezervasyon|fiyat al|bilgi al|proje başlat|başlayalım|sipariş|satın al|whatsapp|contact|get a quote|book)/
  const ctaEls = [...document.querySelectorAll('a, button, [role=button]')].filter((el) => visible(el) && (ctaRe.test(low(txt(el))) || /^(tel:|https:\/\/wa\.me)/.test(el.getAttribute('href') || '')))
  const ctaAboveFold = ctaEls.filter((el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.top < vh }).map((el) => ({ text: txt(el).slice(0, 40), sel: sel(el), w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height) }))

  const forms = [...document.forms].filter(visible).map((f) => {
    const inputs = [...f.querySelectorAll('input:not([type=hidden]):not([type=submit]), textarea, select')]
    const unlabeled = inputs.filter((i) => !(i.labels && i.labels.length) && !i.getAttribute('aria-label') && !i.getAttribute('placeholder')).length
    const smallFont = inputs.filter((i) => parseFloat(getComputedStyle(i).fontSize) < 16).length
    return { inputs: inputs.length, unlabeled, smallFont, hasSubmit: !!f.querySelector('[type=submit], button') }
  })

  const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => ({ level: +h.tagName[1], text: txt(h).slice(0, 100) }))
  let headingSkips = 0
  for (let i = 1; i < headings.length; i++) if (headings[i].level > headings[i - 1].level + 1) headingSkips++

  const meta = (name) => (document.querySelector('meta[name="' + name + '"], meta[property="' + name + '"]') || {}).content || null
  const ldTypes = []
  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
    try { const j = JSON.parse(s.textContent || ''); const arr = Array.isArray(j) ? j : j['@graph'] || [j]; for (const x of arr) if (x && x['@type']) ldTypes.push(String(x['@type'])) } catch (e) {}
  }

  // --- Eski teknoloji işaretleri ---
  const html = doc.outerHTML
  const yearMatch = bodyText.match(/(?:©|copyright|telif)\s*(?:\d{4}\s*[-–]\s*)?(\d{4})/i)
  const jq = window.jQuery && window.jQuery.fn && window.jQuery.fn.jquery
  const layoutTables = [...document.querySelectorAll('table')].filter((t) => t.getBoundingClientRect().width > vw * 0.8 && !t.querySelector('th')).length
  const generator = meta('generator')

  // --- Yoğunluk ve hiyerarşi ---
  const aboveFoldWords = (() => { let w = 0; for (const el of seenParents) { const r = el.getBoundingClientRect(); if (r.top < vh && r.bottom > 0) w += txt(el).split(' ').length } return w })()
  const h1 = headings.filter((h) => h.level === 1)
  const navLinks = links.filter((l) => l.inNav && l.vis)
  const hamburger = !!document.querySelector('[class*=hamburger], [class*=menu-toggle], [class*=navbar-toggler], [aria-label*=menu i], [aria-label*=menü i], button[aria-controls][aria-expanded]')
  const btnStyles = new Set([...document.querySelectorAll('a[class*=btn], button, .button, [class*=button]')].filter(visible).slice(0, 60).map((b) => { const cs = getComputedStyle(b); return cs.borderRadius + '|' + cs.backgroundColor + '|' + Math.round(parseFloat(cs.paddingTop)) })).size

  const perf = performance.getEntriesByType('navigation')[0]
  const res = performance.getEntriesByType('resource')
  const bigResources = res.filter((r) => (r.transferSize || r.encodedBodySize || 0) > 500000).map((r) => ({ url: r.name.slice(0, 200), kb: Math.round((r.transferSize || r.encodedBodySize) / 1024), type: r.initiatorType })).slice(0, 10)

  return {
    url: location.href, title: document.title || null, lang: doc.getAttribute('lang'),
    viewport: { w: vw, h: vh, meta: meta('viewport'), scrollWidth: scrollW, pageHeight: Math.max(doc.scrollHeight, body.scrollHeight) },
    text: { elements: textEls, small: smallText, tiny: tinyText, smallSamples: smallTextSamples, lowContrast, contrastChecked, lowContrastSamples, families: [...fontFamilies.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8), sizes: fontSizes.size, colors: textColors.size, aboveFoldWords, totalWords: bodyText.split(' ').length },
    overflow: overflowEls,
    targets: { total: clickables.length, small: smallTargets, samples: smallTargetSamples },
    images,
    links: links.slice(0, 400), navLinks: navLinks.length, hamburger, buttonStyleVariants: btnStyles,
    contacts: { mailtos, tels, whatsappLinks, emailsInText, phonesInText, socials },
    cta: { total: ctaEls.length, aboveFold: ctaAboveFold },
    forms,
    seo: { description: meta('description'), robots: meta('robots'), canonical: (document.querySelector('link[rel=canonical]') || {}).href || null, ogTitle: meta('og:title'), ogImage: meta('og:image'), h1: h1.map((h) => h.text), headings: headings.slice(0, 40), headingSkips, ldTypes },
    legacy: { copyrightYear: yearMatch ? +yearMatch[1] : null, jquery: jq || null, layoutTables, font: !!document.querySelector('font, center, marquee, blink'), flash: /\.swf\b|shockwave-flash/i.test(html), generator, frames: document.querySelectorAll('frameset, frame').length },
    timing: perf ? { ttfb: Math.round(perf.responseStart - perf.requestStart), dcl: Math.round(perf.domContentLoadedEventEnd), load: Math.round(perf.loadEventEnd), transfer: Math.round((perf.transferSize || 0) / 1024) } : null,
    resources: { count: res.length, kb: Math.round(res.reduce((s, r) => s + (r.transferSize || 0), 0) / 1024), imageKb: Math.round(res.filter((r) => r.initiatorType === 'img' || /\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(r.name)).reduce((s, r) => s + (r.transferSize || r.encodedBodySize || 0), 0) / 1024), big: bigResources }
  }
})()`
