# Ekip sistemi (0.4): giriş, kullanıcılar, ortak veriler

Kararlar (kullanıcı, 2026-10-27):
- Sunucu: ucamedya.com.tr hostingi, UcaMedya Bağlantı eklentisi 2.0.
- Kullanım: ekip aynı anda çalışır.
- Dosyalar: ekran görüntüleri ve PDF'ler de eşitlenir.

## Mimari

```
[Bilgisayar A] ─┐                        ┌─ wp_uca_team_users / tokens
  SQLite (önbellek)  ── HTTPS + oturum ──▶ ├─ wp_uca_team_records  (her kayıt: tür + uid + JSON + seq)
[Bilgisayar B] ─┘   (birkaç saniyede bir) ├─ wp_uca_team_files    (dosyalar: uploads/uca-team-*/, doğrudan erişim kapalı)
                                          └─ wp_uca_team_claims   (gönderim kilidi)
```

- **Çevrimdışı önce:** Her bilgisayar kendi SQLite veritabanıyla çalışmaya devam eder (hızlı, internet kesilince de çalışır). Değişiklikler bir "giden kutusuna" yazılır. Eşitleme motoru:
  - değişiklikleri sunucuya gönderir (push),
  - başkalarının değişikliklerini alır (pull, artan `seq` numarasıyla).
- **Kimlik:** Her satıra küresel bir `uid` eklenir. Yerel sayısal kimlikler bilgisayardan bilgisayara farklı olduğu için tablolar arası bağlantılar gönderilirken `uid`'ye, alınırken yerel kimliğe çevrilir.
- **Çakışma:** Alan düzeyinde son yazan kazanır. İstemci yalnızca değiştirdiği alanları gönderir; bunu son eşitlenen kopyayla (gölge) karşılaştırarak bulur. Örneğin A notu, B aşamayı aynı anda değiştirirse ikisi de korunur.
- **Doğal anahtar birleştirme:** İki kişi aynı iletişim bilgisini ya da aynı web sitesi talebini ayrı ayrı kaydederse yerel benzersiz anahtarda birleştirilir. Örnek anahtarlar: şirket + tür + değer; site + talep no.
- **Gönderim kilidi:** Bir mesaj gönderilmeden önce sunucudan kilit alınır. Böylece iki bilgisayar aynı mesajı gönderemez. Tekrar gönderim engeli ekip genelinde geçerlidir.
- **Dosyalar:** Dosya kayıtları veri klasörüne göre göreli yolla eşitlenir; içerik ayrı yüklenir ve indirilir. Şirket başına ~2–3 MB tutar.
- **Paylaşılan ayarlar:** marka, mesaj şablonları, görsel, ret satırı, puanlama ve aşamalar ekip genelindedir. Cihaza özgü olanlar yerelde kalır: veri klasörü, tarayıcı, webmail oturumu, kuyruk durumu, API anahtarları.

## Eşitlenen / eşitlenmeyen

| Eşitlenir | Eşitlenmez (cihaza özgü) |
|---|---|
| companies, company_contacts, company_tags, tags, notes, stages, stage_history, activity_logs, website_analyses, analysis_findings, screenshots, research_projects, research_results, outreach_permissions, outreach_drafts, outreach_messages, communication_events, suppression_list, services, offers, offer_items, tasks, files, inbound_requests, match_candidates, concepts, saved_filters, automation_profiles + paylaşılan ayarlar | automation_runs, backups, integrations, email_accounts (parolalar), whatsapp_accounts (anahtar), app_settings'in cihaz alanları |

## Kullanıcılar ve yetkiler

- **Admin:** kullanıcı ekler, devre dışı bırakır, şifre sıfırlar, rol verir; paylaşılan ayarları ve aşamaları değiştirir; silme işlemleri.
- **Üye:** araştırma, analiz, taslak, onay, gönderim, teklif, görev.
- **İlk admin:** uygulama sitenin bağlantı anahtarıyla bir kerelik "ekip sunucusunu kur" der ve ilk admin hesabını oluşturur. Mevcut veriler bu bilgisayardan sunucuya yüklenir.
- **Oturum:** şifre sunucuda WordPress'in şifre özetiyle saklanır. Uygulamada yalnızca oturum anahtarı tutulur (işletim sisteminin güvenli deposunda, 30 gün). Giriş denemeleri sınırlıdır.
- Her değişiklikte kimin yaptığı kaydedilir.

## Güvenlik

- **İletişim:** yalnızca HTTPS. Oturum anahtarı sunucuda özet olarak tutulur.
- **Dosyalar:** WordPress yükleme klasöründe rastgele adlı bir klasörde durur, doğrudan erişim kapalıdır. Yalnızca oturum açmış kullanıcılar REST üzerinden indirebilir.
- **KVKK:** müşteri verisi kendi sunucunuzda kalır.

## Aşamalar

1. Sunucu (eklenti 2.0): kullanıcı / oturum, kayıt eşitleme, dosya, kilit, WordPress yönetim sayfası.
2. Masaüstü: `uid` + giden kutusu (migration v4), eşitleme motoru, giriş ekranı, ilk kurulum ve veri yükleme.
3. Admin paneli (kullanıcı yönetimi) + kim yaptı bilgisi.
4. Gönderim kilidi, dosya eşitleme.
5. Testler: iki ayrı uygulama örneği + yerel WordPress ile uçtan uca. Paket 0.4.0.
