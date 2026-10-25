<?php
if (!defined('ABSPATH')) exit;

/* ---------------------------------------------------------------
 * [ucamedya_teklif_formu hizmet="web_design"]
 * JavaScript olmadan da çalışır (tüm soru grupları görünür, yalnızca seçilen hizmetinkiler kaydedilir).
 * ------------------------------------------------------------- */
add_shortcode('ucamedya_teklif_formu', 'uca_bag_quote_shortcode');
function uca_bag_quote_shortcode($atts) {
    $atts = shortcode_atts(array('hizmet' => ''), $atts, 'ucamedya_teklif_formu');
    wp_enqueue_style('uca-bag');
    wp_enqueue_script('uca-bag');
    $services = uca_bag_services();
    $sel = isset($_GET['hizmet']) ? sanitize_key(wp_unslash($_GET['hizmet'])) : sanitize_key($atts['hizmet']);
    $s = uca_bag_settings();
    ob_start();
    if (isset($_GET['uca_sent'])) {
        echo '<div class="uca-box uca-ok" role="status">' . esc_html($s['success_message']) . '</div>';
    }
    if (isset($_GET['uca_err'])) {
        echo '<div class="uca-box uca-err" role="alert">' . esc_html(sanitize_text_field(wp_unslash($_GET['uca_err']))) . '</div>';
    }
    ?>
    <form class="uca-form" method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" data-uca-quote>
        <input type="hidden" name="action" value="uca_quote">
        <input type="hidden" name="uca_ts" value="<?php echo esc_attr(time()); ?>">
        <input type="hidden" name="uca_page" value="">
        <div class="uca-hp" aria-hidden="true"><label>Web adresiniz<input type="text" name="uca_website_hp" tabindex="-1" autocomplete="off"></label></div>

        <label class="uca-f"><span>Hangi hizmetle ilgileniyorsunuz? *</span>
            <select name="uca_service" required data-uca-service>
                <option value="">Seçin</option>
                <?php foreach ($services as $k => $sv) printf('<option value="%s"%s>%s</option>', esc_attr($k), selected($sel, $k, false), esc_html($sv['label'])); ?>
            </select>
        </label>

        <?php foreach ($services as $k => $sv) : ?>
            <fieldset class="uca-group" data-uca-group="<?php echo esc_attr($k); ?>">
                <legend><?php echo esc_html($sv['label']); ?></legend>
                <?php foreach ($sv['questions'] as $qk => $q) uca_bag_render_question($k, $qk, $q); ?>
            </fieldset>
        <?php endforeach; ?>

        <div class="uca-grid">
            <label class="uca-f"><span>Adınız soyadınız *</span><input name="uca_name" required maxlength="120" autocomplete="name"></label>
            <label class="uca-f"><span>Şirket adı</span><input name="uca_company" maxlength="160" autocomplete="organization"></label>
            <label class="uca-f"><span>E-posta *</span><input type="email" name="uca_email" required maxlength="160" autocomplete="email"></label>
            <label class="uca-f"><span>Telefon</span><input type="tel" name="uca_phone" maxlength="40" autocomplete="tel"></label>
        </div>
        <label class="uca-f"><span>Size nasıl ulaşalım?</span>
            <select name="uca_pref"><?php foreach (uca_bag_contact_prefs() as $k => $v) printf('<option value="%s">%s</option>', esc_attr($k), esc_html($v)); ?></select>
        </label>
        <label class="uca-f"><span>Kısaca anlatmak istedikleriniz</span><textarea name="uca_message" rows="4" maxlength="3000"></textarea></label>

        <label class="uca-check"><input type="checkbox" name="uca_kvkk" value="1" required>
            <span><?php echo uca_bag_kvkk_label($s); ?> *</span></label>
        <label class="uca-check"><input type="checkbox" name="uca_marketing" value="1">
            <span>Kampanya ve bilgilendirme iletileri almak istiyorum (isteğe bağlı).</span></label>
        <button type="submit" class="uca-btn">Teklif iste</button>
    </form>
    <?php
    return ob_get_clean();
}

function uca_bag_kvkk_label($s) {
    $link = $s['privacy_url'] ? '<a href="' . esc_url($s['privacy_url']) . '" target="_blank" rel="noopener">KVKK Aydınlatma Metni</a>\'ni' : 'KVKK Aydınlatma Metni\'ni';
    return 'Talebimin yanıtlanması için paylaştığım bilgilerin işlenmesine ilişkin ' . $link . ' okudum';
}

