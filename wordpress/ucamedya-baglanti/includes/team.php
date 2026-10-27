<?php
if (!defined('ABSPATH')) exit;

/**
 * Ekip sunucusu: UcaMedya AI masaüstü uygulamalarının ortak veritabanı.
 *  - Kullanıcılar (admin / üye), oturum anahtarları (sunucuda yalnızca özet olarak)
 *  - Kayıt eşitleme: her kayıt = tür + uid + JSON; her değişiklik artan bir seq numarası alır (pull: seq > n)
 *  - Alan düzeyinde birleştirme: istemci yalnızca değiştirdiği alanları gönderir
 *  - Dosyalar: uploads altında rastgele adlı, doğrudan erişime kapalı klasörde; yalnızca oturumla indirilebilir
 *  - Gönderim kilidi: aynı mesajın iki bilgisayardan gönderilmesini önler
 */

define('UCA_TEAM_ENTITIES', 'companies,company_contacts,company_tags,tags,notes,stages,stage_history,activity_logs,website_analyses,analysis_findings,screenshots,research_projects,research_results,outreach_permissions,outreach_drafts,outreach_messages,communication_events,suppression_list,services,offers,offer_items,tasks,files,inbound_requests,match_candidates,concepts,saved_filters,automation_profiles,settings');

function uca_team_t($k) {
    global $wpdb;
    return $wpdb->prefix . 'uca_team_' . $k;
}

function uca_team_install() {
    global $wpdb;
    require_once ABSPATH . 'wp-admin/includes/upgrade.php';
    $c = $wpdb->get_charset_collate();
    dbDelta("CREATE TABLE " . uca_team_t('users') . " (
  id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  email varchar(190) NOT NULL,
  name varchar(190) NOT NULL DEFAULT '',
  pass varchar(255) NOT NULL,
  role varchar(20) NOT NULL DEFAULT 'member',
  active tinyint(1) NOT NULL DEFAULT 1,
  created_at datetime NOT NULL,
  last_login datetime NULL DEFAULT NULL,
  PRIMARY KEY  (id),
  UNIQUE KEY email (email)
) {$c};");
    dbDelta("CREATE TABLE " . uca_team_t('tokens') . " (
  id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  user_id bigint(20) unsigned NOT NULL,
  token_hash char(64) NOT NULL,
  device varchar(190) NOT NULL DEFAULT '',
  created_at datetime NOT NULL,
  last_used datetime NULL DEFAULT NULL,
  expires_at datetime NOT NULL,
  PRIMARY KEY  (id),
  UNIQUE KEY token_hash (token_hash),
  KEY user_id (user_id)
) {$c};");
    dbDelta("CREATE TABLE " . uca_team_t('records') . " (
  id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  entity varchar(40) NOT NULL,
  uid varchar(40) NOT NULL,
  seq bigint(20) unsigned NOT NULL,
  data longtext NOT NULL,
  deleted tinyint(1) NOT NULL DEFAULT 0,
  updated_by bigint(20) unsigned NOT NULL DEFAULT 0,
  updated_at datetime NOT NULL,
  PRIMARY KEY  (id),
  UNIQUE KEY entity_uid (entity,uid),
  KEY seq (seq)
) {$c};");
    dbDelta("CREATE TABLE " . uca_team_t('seq') . " (
  id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  at datetime NOT NULL,
  PRIMARY KEY  (id)
) {$c};");
    dbDelta("CREATE TABLE " . uca_team_t('files') . " (
  id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  uid varchar(40) NOT NULL,
  sha256 char(64) NOT NULL,
  fsize bigint(20) unsigned NOT NULL DEFAULT 0,
  fpath varchar(255) NOT NULL,
  created_by bigint(20) unsigned NOT NULL DEFAULT 0,
  created_at datetime NOT NULL,
  PRIMARY KEY  (id),
  UNIQUE KEY uid (uid)
) {$c};");
    dbDelta("CREATE TABLE " . uca_team_t('claims') . " (
  ckey varchar(190) NOT NULL,
  user_id bigint(20) unsigned NOT NULL,
  device varchar(190) NOT NULL DEFAULT '',
  claimed_at datetime NOT NULL,
  expires_at datetime NOT NULL,
  done tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY  (ckey)
) {$c};");
}

