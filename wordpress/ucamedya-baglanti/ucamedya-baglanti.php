<?php
/**
 * Plugin Name: UcaMedya Bağlantı — Teklif Formu, Ön Analiz ve Masaüstü Entegrasyonu
 * Description: Hizmete göre soru değiştiren kısa teklif formu ([ucamedya_teklif_formu]), ücretsiz web sitesi ön analiz aracı ([ucamedya_on_analiz]) ve gelen talepleri UcaMedya AI masaüstü uygulamasına güvenli aktaran bağlantı.
 * Version: 1.1.0
 * Requires at least: 6.0
 * Requires PHP: 7.4
 * Author: UcaMedya
 * Text Domain: ucamedya-baglanti
 * License: GPLv2 or later
 */

if (!defined('ABSPATH')) exit;

define('UCA_BAG_VERSION', '1.1.0');
define('UCA_BAG_FILE', __FILE__);

require_once __DIR__ . '/includes/services.php';
require_once __DIR__ . '/includes/store.php';
require_once __DIR__ . '/includes/safe-fetch.php';
require_once __DIR__ . '/includes/audit.php';
require_once __DIR__ . '/includes/theme-messages.php';
require_once __DIR__ . '/includes/forms.php';
require_once __DIR__ . '/includes/rest.php';
require_once __DIR__ . '/includes/admin.php';

register_activation_hook(__FILE__, 'uca_bag_activate');
register_deactivation_hook(__FILE__, 'uca_bag_deactivate');

function uca_bag_activate() {
    uca_bag_install_table();
    if (!get_option('uca_bag_key')) update_option('uca_bag_key', uca_bag_new_key(), false);
    if (!wp_next_scheduled('uca_bag_cleanup')) wp_schedule_event(time() + HOUR_IN_SECONDS, 'daily', 'uca_bag_cleanup');
}

function uca_bag_deactivate() {
    wp_clear_scheduled_hook('uca_bag_cleanup');
}

function uca_bag_new_key() {
    return 'uca_' . wp_generate_password(40, false, false);
}

/** Ayarlar (yönetim panelinden değiştirilebilir). */
function uca_bag_settings() {
    $d = array(
        'privacy_url'     => '',      // KVKK aydınlatma metni sayfası
        'notify_email'    => get_option('admin_email'),
        'retention_days'  => 30,      // uygulamaya aktarılan talepler bu süre sonra siteden silinir
        'audit_per_hour'  => 6,       // aynı ziyaretçi saatte en fazla bu kadar ön analiz yapabilir
        'import_theme_messages' => 1, // UCA Medya temasının "Gelen Mesajlar"ını da uygulamaya aktar
        'success_message' => 'Talebiniz bize ulaştı. En kısa sürede sizinle iletişime geçeceğiz.',
    );
    $s = get_option('uca_bag_settings', array());
    return wp_parse_args(is_array($s) ? $s : array(), $d);
}

/** Ziyaretçi IP'si yalnızca tuzlanmış özet olarak tutulur (hız sınırı ve kötüye kullanım takibi için). */
function uca_bag_ip_hash() {
    $ip = isset($_SERVER['REMOTE_ADDR']) ? sanitize_text_field(wp_unslash($_SERVER['REMOTE_ADDR'])) : '';
    return substr(hash_hmac('sha256', $ip, wp_salt('nonce')), 0, 32);
}

/** Basit hız sınırı: aynı ziyaretçi, aynı işlem için saatte en fazla $max kez. */
function uca_bag_rate_ok($action, $max) {
    $max = (int) apply_filters('uca_bag_rate_limit', $max, $action);
    $k = 'uca_rl_' . $action . '_' . uca_bag_ip_hash();
    $n = (int) get_transient($k);
    if ($n >= $max) return false;
    set_transient($k, $n + 1, HOUR_IN_SECONDS);
    return true;
}

add_action('uca_bag_cleanup', 'uca_bag_cleanup');
function uca_bag_cleanup() {
    global $wpdb;
    $days = max(1, (int) uca_bag_settings()['retention_days']);
    $t = uca_bag_table();
    $wpdb->query($wpdb->prepare("DELETE FROM {$t} WHERE synced_at IS NOT NULL AND synced_at < %s", gmdate('Y-m-d H:i:s', time() - $days * DAY_IN_SECONDS)));
}

add_action('wp_enqueue_scripts', function () {
    wp_register_style('uca-bag', plugins_url('assets/uca.css', UCA_BAG_FILE), array(), UCA_BAG_VERSION);
    wp_register_script('uca-bag', plugins_url('assets/uca.js', UCA_BAG_FILE), array(), UCA_BAG_VERSION, true);
    wp_localize_script('uca-bag', 'UCA_BAG', array(
        'rest' => esc_url_raw(rest_url('ucamedya/v1/')),
    ));
});
