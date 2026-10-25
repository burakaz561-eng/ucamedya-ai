<?php
if (!defined('ABSPATH')) exit;

/**
 * Ziyaretçinin girdiği adresi güvenli hâle getirir. Yalnızca http/https, 80/443 portu, kullanıcı adı/şifresiz,
 * herkese açık IP'ye çözülen alan adlarına izin verilir. localhost, özel (10.x, 192.168.x, 172.16-31.x),
 * ayrılmış, bağlantı-yerel (169.254.x — bulut meta veri servisi dahil) ve IPv6 yerel adresler reddedilir.
 * Dönüş: normalize URL ya da WP_Error.
 */
function uca_bag_safe_target($raw) {
    $raw = trim((string) $raw);
    if ($raw === '' || strlen($raw) > 300) return new WP_Error('uca_url', 'Geçerli bir web sitesi adresi girin.');
    if (!preg_match('#^https?://#i', $raw)) $raw = 'https://' . $raw;
    $p = wp_parse_url($raw);
    if (!$p || empty($p['host']) || !in_array(strtolower($p['scheme'] ?? ''), array('http', 'https'), true)) return new WP_Error('uca_url', 'Geçerli bir web sitesi adresi girin.');
    if (isset($p['user']) || isset($p['pass'])) return new WP_Error('uca_url', 'Bu adres biçimi desteklenmiyor.');
    if (isset($p['port']) && !in_array((int) $p['port'], array(80, 443), true)) return new WP_Error('uca_url', 'Yalnızca standart web portları desteklenir.');
    $host = strtolower(rtrim($p['host'], '.'));
    if ($host === 'localhost' || preg_match('/\.(local|localhost|internal|intranet|lan|home|corp)$/', $host) || strpos($host, '.') === false) {
        return new WP_Error('uca_url', 'Bu adres analiz edilemez.');
    }
    $ips = uca_bag_resolve($host);
    if (!$ips) return new WP_Error('uca_dns', 'Alan adı bulunamadı. Adresi kontrol edin.');
    foreach ($ips as $ip) {
        if (!uca_bag_public_ip($ip)) return new WP_Error('uca_url', 'Bu adres analiz edilemez.');
    }
    $path = isset($p['path']) ? $p['path'] : '/';
    $q = isset($p['query']) ? '?' . $p['query'] : '';
    return strtolower($p['scheme']) . '://' . $host . (isset($p['port']) ? ':' . (int) $p['port'] : '') . $path . $q;
}

function uca_bag_resolve($host) {
    if (filter_var($host, FILTER_VALIDATE_IP)) return array($host);
    if (preg_match('/^\[(.+)\]$/', $host, $m) && filter_var($m[1], FILTER_VALIDATE_IP)) return array($m[1]);
    $ips = @gethostbynamel($host) ?: array();
    if (function_exists('dns_get_record')) {
        $aaaa = @dns_get_record($host, DNS_AAAA);
        if (is_array($aaaa)) foreach ($aaaa as $r) if (!empty($r['ipv6'])) $ips[] = $r['ipv6'];
    }
    return array_values(array_unique($ips));
}

function uca_bag_public_ip($ip) {
    return (bool) apply_filters('uca_bag_ip_is_public', uca_bag_public_ip_raw($ip), $ip);
}

function uca_bag_public_ip_raw($ip) {
    if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) return false;
    // PHP sürümüne göre kapsanmayabilecek aralıklar: CGNAT 100.64/10, 0.0.0.0/8, IPv6 ULA/yerel, IPv4 eşlemeli IPv6
    if (preg_match('/^(0\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|127\.|169\.254\.)/', $ip)) return false;
    if (stripos($ip, '::ffff:') === 0) return uca_bag_public_ip_raw(substr($ip, 7));
    if (preg_match('/^(fc|fd|fe8|fe9|fea|feb|::1$|::$)/i', $ip)) return false;
    return true;
}

/**
 * Güvenli GET: hedef her istekte (yönlendirmeler dahil) yeniden doğrulanır; boyut ve süre sınırlıdır.
 * Dönüş: array(status, headers, body, final_url, ms) ya da WP_Error.
 */
function uca_bag_safe_get($url, $method = 'GET', $max_bytes = 1500000) {
    $hops = 0;
    $t0 = microtime(true);
    while (true) {
        $safe = uca_bag_safe_target($url);
        if (is_wp_error($safe)) return $safe;
        $args = array(
            'timeout'             => 10,
            'redirection'         => 0, // yönlendirmeler burada tek tek doğrulanır
            'reject_unsafe_urls'  => true,
            'limit_response_size' => $max_bytes,
            'user-agent'          => 'UcaMedya-OnAnaliz/1.0 (+' . home_url('/') . ')',
            'headers'             => array('Accept' => 'text/html,application/xhtml+xml,*/*;q=0.8'),
        );
        $r = $method === 'HEAD' ? wp_safe_remote_head($safe, $args) : wp_safe_remote_get($safe, $args);
        if (is_wp_error($r)) return new WP_Error('uca_fetch', 'Siteye ulaşılamadı: ' . $r->get_error_message());
        $code = (int) wp_remote_retrieve_response_code($r);
        $loc = wp_remote_retrieve_header($r, 'location');
        if ($code >= 300 && $code < 400 && $loc && $hops < 4) {
            $hops++;
            $url = WP_Http::make_absolute_url($loc, $safe);
            continue;
        }
        return array(
            'status'    => $code,
            'headers'   => wp_remote_retrieve_headers($r),
            'body'      => (string) wp_remote_retrieve_body($r),
            'final_url' => $safe,
            'ms'        => (int) round((microtime(true) - $t0) * 1000),
            'hops'      => $hops,
        );
    }
}
