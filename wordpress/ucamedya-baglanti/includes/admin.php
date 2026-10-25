<?php
if (!defined('ABSPATH')) exit;

add_action('admin_menu', function () {
    add_options_page('UcaMedya Bağlantı', 'UcaMedya Bağlantı', 'manage_options', 'ucamedya-baglanti', 'uca_bag_admin_page');
});

add_action('admin_post_uca_bag_save', function () {
    if (!current_user_can('manage_options')) wp_die('Yetkiniz yok.');
    check_admin_referer('uca_bag_save');
    $p = wp_unslash($_POST);
    if (!empty($p['regen'])) {
        update_option('uca_bag_key', uca_bag_new_key(), false);
    } else {
        update_option('uca_bag_settings', array(
            'privacy_url'     => esc_url_raw($p['privacy_url'] ?? ''),
            'notify_email'    => sanitize_email($p['notify_email'] ?? ''),
            'retention_days'  => max(1, min(365, (int) ($p['retention_days'] ?? 30))),
            'audit_per_hour'  => max(1, min(100, (int) ($p['audit_per_hour'] ?? 6))),
            'success_message' => sanitize_text_field($p['success_message'] ?? ''),
        ), false);
    }
    wp_safe_redirect(add_query_arg(array('page' => 'ucamedya-baglanti', 'saved' => 1), admin_url('options-general.php')));
    exit;
});

function uca_bag_admin_page() {
    if (!current_user_can('manage_options')) return;
    global $wpdb;
    $s = uca_bag_settings();
    $t = uca_bag_table();
    $pending = (int) $wpdb->get_var("SELECT COUNT(*) FROM {$t} WHERE synced_at IS NULL");
    $recent = $wpdb->get_results("SELECT id, kind, data, created_at, synced_at FROM {$t} ORDER BY id DESC LIMIT 15", ARRAY_A);
    ?>
    <div class="wrap">
        <h1>UcaMedya Bağlantı</h1>
        <?php if (isset($_GET['saved'])) echo '<div class="notice notice-success"><p>Kaydedildi.</p></div>'; ?>
        <h2>Masaüstü uygulaması bağlantısı</h2>
        <p>UcaMedya AI → <b>Web Sitesi Talepleri → Bağlantı ayarları</b> bölümüne aşağıdaki iki bilgiyi girin. Uygulama birkaç dakikada bir yeni talepleri bu siteden çeker; anahtar olmadan talepler okunamaz.</p>
        <table class="form-table" role="presentation">
            <tr><th>Site adresi</th><td><code><?php echo esc_html(home_url('/')); ?></code></td></tr>
            <tr><th>Bağlantı anahtarı</th><td><input type="text" readonly class="regular-text code" value="<?php echo esc_attr(get_option('uca_bag_key')); ?>" onclick="this.select()" style="width:32em">
                <p class="description">Bu anahtarı kimseyle paylaşmayın. Sızdığını düşünüyorsanız yenileyin ve uygulamaya yenisini girin.</p></td></tr>
            <tr><th>Uygulamaya aktarılmayı bekleyen</th><td><?php echo (int) $pending; ?> talep</td></tr>
        </table>
        <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
            <?php wp_nonce_field('uca_bag_save'); ?><input type="hidden" name="action" value="uca_bag_save"><input type="hidden" name="regen" value="1">
            <?php submit_button('Anahtarı yenile', 'secondary', 'submit', false, array('onclick' => "return confirm('Eski anahtar çalışmayı durduracak. Devam edilsin mi?')")); ?>
        </form>

        <h2>Ayarlar</h2>
        <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
            <?php wp_nonce_field('uca_bag_save'); ?><input type="hidden" name="action" value="uca_bag_save">
            <table class="form-table" role="presentation">
                <tr><th><label for="privacy_url">KVKK aydınlatma metni sayfası</label></th><td><input id="privacy_url" name="privacy_url" type="url" class="regular-text" value="<?php echo esc_attr($s['privacy_url']); ?>"><p class="description">Formlardaki onay kutusunda bağlantı olarak gösterilir. Metnin içeriğini hukuk danışmanınızla hazırlayın.</p></td></tr>
                <tr><th><label for="notify_email">Yeni talep bildirimi e-postası</label></th><td><input id="notify_email" name="notify_email" type="email" class="regular-text" value="<?php echo esc_attr($s['notify_email']); ?>"><p class="description">Boş bırakılırsa e-posta gönderilmez.</p></td></tr>
                <tr><th><label for="retention_days">Siteden silme süresi (gün)</label></th><td><input id="retention_days" name="retention_days" type="number" min="1" max="365" value="<?php echo (int) $s['retention_days']; ?>"><p class="description">Uygulamaya aktarılan talepler bu süre sonunda WordPress veritabanından silinir (veri azaltma).</p></td></tr>
                <tr><th><label for="audit_per_hour">Ön analiz sınırı (saatlik)</label></th><td><input id="audit_per_hour" name="audit_per_hour" type="number" min="1" max="100" value="<?php echo (int) $s['audit_per_hour']; ?>"><p class="description">Aynı ziyaretçinin bir saatte başlatabileceği en fazla analiz sayısı (kötüye kullanıma karşı).</p></td></tr>
                <tr><th><label for="success_message">Gönderim sonrası mesaj</label></th><td><input id="success_message" name="success_message" type="text" class="large-text" value="<?php echo esc_attr($s['success_message']); ?>"></td></tr>
            </table>
            <?php submit_button('Kaydet'); ?>
        </form>

        <h2>Kısa kodlar</h2>
        <p><code>[ucamedya_teklif_formu]</code> — hizmete göre soru değiştiren teklif formu. Belirli bir hizmetle açmak için: <code>[ucamedya_teklif_formu hizmet="seo"]</code> (web_design, ecommerce, seo, graphic, identity, social, video, maintenance) ya da sayfa adresine <code>?hizmet=seo</code>.</p>
        <p><code>[ucamedya_on_analiz]</code> — ücretsiz web sitesi ön analiz aracı.</p>

        <h2>Son talepler</h2>
        <table class="widefat striped"><thead><tr><th>#</th><th>Tür</th><th>Kişi / Şirket</th><th>Hizmet</th><th>Tarih (UTC)</th><th>Uygulamaya aktarıldı</th></tr></thead><tbody>
        <?php if (!$recent) echo '<tr><td colspan="6">Henüz talep yok.</td></tr>'; foreach ((array) $recent as $r) { $d = json_decode($r['data'], true) ?: array(); ?>
            <tr><td><?php echo (int) $r['id']; ?></td><td><?php echo esc_html($r['kind'] === 'audit' ? 'Ön analiz' : 'Teklif'); ?></td>
                <td><?php echo esc_html(trim(($d['person_name'] ?? '') . ' / ' . ($d['company_name'] ?? ''), ' /')); ?></td>
                <td><?php echo esc_html($d['service_label'] ?? ''); ?></td><td><?php echo esc_html($r['created_at']); ?></td>
                <td><?php echo $r['synced_at'] ? esc_html($r['synced_at']) : '—'; ?></td></tr>
        <?php } ?>
        </tbody></table>
    </div>
    <?php
}
