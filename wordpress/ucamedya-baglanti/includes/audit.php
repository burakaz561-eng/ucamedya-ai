<?php
if (!defined('ABSPATH')) exit;

/**
 * Ücretsiz ön analiz: yalnızca ölçülebilen temel kontroller. Ölçülemeyen bir şey "yapılamadı" olarak
 * döner; tahmin üretilmez. Sonuç ziyaretçiye gösterilir, ziyaretçi iletişim bırakmadıkça saklanmaz.
 */
function uca_bag_audit($input_url) {
    $res = uca_bag_safe_get($input_url);
    if (is_wp_error($res)) return $res;
    $checks = array();
    $add = function ($key, $label, $status, $detail) use (&$checks) {
        $checks[] = array('key' => $key, 'label' => $label, 'status' => $status, 'detail' => $detail); // status: ok | warn | bad | na
    };

    $code = $res['status'];
    $add('reach', 'Siteye erişim', $code >= 200 && $code < 300 ? 'ok' : 'bad', $code >= 200 && $code < 300 ? 'Site açılıyor (HTTP ' . $code . ').' : 'Site HTTP ' . $code . ' yanıtı verdi.');
    if ($code < 200 || $code >= 300) return array('url' => $res['final_url'], 'checks' => $checks, 'score' => null);

    $https = stripos($res['final_url'], 'https://') === 0;
    $add('https', 'HTTPS (güvenli bağlantı)', $https ? 'ok' : 'bad', $https ? 'Site güvenli bağlantı (HTTPS) ile açılıyor.' : 'Site HTTPS kullanmıyor; tarayıcılar "güvenli değil" uyarısı gösterebilir.');

    $ms = $res['ms'];
    $kb = (int) round(strlen($res['body']) / 1024);
    $add('speed', 'Sunucu yanıt süresi', $ms < 800 ? 'ok' : ($ms < 2000 ? 'warn' : 'bad'), sprintf('Ana sayfa HTML\'i %s ms içinde indi (%d KB). Bu ölçüm sunucumuzdan yapıldı; tam sayfa yüklenme süresi değildir.', number_format_i18n($ms), $kb));

    $html = $res['body'];
    libxml_use_internal_errors(true);
    $doc = new DOMDocument();
    $ok = $html !== '' && $doc->loadHTML('<?xml encoding="UTF-8">' . $html, LIBXML_NOWARNING | LIBXML_NOERROR | LIBXML_NONET);
    libxml_clear_errors();
    if (!$ok) {
        $add('parse', 'Sayfa içeriği', 'na', 'Sayfa içeriği okunamadı.');
        return array('url' => $res['final_url'], 'checks' => $checks, 'score' => uca_bag_audit_score($checks));
    }
    $xp = new DOMXPath($doc);

    $title = trim((string) ($xp->evaluate('string(//title)')));
    $tl = function_exists('mb_strlen') ? mb_strlen($title) : strlen($title);
    if ($title === '') $add('title', 'Sayfa başlığı', 'bad', 'Sayfa başlığı (title) yok.');
    else $add('title', 'Sayfa başlığı', $tl >= 15 && $tl <= 65 ? 'ok' : 'warn', '"' . esc_html(wp_trim_words($title, 14)) . '" — ' . $tl . ' karakter' . ($tl > 65 ? ' (arama sonuçlarında kesilebilir).' : ($tl < 15 ? ' (çok kısa).' : '.')));

    $desc = '';
    foreach ($xp->query('//meta[@name]') as $m) if (strtolower($m->getAttribute('name')) === 'description') { $desc = trim($m->getAttribute('content')); break; }
    $dl = function_exists('mb_strlen') ? mb_strlen($desc) : strlen($desc);
    if ($desc === '') $add('meta', 'Meta açıklaması', 'bad', 'Meta açıklaması yok; Google arama sonucundaki açıklamayı kendisi seçer.');
    else $add('meta', 'Meta açıklaması', $dl >= 70 && $dl <= 170 ? 'ok' : 'warn', $dl . ' karakter' . ($dl > 170 ? ' (uzun, kesilebilir).' : ($dl < 70 ? ' (kısa).' : '.')));

    $vp = '';
    foreach ($xp->query('//meta[@name]') as $m) if (strtolower($m->getAttribute('name')) === 'viewport') { $vp = $m->getAttribute('content'); break; }
    $add('mobile', 'Mobil görünüm ayarı', $vp && stripos($vp, 'width=device-width') !== false ? 'ok' : 'bad', $vp ? 'Viewport etiketi var (' . esc_html($vp) . '). Bu, sitenin mobil ekrana uyarlanmak üzere ayarlandığını gösterir; tasarımın mobilde iyi göründüğünü tek başına kanıtlamaz.' : 'Viewport etiketi yok; site telefonlarda küçük ve yakınlaştırılmış görünebilir.');

    $h1 = $xp->query('//h1')->length;
    $add('h1', 'Ana başlık (H1)', $h1 === 1 ? 'ok' : 'warn', $h1 === 0 ? 'Sayfada H1 başlığı yok.' : ($h1 === 1 ? 'Bir H1 başlığı var.' : $h1 . ' adet H1 var; genellikle bir tane önerilir.'));

    $lang = $doc->documentElement ? $doc->documentElement->getAttribute('lang') : '';
    $canon = $xp->evaluate('string(//link[@rel="canonical"]/@href)');
    $og = $xp->query('//meta[@property="og:title"]')->length > 0;
    $seo_missing = array();
    if (!$lang) $seo_missing[] = 'dil (lang) bilgisi';
    if (!$canon) $seo_missing[] = 'canonical bağlantı';
    if (!$og) $seo_missing[] = 'sosyal medya paylaşım etiketi (og:title)';
    $add('seo', 'Temel SEO etiketleri', $seo_missing ? 'warn' : 'ok', $seo_missing ? 'Eksik: ' . implode(', ', $seo_missing) . '.' : 'Dil, canonical ve paylaşım etiketleri mevcut.');

    // Görseller: alt metni ve dosya boyutu (en fazla 8 görsel HEAD isteğiyle ölçülür)
    $imgs = $xp->query('//img');
    $no_alt = 0;
    $srcs = array();
    foreach ($imgs as $img) {
        if (!$img->hasAttribute('alt')) $no_alt++;
        $src = $img->getAttribute('src') ?: $img->getAttribute('data-src');
        if ($src && stripos($src, 'data:') !== 0) $srcs[] = WP_Http::make_absolute_url($src, $res['final_url']);
    }
    $srcs = array_slice(array_values(array_unique($srcs)), 0, 8);
    $big = array();
    $measured = 0;
    foreach ($srcs as $s) {
        $h = uca_bag_safe_get($s, 'HEAD');
        if (is_wp_error($h)) continue;
        $len = (int) ($h['headers']['content-length'] ?? 0);
        if ($len <= 0) continue;
        $measured++;
        if ($len > 300 * 1024) $big[] = array('url' => esc_url_raw($s), 'kb' => (int) round($len / 1024));
    }
    if (!$imgs->length) $add('images', 'Görseller', 'na', 'Ana sayfada <img> görseli bulunamadı (görseller arka plan olarak yükleniyor olabilir).');
    else {
        $detail = $imgs->length . ' görsel; ' . ($no_alt ? $no_alt . ' tanesinde alternatif metin (alt) yok. ' : 'hepsinde alt metni var. ');
        $detail .= $measured ? ($big ? count($big) . ' görsel 300 KB\'tan büyük (en büyüğü ' . max(array_column($big, 'kb')) . ' KB).' : 'Ölçülen ' . $measured . ' görselin hiçbiri 300 KB\'tan büyük değil.') : 'Görsel boyutları ölçülemedi.';
        $add('images', 'Görseller', $big || $no_alt > 2 ? 'warn' : 'ok', $detail);
    }

    $forms = $xp->query('//form')->length;
    $tel = $xp->query('//a[starts-with(@href,"tel:")]')->length;
    $wa = $xp->query('//a[contains(@href,"wa.me") or contains(@href,"whatsapp.com")]')->length;
    $add('contact', 'İletişim kolaylığı (ana sayfa)', ($forms || $tel || $wa) ? 'ok' : 'warn', ($forms || $tel || $wa) ? 'Ana sayfada ' . implode(', ', array_filter(array($forms ? 'form' : '', $tel ? 'tıklanabilir telefon' : '', $wa ? 'WhatsApp bağlantısı' : ''))) . ' var.' : 'Ana sayfada form, tıklanabilir telefon veya WhatsApp bağlantısı bulunamadı.');

    return array('url' => $res['final_url'], 'checks' => $checks, 'score' => uca_bag_audit_score($checks));
}

/** Ölçülen kontrollerin basit özeti (ölçülemeyenler hesaba katılmaz). */
function uca_bag_audit_score(array $checks) {
    $pts = array('ok' => 1, 'warn' => 0.5, 'bad' => 0);
    $sum = 0; $n = 0;
    foreach ($checks as $c) if (isset($pts[$c['status']])) { $sum += $pts[$c['status']]; $n++; }
    return $n ? (int) round($sum / $n * 100) : null;
}