/** Dosya klasörü: uploads altında rastgele adlı, doğrudan erişime kapalı. */
function uca_team_files_dir() {
    $up = wp_upload_dir();
    $name = get_option('uca_team_dir');
    if (!$name) {
        $name = 'uca-team-' . strtolower(wp_generate_password(20, false, false));
        update_option('uca_team_dir', $name, false);
    }
    $dir = trailingslashit($up['basedir']) . $name;
    if (!is_dir($dir)) {
        wp_mkdir_p($dir);
        @file_put_contents($dir . '/.htaccess', "Require all denied\nDeny from all\n");
        @file_put_contents($dir . '/index.php', "<?php // sessiz\n");
    }
    return $dir;
}

function uca_team_now() { return current_time('mysql', true); }

function uca_team_next_seq() {
    global $wpdb;
    $wpdb->insert(uca_team_t('seq'), array('at' => uca_team_now()), array('%s'));
    return (int) $wpdb->insert_id;
}

function uca_team_user_public($u) {
    if (!$u) return null;
    return array('id' => (int) $u['id'], 'email' => $u['email'], 'name' => $u['name'], 'role' => $u['role'], 'active' => (bool) $u['active'], 'created_at' => $u['created_at'], 'last_login' => $u['last_login']);
}

function uca_team_issue_token($user_id, $device) {
    global $wpdb;
    $token = 'ucat_' . bin2hex(random_bytes(32));
    $wpdb->insert(uca_team_t('tokens'), array(
        'user_id' => (int) $user_id, 'token_hash' => hash('sha256', $token), 'device' => substr(sanitize_text_field($device), 0, 190),
        'created_at' => uca_team_now(), 'last_used' => uca_team_now(), 'expires_at' => gmdate('Y-m-d H:i:s', time() + 30 * DAY_IN_SECONDS),
    ));
    $wpdb->update(uca_team_t('users'), array('last_login' => uca_team_now()), array('id' => (int) $user_id));
    return $token;
}

/** İstekteki oturum anahtarından kullanıcıyı bulur (yoksa null). */
function uca_team_current(WP_REST_Request $r) {
    global $wpdb;
    $t = (string) ($r->get_header('x_ucamedya_token') ?: '');
    if ($t === '') {
        $a = (string) $r->get_header('authorization');
        if (stripos($a, 'Bearer ucat_') === 0) $t = trim(substr($a, 7));
    }
    if (strpos($t, 'ucat_') !== 0) return null;
    $row = $wpdb->get_row($wpdb->prepare('SELECT t.id AS tid, t.device, t.expires_at, t.last_used, u.* FROM ' . uca_team_t('tokens') . ' t JOIN ' . uca_team_t('users') . ' u ON u.id = t.user_id WHERE t.token_hash = %s', hash('sha256', $t)), ARRAY_A);
    if (!$row || !$row['active'] || strtotime($row['expires_at'] . ' UTC') < time()) return null;
    if (!$row['last_used'] || strtotime($row['last_used'] . ' UTC') < time() - 300) {
        $wpdb->update(uca_team_t('tokens'), array('last_used' => uca_team_now()), array('id' => (int) $row['tid']));
    }
    return $row;
}

function uca_team_perm($role = 'member') {
    return function (WP_REST_Request $r) use ($role) {
        $u = uca_team_current($r);
        if (!$u) return new WP_Error('uca_team_auth', 'Oturum geçersiz veya süresi dolmuş. Lütfen yeniden giriş yapın.', array('status' => 401));
        if ($role === 'admin' && $u['role'] !== 'admin') return new WP_Error('uca_team_forbidden', 'Bu işlem için admin yetkisi gerekir.', array('status' => 403));
        $r->set_param('_uca_user', $u);
        return true;
    };
}

