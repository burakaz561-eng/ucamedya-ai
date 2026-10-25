<?php
if (!defined('ABSPATH')) exit;

/**
 * UCA Medya temasının "Gelen Mesajlar"ı (uca_mesaj içerik türü): iletişim formu ve talebe çevrilen canlı destek sohbetleri.
 * Tema ve mesajlar DEĞİŞTİRİLMEZ, SİLİNMEZ; uygulamaya aktarılan mesaj yalnızca _uca_bag_synced meta alanıyla işaretlenir.
 */

function uca_bag_theme_enabled() {
    return !empty(uca_bag_settings()['import_theme_messages']) && post_type_exists('uca_mesaj');
}

function uca_bag_theme_pending_count() {
    if (!uca_bag_theme_enabled()) return 0;
    $q = new WP_Query(array(
        'post_type' => 'uca_mesaj', 'post_status' => 'any', 'fields' => 'ids', 'posts_per_page' => 1, 'no_found_rows' => false,
        'meta_query' => array(array('key' => '_uca_bag_synced', 'compare' => 'NOT EXISTS')),
    ));
    return (int) $q->found_posts;
}

/** Aktarılmamış tema mesajlarını uygulamanın beklediği talep biçiminde döndürür. */
function uca_bag_theme_items($limit) {
    if (!uca_bag_theme_enabled() || $limit < 1) return array();
    $posts = get_posts(array(
        'post_type' => 'uca_mesaj', 'post_status' => 'any', 'numberposts' => $limit, 'orderby' => 'ID', 'order' => 'ASC',
        'meta_query' => array(array('key' => '_uca_bag_synced', 'compare' => 'NOT EXISTS')),
        'suppress_filters' => true,
    ));
    $out = array();
    foreach ($posts as $p) {
        $m = function ($k) use ($p) { return (string) get_post_meta($p->ID, $k, true); };
        $services = trim($m('_uca_services'));
        $out[] = array(
            'id'            => (int) $p->ID,
            'source'        => 'theme',
            'kind'          => 'contact',
            'created_at'    => $p->post_date_gmt,
            'submitted_at'  => mysql2date('c', $p->post_date_gmt, false),
            'service'       => $services,
            'service_label' => $services !== '' ? $services : 'İletişim formu',
            'answers'       => $services !== '' ? array('Seçilen hizmetler' => $services) : array(),
            'person_name'   => wp_strip_all_tags($p->post_title),
            'company_name'  => '',
            'email'         => sanitize_email($m('_uca_email')),
            'phone'         => $m('_uca_phone'),
            'website'       => '',
            'message'       => $m('_uca_message'),
            'contact_pref'  => '',
            'page_url'      => esc_url_raw($m('_uca_page')),
            'consent'       => array('kvkk' => false, 'form' => 'theme', 'note' => 'Tema iletişim formu: ziyaretçi iletişim talebini kendisi gönderdi; ayrı onay kutusu kaydı yok.'),
        );
    }
    return $out;
}

function uca_bag_theme_ack(array $ids) {
    $n = 0;
    foreach (array_filter(array_map('absint', $ids)) as $id) {
        if (get_post_type($id) !== 'uca_mesaj' || get_post_meta($id, '_uca_bag_synced', true)) continue;
        update_post_meta($id, '_uca_bag_synced', gmdate('c'));
        $n++;
    }
    return $n;
}
