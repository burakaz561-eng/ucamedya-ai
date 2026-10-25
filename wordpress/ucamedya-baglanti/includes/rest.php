<?php
if (!defined('ABSPATH')) exit;

add_action('rest_api_init', function () {
    $ns = 'ucamedya/v1';

    // ---- Ziyaretçi uçları (herkese açık, hız sınırlı)
    register_rest_route($ns, '/audit', array(
        'methods'             => 'POST',
        'permission_callback' => '__return_true',
        'args'                => array('url' => array('type' => 'string', 'required' => true)),
        'callback'            => function (WP_REST_Request $r) {
            if (!uca_bag_rate_ok('audit', max(1, (int) uca_bag_settings()['audit_per_hour']))) return new WP_Error('uca_rate', 'Kısa sürede çok fazla analiz istendi. Lütfen bir saat sonra tekrar deneyin.', array('status' => 429));
            $res = uca_bag_audit((string) $r->get_param('url'));
            if (is_wp_error($res)) return new WP_Error($res->get_error_code(), $res->get_error_message(), array('status' => 400));
            // İletişim formu sonuçla birlikte gönderildiğinde değiştirilmediğini doğrulamak için imza
            $res['sig'] = hash_hmac('sha256', wp_json_encode(array($res['url'], $res['score'])), wp_salt('auth'));
            return $res;
        },
    ));

    register_rest_route($ns, '/audit-contact', array(
        'methods'             => 'POST',
        'permission_callback' => '__return_true',
        'callback'            => function (WP_REST_Request $r) {
            $p = $r->get_json_params() ?: $r->get_body_params();
            if (!empty($p['hp'])) return array('ok' => true);
            if (!uca_bag_rate_ok('audit_contact', 4)) return new WP_Error('uca_rate', 'Kısa sürede çok fazla talep gönderildi.', array('status' => 429));
            $name = sanitize_text_field($p['name'] ?? '');
            $email = sanitize_email($p['email'] ?? '');
            if ($name === '' || !is_email($email)) return new WP_Error('uca_input', 'Ad soyad ve geçerli bir e-posta adresi gerekli.', array('status' => 400));
            if (empty($p['kvkk'])) return new WP_Error('uca_input', 'Devam etmek için aydınlatma metnini onaylamanız gerekir.', array('status' => 400));
            $audit = is_array($p['audit'] ?? null) ? $p['audit'] : array();
            $url = esc_url_raw($audit['url'] ?? '');
            $score = isset($audit['score']) && is_numeric($audit['score']) ? (int) $audit['score'] : null;
            $sig_ok = hash_equals(hash_hmac('sha256', wp_json_encode(array($url, $score)), wp_salt('auth')), (string) ($audit['sig'] ?? ''));
            $checks = array();
            foreach ((array) ($audit['checks'] ?? array()) as $c) {
                if (!is_array($c)) continue;
                $checks[sanitize_text_field($c['label'] ?? '')] = sanitize_key($c['status'] ?? '') . ' — ' . sanitize_text_field($c['detail'] ?? '');
            }
            $prefs = uca_bag_contact_prefs();
            $pref = sanitize_key($p['pref'] ?? 'email');
            $s = uca_bag_settings();
            $id = uca_bag_store('audit', array(
                'service'       => 'audit',
                'service_label' => 'Ücretsiz web sitesi ön analizi',
                'answers'       => array_slice($checks, 0, 20, true) + array('Ön analiz puanı' => $score === null ? 'ölçülemedi' : $score . '/100', 'Sonuç doğrulandı' => $sig_ok ? 'evet' : 'hayır (tarayıcıda değiştirilmiş olabilir)'),
                'person_name'   => $name,
                'company_name'  => sanitize_text_field($p['company'] ?? ''),
                'email'         => $email,
                'phone'         => sanitize_text_field($p['phone'] ?? ''),
                'website'       => $url,
                'message'       => 'Ön analiz sonrası detaylı analiz / danışmanlık talebi.',
                'contact_pref'  => isset($prefs[$pref]) ? $pref : 'email',
                'page_url'      => esc_url_raw($r->get_header('referer') ?: ''),
                'consent'       => array('kvkk' => true, 'kvkk_text' => wp_strip_all_tags(uca_bag_kvkk_label($s)), 'privacy_url' => $s['privacy_url'], 'marketing' => !empty($p['marketing']), 'at' => gmdate('c'), 'ip_hash' => uca_bag_ip_hash()),
            ));
            return array('ok' => (bool) $id, 'message' => $s['success_message']);
        },
    ));

    // ---- Masaüstü uygulaması uçları (bağlantı anahtarı gerekir)
    $auth = function (WP_REST_Request $r) {
        $key = (string) get_option('uca_bag_key');
        $given = (string) ($r->get_header('x_ucamedya_key') ?: '');
        if ($given === '') {
            $a = (string) $r->get_header('authorization');
            if (stripos($a, 'Bearer ') === 0) $given = trim(substr($a, 7));
        }
        if ($key === '' || $given === '' || !hash_equals($key, $given)) return new WP_Error('uca_auth', 'Bağlantı anahtarı geçersiz.', array('status' => 401));
        return true;
    };

    register_rest_route($ns, '/ping', array(
        'methods' => 'GET', 'permission_callback' => $auth,
        'callback' => function () {
            global $wpdb;
            $t = uca_bag_table();
            return array('ok' => true, 'site' => get_bloginfo('name'), 'url' => home_url('/'), 'plugin' => UCA_BAG_VERSION, 'pending' => (int) $wpdb->get_var("SELECT COUNT(*) FROM {$t} WHERE synced_at IS NULL"));
        },
    ));

    register_rest_route($ns, '/requests', array(
        'methods' => 'GET', 'permission_callback' => $auth,
        'callback' => function (WP_REST_Request $r) {
            global $wpdb;
            $t = uca_bag_table();
            $limit = max(1, min(100, (int) ($r->get_param('limit') ?: 50)));
            $rows = $wpdb->get_results($wpdb->prepare("SELECT id, kind, data, created_at FROM {$t} WHERE synced_at IS NULL ORDER BY id ASC LIMIT %d", $limit), ARRAY_A);
            return array('items' => array_map(function ($row) {
                $d = json_decode($row['data'], true) ?: array();
                return array('id' => (int) $row['id'], 'kind' => $row['kind'], 'created_at' => $row['created_at']) + $d;
            }, $rows ?: array()));
        },
    ));

    register_rest_route($ns, '/requests/ack', array(
        'methods' => 'POST', 'permission_callback' => $auth,
        'callback' => function (WP_REST_Request $r) {
            global $wpdb;
            $ids = array_filter(array_map('absint', (array) ($r->get_json_params()['ids'] ?? array())));
            if (!$ids) return array('acked' => 0);
            $t = uca_bag_table();
            $in = implode(',', array_fill(0, count($ids), '%d'));
            $n = $wpdb->query($wpdb->prepare("UPDATE {$t} SET synced_at = %s WHERE synced_at IS NULL AND id IN ({$in})", array_merge(array(current_time('mysql', true)), $ids)));
            return array('acked' => (int) $n);
        },
    ));
});