function uca_team_key_ok(WP_REST_Request $r) {
    $key = (string) get_option('uca_bag_key');
    $given = (string) ($r->get_header('x_ucamedya_key') ?: '');
    return $key !== '' && $given !== '' && hash_equals($key, $given);
}

function uca_team_valid_password($p) {
    return is_string($p) && strlen($p) >= 8 && strlen($p) <= 200;
}

function uca_team_admin_count() {
    global $wpdb;
    return (int) $wpdb->get_var('SELECT COUNT(*) FROM ' . uca_team_t('users') . " WHERE role = 'admin' AND active = 1");
}

add_action('rest_api_init', function () {
    global $wpdb;
    $ns = 'ucamedya/v1';
    $member = uca_team_perm('member');
    $admin = uca_team_perm('admin');
    $err = function ($code, $msg, $status = 400) { return new WP_Error($code, $msg, array('status' => $status)); };

    // ---- Durum (oturumsuz): ekip sunucusu kurulu mu?
    register_rest_route($ns, '/team/status', array('methods' => 'GET', 'permission_callback' => '__return_true', 'callback' => function () {
        global $wpdb;
        return array('ok' => true, 'plugin' => UCA_BAG_VERSION, 'site' => get_bloginfo('name'), 'initialized' => ((int) $wpdb->get_var('SELECT COUNT(*) FROM ' . uca_team_t('users'))) > 0);
    }));

    // ---- İlk kurulum: sitenin bağlantı anahtarıyla ilk admin (yalnızca hiç kullanıcı yokken)
    register_rest_route($ns, '/team/bootstrap', array('methods' => 'POST', 'permission_callback' => function (WP_REST_Request $r) use ($err) {
        return uca_team_key_ok($r) ? true : $err('uca_auth', 'Bağlantı anahtarı geçersiz.', 401);
    }, 'callback' => function (WP_REST_Request $r) use ($err) {
        global $wpdb;
        if ((int) $wpdb->get_var('SELECT COUNT(*) FROM ' . uca_team_t('users')) > 0) return $err('uca_team_exists', 'Ekip sunucusu zaten kurulmuş. Mevcut bir admin hesabıyla giriş yapın.', 409);
        $p = $r->get_json_params() ?: array();
        $email = sanitize_email($p['email'] ?? '');
        if (!is_email($email)) return $err('uca_input', 'Geçerli bir e-posta adresi girin.');
        if (!uca_team_valid_password($p['password'] ?? '')) return $err('uca_input', 'Şifre en az 8 karakter olmalı.');
        $wpdb->insert(uca_team_t('users'), array('email' => strtolower($email), 'name' => sanitize_text_field($p['name'] ?? ''), 'pass' => wp_hash_password($p['password']), 'role' => 'admin', 'active' => 1, 'created_at' => uca_team_now()));
        $uid = (int) $wpdb->insert_id;
        $u = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . uca_team_t('users') . ' WHERE id = %d', $uid), ARRAY_A);
        return array('token' => uca_team_issue_token($uid, $p['device'] ?? ''), 'user' => uca_team_user_public($u));
    }));

    // ---- Giriş / çıkış
    register_rest_route($ns, '/team/login', array('methods' => 'POST', 'permission_callback' => '__return_true', 'callback' => function (WP_REST_Request $r) use ($err) {
        global $wpdb;
        if (!uca_bag_rate_ok('team_login', 15)) return $err('uca_rate', 'Çok fazla giriş denemesi. Lütfen bir saat sonra tekrar deneyin.', 429);
        $p = $r->get_json_params() ?: array();
        $email = strtolower(sanitize_email($p['email'] ?? ''));
        $u = $email ? $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . uca_team_t('users') . ' WHERE email = %s', $email), ARRAY_A) : null;
        if (!$u || !wp_check_password((string) ($p['password'] ?? ''), $u['pass'])) return $err('uca_team_login', 'E-posta veya şifre hatalı.', 401);
        if (!$u['active']) return $err('uca_team_login', 'Bu hesap devre dışı bırakılmış. Admin ile görüşün.', 403);
        return array('token' => uca_team_issue_token((int) $u['id'], $p['device'] ?? ''), 'user' => uca_team_user_public($u));
    }));
    register_rest_route($ns, '/team/logout', array('methods' => 'POST', 'permission_callback' => $member, 'callback' => function (WP_REST_Request $r) {
        global $wpdb;
        $u = $r->get_param('_uca_user');
        $wpdb->delete(uca_team_t('tokens'), array('id' => (int) $u['tid']));
        return array('ok' => true);
    }));
    register_rest_route($ns, '/team/me', array('methods' => 'GET', 'permission_callback' => $member, 'callback' => function (WP_REST_Request $r) {
        global $wpdb;
        $u = $r->get_param('_uca_user');
        return array('user' => uca_team_user_public($u), 'last_seq' => (int) $wpdb->get_var('SELECT COALESCE(MAX(seq),0) FROM ' . uca_team_t('records')));
    }));
    register_rest_route($ns, '/team/password', array('methods' => 'POST', 'permission_callback' => $member, 'callback' => function (WP_REST_Request $r) use ($err) {
        global $wpdb;
        $u = $r->get_param('_uca_user');
        $p = $r->get_json_params() ?: array();
        if (!wp_check_password((string) ($p['current'] ?? ''), $u['pass'])) return $err('uca_input', 'Mevcut şifre hatalı.');
        if (!uca_team_valid_password($p['new'] ?? '')) return $err('uca_input', 'Yeni şifre en az 8 karakter olmalı.');
        $wpdb->update(uca_team_t('users'), array('pass' => wp_hash_password($p['new'])), array('id' => (int) $u['id']));
        return array('ok' => true);
    }));

    // ---- Kullanıcı yönetimi (admin)
    register_rest_route($ns, '/team/users', array(
        array('methods' => 'GET', 'permission_callback' => $admin, 'callback' => function () {
            global $wpdb;
            $rows = $wpdb->get_results($wpdb->prepare('SELECT u.*, (SELECT MAX(t.last_used) FROM ' . uca_team_t('tokens') . ' t WHERE t.user_id = u.id) AS last_seen, (SELECT COUNT(*) FROM ' . uca_team_t('tokens') . ' t WHERE t.user_id = u.id AND t.expires_at > %s) AS sessions FROM ' . uca_team_t('users') . ' u ORDER BY u.id', uca_team_now()), ARRAY_A);
            return array('users' => array_map(function ($u) { return uca_team_user_public($u) + array('last_seen' => $u['last_seen'], 'sessions' => (int) $u['sessions']); }, $rows ?: array()));
        }),
        array('methods' => 'POST', 'permission_callback' => $admin, 'callback' => function (WP_REST_Request $r) use ($err) {
            global $wpdb;
            $p = $r->get_json_params() ?: array();
            $email = strtolower(sanitize_email($p['email'] ?? ''));
            if (!is_email($email)) return $err('uca_input', 'Geçerli bir e-posta adresi girin.');
            if (!uca_team_valid_password($p['password'] ?? '')) return $err('uca_input', 'Şifre en az 8 karakter olmalı.');
            if ($wpdb->get_var($wpdb->prepare('SELECT id FROM ' . uca_team_t('users') . ' WHERE email = %s', $email))) return $err('uca_input', 'Bu e-posta ile bir kullanıcı zaten var.');
            $role = ($p['role'] ?? '') === 'admin' ? 'admin' : 'member';
            $wpdb->insert(uca_team_t('users'), array('email' => $email, 'name' => sanitize_text_field($p['name'] ?? ''), 'pass' => wp_hash_password($p['password']), 'role' => $role, 'active' => 1, 'created_at' => uca_team_now()));
            return array('user' => uca_team_user_public($wpdb->get_row($wpdb->prepare('SELECT * FROM ' . uca_team_t('users') . ' WHERE id = %d', (int) $wpdb->insert_id), ARRAY_A)));
        }),
    ));
    register_rest_route($ns, '/team/users/(?P<id>\d+)', array('methods' => 'POST', 'permission_callback' => $admin, 'callback' => function (WP_REST_Request $r) use ($err) {
        global $wpdb;
        $me = $r->get_param('_uca_user');
        $id = (int) $r['id'];
        $u = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . uca_team_t('users') . ' WHERE id = %d', $id), ARRAY_A);
        if (!$u) return $err('uca_input', 'Kullanıcı bulunamadı.', 404);
        $p = $r->get_json_params() ?: array();
        $upd = array();
        if (isset($p['name'])) $upd['name'] = sanitize_text_field($p['name']);
        if (isset($p['role'])) $upd['role'] = $p['role'] === 'admin' ? 'admin' : 'member';
        if (isset($p['active'])) $upd['active'] = $p['active'] ? 1 : 0;
        if (!empty($p['password'])) {
            if (!uca_team_valid_password($p['password'])) return $err('uca_input', 'Şifre en az 8 karakter olmalı.');
            $upd['pass'] = wp_hash_password($p['password']);
        }
        $losesAdmin = $u['role'] === 'admin' && $u['active'] && ((isset($upd['role']) && $upd['role'] !== 'admin') || (isset($upd['active']) && !$upd['active']));
        if ($losesAdmin && uca_team_admin_count() <= 1) return $err('uca_input', 'Son aktif admin kaldırılamaz; önce başka birini admin yapın.');
        if ($id === (int) $me['id'] && isset($upd['active']) && !$upd['active']) return $err('uca_input', 'Kendi hesabınızı devre dışı bırakamazsınız.');
        if ($upd) $wpdb->update(uca_team_t('users'), $upd, array('id' => $id));
        // Devre dışı bırakılan ya da şifresi sıfırlanan kullanıcının oturumları kapatılır
        if ((isset($upd['active']) && !$upd['active']) || isset($upd['pass'])) $wpdb->delete(uca_team_t('tokens'), array('user_id' => $id));
        return array('user' => uca_team_user_public($wpdb->get_row($wpdb->prepare('SELECT * FROM ' . uca_team_t('users') . ' WHERE id = %d', $id), ARRAY_A)));
    }));

    // ---- Kayıt eşitleme
    register_rest_route($ns, '/team/changes', array('methods' => 'GET', 'permission_callback' => $member, 'callback' => function (WP_REST_Request $r) {
        global $wpdb;
        $since = max(0, (int) $r->get_param('since'));
        $limit = max(1, min(1000, (int) ($r->get_param('limit') ?: 500)));
        $rows = $wpdb->get_results($wpdb->prepare('SELECT r.entity, r.uid, r.seq, r.data, r.deleted, r.updated_by, r.updated_at, u.name AS by_name FROM ' . uca_team_t('records') . ' r LEFT JOIN ' . uca_team_t('users') . ' u ON u.id = r.updated_by WHERE r.seq > %d ORDER BY r.seq ASC LIMIT %d', $since, $limit), ARRAY_A);
        $out = array();
        foreach ((array) $rows as $x) {
            $out[] = array('entity' => $x['entity'], 'uid' => $x['uid'], 'seq' => (int) $x['seq'], 'data' => json_decode($x['data'], true), 'deleted' => (bool) $x['deleted'], 'by' => $x['by_name'], 'at' => $x['updated_at']);
        }
        return array('changes' => $out, 'more' => count($out) === $limit, 'last_seq' => $out ? end($out)['seq'] : $since);
    }));

    register_rest_route($ns, '/team/push', array('methods' => 'POST', 'permission_callback' => $member, 'callback' => function (WP_REST_Request $r) use ($err) {
        global $wpdb;
        $u = $r->get_param('_uca_user');
        $p = $r->get_json_params() ?: array();
        $changes = is_array($p['changes'] ?? null) ? array_slice($p['changes'], 0, 500) : array();
        $allowed = array_flip(explode(',', UCA_TEAM_ENTITIES));
        $applied = array();
        foreach ($changes as $c) {
            $entity = (string) ($c['entity'] ?? '');
            $uid = (string) ($c['uid'] ?? '');
            if (!isset($allowed[$entity]) || !preg_match('/^[a-z0-9_-]{6,40}$/', $uid)) continue;
            if ($entity === 'settings' && $u['role'] !== 'admin') continue; // paylaşılan ayarları yalnızca admin değiştirir
            $t = uca_team_t('records');
            $cur = $wpdb->get_row($wpdb->prepare("SELECT id, data, deleted FROM {$t} WHERE entity = %s AND uid = %s", $entity, $uid), ARRAY_A);
            $deleted = !empty($c['deleted']);
            // Alan düzeyinde birleştirme: yalnızca gönderilen alanlar güncellenir
            $data = $cur ? (json_decode($cur['data'], true) ?: array()) : array();
            if (!$deleted && is_array($c['patch'] ?? null)) $data = array_merge($data, $c['patch']);
            $json = wp_json_encode($data, JSON_UNESCAPED_UNICODE);
            if ($json === false) continue;
            $seq = uca_team_next_seq();
            if ($cur) {
                $wpdb->update($t, array('seq' => $seq, 'data' => $json, 'deleted' => $deleted ? 1 : 0, 'updated_by' => (int) $u['id'], 'updated_at' => uca_team_now()), array('id' => (int) $cur['id']));
            } else {
                $wpdb->insert($t, array('entity' => $entity, 'uid' => $uid, 'seq' => $seq, 'data' => $json, 'deleted' => $deleted ? 1 : 0, 'updated_by' => (int) $u['id'], 'updated_at' => uca_team_now()));
            }
            $applied[] = array('entity' => $entity, 'uid' => $uid, 'seq' => $seq, 'data' => $data, 'deleted' => $deleted);
        }
        return array('applied' => $applied);
    }));

    // ---- Dosyalar
    register_rest_route($ns, '/team/files/check', array('methods' => 'POST', 'permission_callback' => $member, 'callback' => function (WP_REST_Request $r) {
        global $wpdb;
        $uids = array_values(array_filter(array_map('strval', (array) (($r->get_json_params() ?: array())['uids'] ?? array())), function ($x) { return (bool) preg_match('/^[a-z0-9_-]{6,40}$/', $x); }));
        if (!$uids) return array('have' => array());
        $in = implode(',', array_fill(0, count($uids), '%s'));
        return array('have' => $wpdb->get_col($wpdb->prepare('SELECT uid FROM ' . uca_team_t('files') . " WHERE uid IN ({$in})", $uids)));
    }));
    register_rest_route($ns, '/team/files', array('methods' => 'POST', 'permission_callback' => $member, 'callback' => function (WP_REST_Request $r) use ($err) {
        global $wpdb;
        $u = $r->get_param('_uca_user');
        $uid = (string) $r->get_param('uid');
        if (!preg_match('/^[a-z0-9_-]{6,40}$/', $uid)) return $err('uca_input', 'Geçersiz dosya kimliği.');
        $f = $r->get_file_params()['file'] ?? null;
        if (!$f || !empty($f['error']) || !is_uploaded_file($f['tmp_name'])) return $err('uca_input', 'Dosya alınamadı (sunucunun yükleme sınırını aşmış olabilir).');
        if ($f['size'] > 50 * 1024 * 1024) return $err('uca_input', 'Dosya 50 MB\'tan büyük olamaz.');
        $dir = uca_team_files_dir();
        $sub = substr($uid, 0, 2);
        wp_mkdir_p($dir . '/' . $sub);
        $rel = $sub . '/' . $uid . '.bin';
        if (!move_uploaded_file($f['tmp_name'], $dir . '/' . $rel)) return $err('uca_io', 'Dosya kaydedilemedi.', 500);
        $sha = hash_file('sha256', $dir . '/' . $rel);
        if ($wpdb->get_var($wpdb->prepare('SELECT id FROM ' . uca_team_t('files') . ' WHERE uid = %s', $uid))) {
            $wpdb->update(uca_team_t('files'), array('sha256' => $sha, 'fsize' => (int) $f['size'], 'fpath' => $rel), array('uid' => $uid));
        } else {
            $wpdb->insert(uca_team_t('files'), array('uid' => $uid, 'sha256' => $sha, 'fsize' => (int) $f['size'], 'fpath' => $rel, 'created_by' => (int) $u['id'], 'created_at' => uca_team_now()));
        }
        return array('ok' => true, 'uid' => $uid, 'sha256' => $sha, 'size' => (int) $f['size']);
    }));
    register_rest_route($ns, '/team/files/(?P<uid>[a-z0-9_-]{6,40})', array('methods' => 'GET', 'permission_callback' => $member, 'callback' => function (WP_REST_Request $r) use ($err) {
        global $wpdb;
        $row = $wpdb->get_row($wpdb->prepare('SELECT fpath FROM ' . uca_team_t('files') . ' WHERE uid = %s', (string) $r['uid']), ARRAY_A);
        $path = $row ? uca_team_files_dir() . '/' . $row['fpath'] : '';
        if (!$row || !is_file($path)) return $err('uca_404', 'Dosya bulunamadı.', 404);
        nocache_headers();
        header('Content-Type: application/octet-stream');
        header('Content-Length: ' . filesize($path));
        readfile($path);
        exit;
    }));

    // ---- Gönderim kilidi
    register_rest_route($ns, '/team/claim', array('methods' => 'POST', 'permission_callback' => $member, 'callback' => function (WP_REST_Request $r) use ($err) {
        global $wpdb;
        $u = $r->get_param('_uca_user');
        $p = $r->get_json_params() ?: array();
        $key = substr(sanitize_text_field($p['key'] ?? ''), 0, 190);
        $device = substr(sanitize_text_field($p['device'] ?? ''), 0, 190);
        if ($key === '') return $err('uca_input', 'Kilit anahtarı yok.');
        $t = uca_team_t('claims');
        $ttl = max(60, min(3600, (int) ($p['ttl'] ?? 900)));
        $now = uca_team_now();
        $exp = gmdate('Y-m-d H:i:s', time() + $ttl);
        // 1) Boşsa doğrudan alınır (birincil anahtar çakışırsa ekleme başarısız olur)
        $wpdb->suppress_errors(true);
        $ins = $wpdb->insert($t, array('ckey' => $key, 'user_id' => (int) $u['id'], 'device' => $device, 'claimed_at' => $now, 'expires_at' => $exp, 'done' => 0));
        $wpdb->suppress_errors(false);
        // 2) Varsa: tamamlanmamış ve (aynı cihaz ya da süresi dolmuş) ise koşullu güncellemeyle devralınır (tek sorgu, yarışa dayanıklı)
        if (!$ins) {
            $wpdb->query($wpdb->prepare("UPDATE {$t} SET user_id = %d, device = %s, claimed_at = %s, expires_at = %s WHERE ckey = %s AND done = 0 AND (device = %s OR expires_at < %s)", (int) $u['id'], $device, $now, $exp, $key, $device, $now));
        }
        $row = $wpdb->get_row($wpdb->prepare("SELECT c.*, u.name FROM {$t} c LEFT JOIN " . uca_team_t('users') . ' u ON u.id = c.user_id WHERE ckey = %s', $key), ARRAY_A);
        $ok = $row && !$row['done'] && $row['device'] === $device;
        return array('ok' => $ok, 'done' => $row ? (bool) $row['done'] : false, 'by' => $row ? ($row['name'] ?: 'başka bir kullanıcı') : null);
    }));
    register_rest_route($ns, '/team/release', array('methods' => 'POST', 'permission_callback' => $member, 'callback' => function (WP_REST_Request $r) {
        global $wpdb;
        $p = $r->get_json_params() ?: array();
        $key = substr(sanitize_text_field($p['key'] ?? ''), 0, 190);
        $device = substr(sanitize_text_field($p['device'] ?? ''), 0, 190);
        $t = uca_team_t('claims');
        if (!empty($p['done'])) $wpdb->query($wpdb->prepare("UPDATE {$t} SET done = 1 WHERE ckey = %s AND device = %s", $key, $device));
        else $wpdb->query($wpdb->prepare("DELETE FROM {$t} WHERE ckey = %s AND device = %s AND done = 0", $key, $device));
        return array('ok' => true);
    }));
});