function uca_bag_render_question($svc, $qk, $q) {
    $label = $q[0];
    $type = $q[1];
    $opts = $q[2] ?? null;
    $req = !empty($q[3]);
    $name = 'uca_q[' . $svc . '][' . $qk . ']';
    echo '<label class="uca-f"><span>' . esc_html($label) . ($req ? ' *' : '') . '</span>';
    if ($type === 'select') {
        echo '<select name="' . esc_attr($name) . '">';
        foreach ($opts as $v => $t) printf('<option value="%s">%s</option>', esc_attr($v), esc_html($t));
        echo '</select>';
    } elseif ($type === 'checks') {
        echo '<span class="uca-checks">';
        foreach ($opts as $v => $t) printf('<label><input type="checkbox" name="%s[]" value="%s"> %s</label>', esc_attr($name), esc_attr($v), esc_html($t));
        echo '</span>';
    } else {
        printf('<input type="%s" name="%s" maxlength="300"%s>', $type === 'url' ? 'text' : 'text', esc_attr($name), $req ? ' data-uca-required' : '');
    }
    echo '</label>';
}

/** Seçilen hizmetin yanıtlarını okunabilir etiketlerle döndürür; diğer hizmetlerin alanları atılır. */
function uca_bag_collect_answers($svc, $raw) {
    $services = uca_bag_services();
    $out = array();
    $missing = array();
    foreach ($services[$svc]['questions'] as $qk => $q) {
        $v = $raw[$qk] ?? '';
        if ($q[1] === 'checks') {
            $vals = array_values(array_intersect(array_map('sanitize_key', (array) $v), array_keys($q[2])));
            if ($vals) $out[$q[0]] = implode(', ', array_map(function ($x) use ($q) { return $q[2][$x]; }, $vals));
        } elseif ($q[1] === 'select') {
            $v = sanitize_text_field((string) $v);
            if ($v !== '' && isset($q[2][$v])) $out[$q[0]] = $q[2][$v];
        } else {
            $v = sanitize_text_field((string) $v);
            if ($v !== '') $out[$q[0]] = substr($v, 0, 300);
            elseif (!empty($q[3])) $missing[] = $q[0];
        }
    }
    return array($out, $missing);
}

add_action('admin_post_nopriv_uca_quote', 'uca_bag_handle_quote');
add_action('admin_post_uca_quote', 'uca_bag_handle_quote');
function uca_bag_handle_quote() {
    $back = wp_get_referer() ?: home_url('/');
    $back = remove_query_arg(array('uca_sent', 'uca_err'), $back);
    $fail = function ($msg) use ($back) { wp_safe_redirect(add_query_arg('uca_err', rawurlencode($msg), $back)); exit; };
    $p = wp_unslash($_POST);
    // Spam: gizli alan dolu ya da form 3 saniyeden kısa sürede gönderildiyse sessizce "alındı" deriz
    if (!empty($p['uca_website_hp']) || (time() - (int) ($p['uca_ts'] ?? 0)) < 3) { wp_safe_redirect(add_query_arg('uca_sent', 1, $back)); exit; }
    if (!uca_bag_rate_ok('quote', 5)) $fail('Kısa süre içinde çok fazla talep gönderildi. Lütfen daha sonra tekrar deneyin.');
    $services = uca_bag_services();
    $svc = sanitize_key($p['uca_service'] ?? '');
    if (!isset($services[$svc])) $fail('Lütfen bir hizmet seçin.');
    $name = sanitize_text_field($p['uca_name'] ?? '');
    $email = sanitize_email($p['uca_email'] ?? '');
    if ($name === '' || !is_email($email)) $fail('Ad soyad ve geçerli bir e-posta adresi gerekli.');
    if (empty($p['uca_kvkk'])) $fail('Devam etmek için aydınlatma metnini onaylamanız gerekir.');
    list($answers, $missing) = uca_bag_collect_answers($svc, (array) ($p['uca_q'][$svc] ?? array()));
    if ($missing) $fail('Lütfen doldurun: ' . implode(', ', $missing));
    $prefs = uca_bag_contact_prefs();
    $pref = sanitize_key($p['uca_pref'] ?? 'email');
    $site = '';
    foreach (array('current_site', 'site') as $k) if (!empty($p['uca_q'][$svc][$k])) $site = esc_url_raw(trim(sanitize_text_field($p['uca_q'][$svc][$k])));
    $s = uca_bag_settings();
    uca_bag_store('quote', array(
        'service'       => $svc,
        'service_label' => $services[$svc]['label'],
        'answers'       => $answers,
        'person_name'   => $name,
        'company_name'  => sanitize_text_field($p['uca_company'] ?? ''),
        'email'         => $email,
        'phone'         => sanitize_text_field($p['uca_phone'] ?? ''),
        'website'       => $site,
        'message'       => sanitize_textarea_field($p['uca_message'] ?? ''),
        'contact_pref'  => isset($prefs[$pref]) ? $pref : 'email',
        'page_url'      => esc_url_raw($p['uca_page'] ?? '') ?: esc_url_raw($back),
        'consent'       => array(
            'kvkk'          => true,
            'kvkk_text'     => wp_strip_all_tags(uca_bag_kvkk_label($s)),
            'privacy_url'   => $s['privacy_url'],
            'marketing'     => !empty($p['uca_marketing']),
            'at'            => gmdate('c'),
            'ip_hash'       => uca_bag_ip_hash(),
        ),
    ));
    wp_safe_redirect(add_query_arg('uca_sent', 1, $back) . '#uca');
    exit;
}

