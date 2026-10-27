<?php
if (!defined('ABSPATH')) exit;

function uca_bag_table() {
    global $wpdb;
    return $wpdb->prefix . 'uca_requests';
}

function uca_bag_install_table() {
    global $wpdb;
    require_once ABSPATH . 'wp-admin/includes/upgrade.php';
    $t = uca_bag_table();
    $c = $wpdb->get_charset_collate();
    dbDelta("CREATE TABLE {$t} (
  id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  kind varchar(20) NOT NULL DEFAULT 'quote',
  data longtext NOT NULL,
  created_at datetime NOT NULL,
  synced_at datetime NULL DEFAULT NULL,
  PRIMARY KEY  (id),
  KEY synced_at (synced_at)
) {$c};");
    if (function_exists('uca_team_install')) uca_team_install();
    update_option('uca_bag_db', UCA_BAG_VERSION, false);
}

add_action('plugins_loaded', function () {
    if (get_option('uca_bag_db') !== UCA_BAG_VERSION) uca_bag_install_table();
});

/** Talebi kaydeder ve (ayarlıysa) yöneticiye bildirim e-postası gönderir. */
function uca_bag_store($kind, array $data) {
    global $wpdb;
    $data['submitted_at'] = gmdate('c');
    $wpdb->insert(uca_bag_table(), array(
        'kind'       => $kind,
        'data'       => wp_json_encode($data, JSON_UNESCAPED_UNICODE),
        'created_at' => current_time('mysql', true),
    ), array('%s', '%s', '%s'));
    $id = (int) $wpdb->insert_id;
    $s = uca_bag_settings();
    if ($id && !empty($s['notify_email']) && is_email($s['notify_email'])) {
        $label = $kind === 'audit' ? 'Ön analiz sonrası iletişim talebi' : 'Teklif talebi';
        $lines = array(
            $label . ' #' . $id,
            'Ad: ' . ($data['person_name'] ?? ''),
            'Şirket: ' . ($data['company_name'] ?? ''),
            'E-posta: ' . ($data['email'] ?? ''),
            'Telefon: ' . ($data['phone'] ?? ''),
            'Hizmet: ' . ($data['service_label'] ?? ''),
            '',
            'Talep UcaMedya AI masaüstü uygulamasına bir sonraki kontrolde aktarılır.',
        );
        wp_mail($s['notify_email'], '[UcaMedya] Yeni ' . strtolower($label), implode("\n", $lines));
    }
    return $id;
}
