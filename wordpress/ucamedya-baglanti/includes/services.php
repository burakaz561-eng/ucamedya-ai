<?php
if (!defined('ABSPATH')) exit;

/**
 * Hizmet kategorileri ve her hizmete özel kısa soru seti.
 * Soru türleri: text, url, select, checks. Bütçe ve teslim soruları her zaman isteğe bağlıdır ve
 * "Belirtmek istemiyorum" seçeneği vardır; ziyaretçinin belirtmediği bilgi tahmin edilmez.
 */
function uca_bag_services() {
    $budget = array('' => 'Belirtmek istemiyorum', '0-25k' => '25.000 TL\'ye kadar', '25-50k' => '25.000 – 50.000 TL', '50-100k' => '50.000 – 100.000 TL', '100k+' => '100.000 TL üzeri');
    $budget_monthly = array('' => 'Belirtmek istemiyorum', '0-10k' => 'Aylık 10.000 TL\'ye kadar', '10-25k' => 'Aylık 10.000 – 25.000 TL', '25k+' => 'Aylık 25.000 TL üzeri');
    $when = array('' => 'Belirtmek istemiyorum', 'acil' => '2 hafta içinde', '1ay' => '1 ay içinde', '3ay' => '1–3 ay içinde', 'esnek' => 'Esnek');
    return array(
        'web_design' => array('label' => 'Web tasarımı', 'questions' => array(
            'current_site' => array('Mevcut web siteniz (varsa)', 'url'),
            'pages'        => array('Kaç sayfa düşünüyorsunuz?', 'select', array('' => 'Bilmiyorum', '1-5' => '1–5', '6-10' => '6–10', '10+' => '10\'dan fazla')),
            'features'     => array('İstediğiniz özellikler', 'checks', array('form' => 'Teklif / iletişim formu', 'blog' => 'Blog', 'multilang' => 'Çok dilli', 'booking' => 'Randevu', 'catalog' => 'Ürün kataloğu')),
            'deadline'     => array('Teslim beklentiniz', 'select', $when),
            'budget'       => array('Bütçe aralığınız', 'select', $budget),
        )),
        'ecommerce' => array('label' => 'E-ticaret', 'questions' => array(
            'products'   => array('Yaklaşık ürün sayısı', 'select', array('' => 'Bilmiyorum', '1-50' => '1–50', '50-500' => '50–500', '500+' => '500\'den fazla')),
            'platform'   => array('Mevcut altyapınız', 'select', array('' => 'Henüz yok', 'woocommerce' => 'WooCommerce', 'shopify' => 'Shopify', 'ikas' => 'İkas', 'ticimax' => 'Ticimax', 'other' => 'Diğer')),
            'channels'   => array('Entegrasyon istekleri', 'checks', array('marketplace' => 'Pazaryerleri (Trendyol, Hepsiburada…)', 'erp' => 'Muhasebe / ERP', 'cargo' => 'Kargo')),
            'deadline'   => array('Teslim beklentiniz', 'select', $when),
            'budget'     => array('Bütçe aralığınız', 'select', $budget),
        )),
        'seo' => array('label' => 'SEO', 'questions' => array(
            'site'       => array('Web siteniz', 'url', null, true),
            'region'     => array('Hedef bölge', 'select', array('' => 'Belirtmek istemiyorum', 'local' => 'Yerel (il / ilçe)', 'tr' => 'Türkiye geneli', 'intl' => 'Uluslararası')),
            'topics'     => array('Öne çıkmak istediğiniz konular / anahtar kelimeler', 'text'),
            'previous'   => array('Daha önce SEO çalışması yapıldı mı?', 'select', array('' => 'Bilmiyorum', 'yes' => 'Evet', 'no' => 'Hayır')),
            'budget'     => array('Aylık bütçe aralığınız', 'select', $budget_monthly),
        )),
        'graphic' => array('label' => 'Grafik tasarım', 'questions' => array(
            'items'      => array('İhtiyacınız olan işler', 'checks', array('brochure' => 'Broşür / katalog', 'poster' => 'Afiş / ilan', 'social' => 'Sosyal medya görseli', 'packaging' => 'Ambalaj', 'other' => 'Diğer')),
            'scope'      => array('Kapsam (adet, sayfa vb.)', 'text'),
            'deadline'   => array('Teslim beklentiniz', 'select', $when),
        )),
        'identity' => array('label' => 'Kurumsal kimlik', 'questions' => array(
            'logo'       => array('Logo durumu', 'select', array('' => 'Belirtmek istemiyorum', 'new' => 'Yeni logo', 'refresh' => 'Mevcut logoyu yenileme')),
            'items'      => array('Kapsam', 'checks', array('logo' => 'Logo', 'card' => 'Kartvizit', 'letterhead' => 'Antetli kâğıt', 'guide' => 'Kurumsal kimlik kılavuzu')),
            'deadline'   => array('Teslim beklentiniz', 'select', $when),
            'budget'     => array('Bütçe aralığınız', 'select', $budget),
        )),
        'social' => array('label' => 'Sosyal medya yönetimi', 'questions' => array(
            'platforms'  => array('Platformlar', 'checks', array('instagram' => 'Instagram', 'facebook' => 'Facebook', 'linkedin' => 'LinkedIn', 'tiktok' => 'TikTok', 'youtube' => 'YouTube')),
            'posts'      => array('Aylık paylaşım sayısı', 'select', array('' => 'Bilmiyorum', '8' => '8', '12' => '12', '20+' => '20 ve üzeri')),
            'ads'        => array('Reklam yönetimi de istiyor musunuz?', 'select', array('' => 'Bilmiyorum', 'yes' => 'Evet', 'no' => 'Hayır')),
            'budget'     => array('Aylık bütçe aralığınız', 'select', $budget_monthly),
        )),
        'video' => array('label' => 'Video ve içerik üretimi', 'questions' => array(
            'type'       => array('Video türü', 'select', array('' => 'Belirtmek istemiyorum', 'promo' => 'Tanıtım filmi', 'ad' => 'Reklam', 'product' => 'Ürün çekimi', 'reels' => 'Reels / kısa video', 'drone' => 'Drone çekimi')),
            'location'   => array('Çekim yeri (il)', 'text'),
            'deadline'   => array('Teslim beklentiniz', 'select', $when),
            'budget'     => array('Bütçe aralığınız', 'select', $budget),
        )),
        'maintenance' => array('label' => 'Web sitesi bakım ve destek', 'questions' => array(
            'site'       => array('Web siteniz', 'url', null, true),
            'platform'   => array('Altyapı', 'select', array('' => 'Bilmiyorum', 'wordpress' => 'WordPress', 'other' => 'Diğer')),
            'needs'      => array('İhtiyaçlar', 'checks', array('updates' => 'Güncellemeler', 'backup' => 'Yedekleme', 'security' => 'Güvenlik', 'content' => 'İçerik girişi', 'speed' => 'Hız iyileştirme')),
        )),
    );
}

function uca_bag_contact_prefs() {
    return array('email' => 'E-posta', 'phone' => 'Telefon', 'whatsapp' => 'WhatsApp');
}