/* ---------------------------------------------------------------
 * [ucamedya_on_analiz] — sonuçlar JavaScript ile REST ucundan alınır.
 * ------------------------------------------------------------- */
add_shortcode('ucamedya_on_analiz', function () {
    wp_enqueue_style('uca-bag');
    wp_enqueue_script('uca-bag');
    $s = uca_bag_settings();
    ob_start();
    ?>
    <div class="uca-audit" data-uca-audit>
        <form class="uca-form uca-audit-form" data-uca-audit-form>
            <label class="uca-f"><span>Web sitenizin adresi</span>
                <input name="url" required maxlength="300" placeholder="ornekfirma.com.tr" inputmode="url"></label>
            <button type="submit" class="uca-btn">Ücretsiz ön analizi başlat</button>
            <p class="uca-note">Kontrol edilenler: erişim, HTTPS, sunucu yanıt süresi, sayfa başlığı ve meta açıklaması, mobil görünüm ayarı, temel SEO etiketleri, görsel boyutları. Girdiğiniz adres yalnızca bu analiz için kullanılır ve iletişim bilgisi bırakmadıkça kaydedilmez.</p>
        </form>
        <div class="uca-audit-result" data-uca-audit-result hidden></div>
        <form class="uca-form uca-audit-contact" data-uca-audit-contact hidden>
            <h4>Detaylı analiz ve danışmanlık ister misiniz?</h4>
            <div class="uca-grid">
                <label class="uca-f"><span>Adınız soyadınız *</span><input name="name" required maxlength="120"></label>
                <label class="uca-f"><span>Şirket adı</span><input name="company" maxlength="160"></label>
                <label class="uca-f"><span>E-posta *</span><input type="email" name="email" required maxlength="160"></label>
                <label class="uca-f"><span>Telefon</span><input type="tel" name="phone" maxlength="40"></label>
            </div>
            <label class="uca-f"><span>Size nasıl ulaşalım?</span><select name="pref"><?php foreach (uca_bag_contact_prefs() as $k => $v) printf('<option value="%s">%s</option>', esc_attr($k), esc_html($v)); ?></select></label>
            <label class="uca-check"><input type="checkbox" name="kvkk" value="1" required><span><?php echo uca_bag_kvkk_label($s); ?> *</span></label>
            <label class="uca-check"><input type="checkbox" name="marketing" value="1"><span>Kampanya ve bilgilendirme iletileri almak istiyorum (isteğe bağlı).</span></label>
            <div class="uca-hp" aria-hidden="true"><input type="text" name="hp" tabindex="-1" autocomplete="off"></div>
            <button type="submit" class="uca-btn">Benimle iletişime geçin</button>
            <div class="uca-box" data-uca-audit-msg hidden></div>
        </form>
    </div>
    <?php
    return ob_get_clean();
});
