// UcaMedya AI Asistanı ("Uca"): soruları YALNIZCA veritabanındaki kayıtlarla yanıtlar.
//
// - Önce kural tabanlı niyet eşleştirme çalışır (yapay zekâ gerekmez, sonuçlar doğrudan sorgudan gelir).
// - Eşleşmeyen soruda yapay zekâ açıksa, ona yalnızca özet sayılar ve listeler verilir; yanıtını bu veriyle sınırlaması istenir.
// - Asistan mesaj/teklif GÖNDERMEZ, veri SİLMEZ. Önerdiği değişiklikler (ör. görev oluşturma) arayüzde açık onayla yapılır.

import type { Db } from '../database/db'
import type { AiProvider } from '../integrations/ai/ai-client'
import { fold } from '@shared/text'

export interface AssistantItem {
  label: string
  sub?: string
  companyId?: number
  path?: string // açılabilir dosya (rapor PDF'i)
}

export interface AssistantAction {
  label: string
  kind: 'navigate' | 'create_tasks'
  page?: string
  params?: Record<string, unknown>
  companyIds?: number[]
  taskTitle?: string
  confirm?: string // varsa arayüz bu metinle onay ister
}

export interface AssistantReply {
  text: string
  items?: AssistantItem[]
  actions?: AssistantAction[]
  source: 'data' | 'ai' | 'help'
}

const SERVICE_WORDS: { re: RegExp; keys: string[]; label: string }[] = [
  { re: /web ?tasarim|web sitesi|kurumsal site|site yenile|yeni site/, keys: ['corporate_web', 'redesign', 'wordpress'], label: 'web tasarım' },
  { re: /seo|arama motoru|google'?da/, keys: ['technical_seo', 'seo_consulting'], label: 'SEO' },
  { re: /e-?ticaret|online satis/, keys: ['ecommerce'], label: 'e-ticaret' },
  { re: /kurumsal kimlik|logo/, keys: ['identity'], label: 'kurumsal kimlik' },
  { re: /hiz|performans/, keys: ['speed'], label: 'hız optimizasyonu' },
  { re: /bakim|destek/, keys: ['maintenance'], label: 'bakım ve destek' },
  { re: /sosyal medya/, keys: ['social_design', 'content'], label: 'sosyal medya' }
]

export const EXAMPLES = [
  'Bugün neler yapmalıyım?',
  'Bu hafta web tasarım hizmetiyle en çok eşleşen şirketleri göster',
  'İncelenmemiş müşteri kayıtlarını listele',
  'Teklif hazırlamam gereken müşterileri göster',
  'Yanıt bekleyen teklifler',
  'İletişim bilgisi eksik şirketler',
  'Hata veren araştırma görevleri',
  'EmlaXo analiz raporunu aç'
]

export class Assistant {
  constructor(
    private db: Db,
    private getAi: () => AiProvider | null
  ) {}

  /** Günlük özet (panel açıldığında gösterilir). */
  summary(): AssistantReply {
    const n = (sql: string) => this.db.get<{ n: number }>(sql)?.n ?? 0
    const lines: [number, string, AssistantAction][] = [
      [n("SELECT COUNT(*) AS n FROM tasks WHERE status IN ('open','in_progress') AND due_at IS NOT NULL AND date(due_at,'localtime') < date('now','localtime')"), 'geciken görev', { label: 'Görevler', kind: 'navigate', page: 'followup' }],
      [n("SELECT COUNT(*) AS n FROM tasks WHERE status IN ('open','in_progress') AND date(due_at,'localtime') = date('now','localtime')"), 'bugün yapılacak görev', { label: 'Görevler', kind: 'navigate', page: 'followup' }],
      [n("SELECT COUNT(*) AS n FROM inbound_requests WHERE status = 'new'"), 'yeni web sitesi talebi', { label: 'Talepler', kind: 'navigate', page: 'leads' }],
      [n("SELECT COUNT(*) AS n FROM companies WHERE stage_key = 'review' AND merged_into IS NULL AND archived_at IS NULL"), 'inceleme bekleyen şirket', { label: 'Müşteri Havuzu', kind: 'navigate', page: 'companies', params: { stage: 'review' } }],
      [n("SELECT COUNT(*) AS n FROM outreach_drafts WHERE status = 'draft'"), 'onay bekleyen mesaj taslağı', { label: 'Mesaj Stüdyosu', kind: 'navigate', page: 'studio' }],
      [n("SELECT COUNT(*) AS n FROM offers WHERE status IN ('sent','negotiation')"), 'yanıt bekleyen teklif', { label: 'Teklifler', kind: 'navigate', page: 'offers' }],
      [n("SELECT COUNT(*) AS n FROM website_analyses WHERE status = 'done' AND company_id IS NOT NULL AND finished_at >= datetime('now','-1 day')"), 'son 24 saatte tamamlanan analiz', { label: 'Analizler', kind: 'navigate', page: 'analysis' }],
      [n("SELECT COUNT(*) AS n FROM match_candidates WHERE status = 'pending'"), 'onay bekleyen olası eşleşme', { label: 'Müşteri Havuzu', kind: 'navigate', page: 'companies' }],
      [n("SELECT COUNT(*) AS n FROM automation_runs WHERE status IN ('failed','interrupted') AND created_at >= datetime('now','-7 day')"), 'son 7 günde hata veren otomasyon', { label: 'Otomasyonlar', kind: 'navigate', page: 'automations' }]
    ]
    const active = lines.filter(([v]) => v > 0)
    if (!active.length) return { text: 'Şu an bekleyen bir iş görünmüyor. Yeni müşteri bulmak için AI Müşteri Bulucu\'yu kullanabilirsiniz.', source: 'data', actions: [{ label: 'AI Müşteri Bulucu', kind: 'navigate', page: 'finder' }] }
    return {
      text: 'Bugünün özeti:',
      items: active.map(([v, l]) => ({ label: `${v} ${l}` })),
      actions: active.slice(0, 4).map(([, , a]) => a).filter((a, i, arr) => arr.findIndex((x) => x.page === a.page) === i),
      source: 'data'
    }
  }

  async ask(question: string, context?: { companyId?: number }): Promise<AssistantReply> {
    const q = fold(question).replace(/[?!.,]/g, ' ').replace(/\s+/g, ' ').trim()
    if (!q || /^(merhaba|selam|ozet|durum|bugun ne|bugun neler|ne yapmaliyim|neler yapmaliyim)/.test(q) || /bugun.*(yap|gorev|is )/.test(q)) {
      return this.todayTasks()
    }
    if (/\b(gonder|yolla|sil|kaldir|temizle)\b/.test(q) && !/(gonderilen|gonderilmis|bekleyen)/.test(q)) {
      return {
        text: 'Mesaj veya teklif gönderme ve kayıt silme işlemlerini ben yapmıyorum. Bu işlemler ilgili ekranda sizin önizleyip onaylamanızla yapılır.',
        actions: [{ label: 'İletişim Merkezi', kind: 'navigate', page: 'communication' }, { label: 'Teklifler', kind: 'navigate', page: 'offers' }],
        source: 'help'
      }
    }
    if (/rapor/.test(q) && /(ac|goster|nerede)/.test(q)) return this.openReport(q, context?.companyId)
    if (/(incelenmemis|inceleme bekleyen|incelenmesi gereken|bakilmamis)/.test(q)) return this.unreviewed()
    if (/teklif/.test(q) && /(hazirla|olustur|gereken|yapmam)/.test(q)) return this.needOffer()
    if (/teklif/.test(q) && /(yanit|cevap|bekleyen|gonderilen|acik)/.test(q)) return this.openOffers()
    if (/(eksik|olmayan|bulunamayan).*(iletisim|telefon|e-?posta|mail)|(iletisim|telefon|e-?posta).*(eksik|yok)/.test(q)) return this.missingContacts()
    if (/(hata|basarisiz|patla|calismayan)/.test(q)) return this.failedJobs()
    if (/(web sitesi|site) talep|gelen talep|form/.test(q)) return this.leads()
    if (/analiz/.test(q) && /(tamam|biten|bitti|yapilan|edilen)/.test(q)) return this.recentAnalyses(/hafta/.test(q) ? 7 : /bugun/.test(q) ? 1 : 30)
    const svc = SERVICE_WORDS.find((s) => s.re.test(q))
    if (svc && /(eslesen|uyumlu|uygun|ihtiyac|firsat|goster|listele|hangi)/.test(q)) return this.serviceMatches(svc, /hafta/.test(q) ? 7 : /bugun/.test(q) ? 1 : /ay\b|bu ay/.test(q) ? 30 : null)
    return this.fallback(question)
  }

  private companyItems(rows: { id: number; name: string; city: string | null; score?: number | null; extra?: string | null }[]): AssistantItem[] {
    return rows.map((r) => ({ label: r.name, sub: [r.city, r.score != null ? `puan ${r.score}` : null, r.extra].filter(Boolean).join(' · '), companyId: r.id }))
  }

  private todayTasks(): AssistantReply {
    const rows = this.db.all<{ id: number; title: string; due_at: string | null; company_id: number | null; company: string | null; overdue: number }>(
      `SELECT t.id, t.title, t.due_at, t.company_id, c.name AS company, (date(t.due_at,'localtime') < date('now','localtime')) AS overdue FROM tasks t LEFT JOIN companies c ON c.id = t.company_id
       WHERE t.status IN ('open','in_progress') AND t.due_at IS NOT NULL AND date(t.due_at,'localtime') <= date('now','localtime') ORDER BY t.due_at LIMIT 30`
    )
    const sum = this.summary()
    if (!rows.length) return { ...sum, text: `Bugün için ya da geciken görev yok. ${sum.items?.length ? 'Genel durum:' : ''}`.trim() }
    return {
      text: `${rows.filter((r) => r.overdue).length} geciken, ${rows.filter((r) => !r.overdue).length} bugünkü görev var.`,
      items: rows.map((r) => ({ label: `${r.overdue ? '⚠ ' : ''}${r.title}`, sub: [r.company, r.due_at ? new Date(r.due_at).toLocaleDateString('tr-TR') : null].filter(Boolean).join(' · '), companyId: r.company_id ?? undefined })),
      actions: [{ label: 'Takip Planlayıcısı', kind: 'navigate', page: 'followup' }],
      source: 'data'
    }
  }

  private unreviewed(): AssistantReply {
    const rows = this.db.all<{ id: number; name: string; city: string | null; score: number | null }>(
      "SELECT id, name, city, opportunity_score AS score FROM companies WHERE merged_into IS NULL AND archived_at IS NULL AND stage_key IN ('review','new','analyzed') ORDER BY stage_key = 'review' DESC, opportunity_score IS NULL, opportunity_score DESC LIMIT 40"
    )
    if (!rows.length) return { text: 'İnceleme bekleyen müşteri kaydı yok.', source: 'data' }
    return { text: `${rows.length} kayıt inceleme bekliyor (yeni bulunan, analizi biten ve "İnceleme bekliyor" aşamasındakiler).`, items: this.companyItems(rows), actions: [{ label: 'Müşteri Havuzu', kind: 'navigate', page: 'companies' }], source: 'data' }
  }

  private needOffer(): AssistantReply {
    const rows = this.db.all<{ id: number; name: string; city: string | null; score: number | null; extra: string }>(
      `SELECT c.id, c.name, c.city, c.opportunity_score AS score, s.label AS extra FROM companies c JOIN stages s ON s.key = c.stage_key
       WHERE c.merged_into IS NULL AND c.archived_at IS NULL AND c.stage_key IN ('meeting','replied','negotiation','approved')
       AND NOT EXISTS (SELECT 1 FROM offers o WHERE o.company_id = c.id AND o.status IN ('draft','sent','negotiation'))
       ORDER BY c.stage_key = 'meeting' DESC, c.opportunity_score DESC LIMIT 30`
    )
    const tasks = this.db.all<{ company_id: number }>("SELECT DISTINCT company_id FROM tasks WHERE status IN ('open','in_progress') AND company_id IS NOT NULL AND (title LIKE '%teklif%' OR title LIKE '%Teklif%')")
    const ids = new Set(rows.map((r) => r.id))
    for (const t of tasks) if (!ids.has(t.company_id)) {
      const c = this.db.get<{ id: number; name: string; city: string | null; score: number | null }>('SELECT id, name, city, opportunity_score AS score FROM companies WHERE id = ?', t.company_id)
      if (c) rows.push({ ...c, extra: 'açık "teklif" görevi var' })
    }
    if (!rows.length) return { text: 'Teklif hazırlanması gereken müşteri görünmüyor (görüşme / yanıt aşamasında olup açık teklifi olmayan şirket yok).', source: 'data' }
    return {
      text: `${rows.length} müşteri için teklif hazırlanması gerekiyor: görüşme, yanıt ya da müzakere aşamasında olup açık teklifi olmayanlar.`,
      items: this.companyItems(rows),
      actions: [{ label: 'Bunlar için "Teklif hazırla" görevi oluştur', kind: 'create_tasks', companyIds: rows.map((r) => r.id), taskTitle: 'Teklif hazırla', confirm: `${rows.length} şirket için "Teklif hazırla" görevi oluşturulsun mu?` }, { label: 'Teklif ve Satış', kind: 'navigate', page: 'offers' }],
      source: 'data'
    }
  }

  private openOffers(): AssistantReply {
    const rows = this.db.all<{ id: number; company_id: number; number: string; title: string; total: number; updated_at: string; name: string }>(
      "SELECT o.id, o.company_id, o.number, o.title, o.total, o.updated_at, c.name FROM offers o JOIN companies c ON c.id = o.company_id WHERE o.status IN ('sent','negotiation') ORDER BY o.updated_at LIMIT 30"
    )
    if (!rows.length) return { text: 'Yanıt bekleyen teklif yok.', source: 'data' }
    return {
      text: `${rows.length} teklif yanıt bekliyor (en eskisi önce).`,
      items: rows.map((r) => ({ label: `${r.number} · ${r.name}`, sub: `${r.total.toLocaleString('tr-TR')} TL · son güncelleme ${new Date(r.updated_at).toLocaleDateString('tr-TR')}`, companyId: r.company_id })),
      actions: [{ label: 'Teklif ve Satış', kind: 'navigate', page: 'offers' }],
      source: 'data'
    }
  }

  private missingContacts(): AssistantReply {
    const rows = this.db.all<{ id: number; name: string; city: string | null; score: number | null; extra: string }>(
      `SELECT c.id, c.name, c.city, c.opportunity_score AS score,
         CASE WHEN NOT EXISTS (SELECT 1 FROM company_contacts x WHERE x.company_id = c.id AND x.type IN ('phone','whatsapp')) AND NOT EXISTS (SELECT 1 FROM company_contacts x WHERE x.company_id = c.id AND x.type = 'email') THEN 'telefon ve e-posta yok'
              WHEN NOT EXISTS (SELECT 1 FROM company_contacts x WHERE x.company_id = c.id AND x.type = 'email') THEN 'e-posta yok' ELSE 'telefon yok' END AS extra
       FROM companies c WHERE c.merged_into IS NULL AND c.archived_at IS NULL AND c.stage_key NOT IN ('won','lost','do_not_contact')
       AND (NOT EXISTS (SELECT 1 FROM company_contacts x WHERE x.company_id = c.id AND x.type = 'email') OR NOT EXISTS (SELECT 1 FROM company_contacts x WHERE x.company_id = c.id AND x.type IN ('phone','whatsapp')))
       ORDER BY c.opportunity_score DESC LIMIT 40`
    )
    if (!rows.length) return { text: 'Tüm aktif şirketlerin hem telefonu hem e-postası kayıtlı.', source: 'data' }
    return { text: `${rows.length} şirketin iletişim bilgisi eksik (puanı yüksek olanlar önce).`, items: this.companyItems(rows), source: 'data' }
  }

  private failedJobs(): AssistantReply {
    const rows = this.db.all<{ id: number; title: string; error: string | null; created_at: string }>("SELECT id, title, error, created_at FROM automation_runs WHERE status IN ('failed','interrupted') ORDER BY id DESC LIMIT 15")
    if (!rows.length) return { text: 'Hata veren görev yok.', source: 'data' }
    return { text: `Son ${rows.length} hatalı görev:`, items: rows.map((r) => ({ label: r.title, sub: `${new Date(r.created_at).toLocaleString('tr-TR')} · ${(r.error ?? 'yarıda kaldı').slice(0, 140)}` })), actions: [{ label: 'Görevler ve Otomasyonlar', kind: 'navigate', page: 'automations' }], source: 'data' }
  }

  private leads(): AssistantReply {
    const rows = this.db.all<{ company_id: number | null; person_name: string | null; company_name: string | null; service: string | null; received_at: string }>("SELECT company_id, person_name, company_name, service, received_at FROM inbound_requests WHERE status = 'new' ORDER BY id DESC LIMIT 20")
    if (!rows.length) return { text: 'Yeni web sitesi talebi yok.', actions: [{ label: 'Web Sitesi Talepleri', kind: 'navigate', page: 'leads' }], source: 'data' }
    return { text: `${rows.length} yeni web sitesi talebi var.`, items: rows.map((r) => ({ label: r.company_name || r.person_name || 'Talep', sub: `${r.service ?? ''} · ${new Date(r.received_at).toLocaleDateString('tr-TR')}`, companyId: r.company_id ?? undefined })), actions: [{ label: 'Web Sitesi Talepleri', kind: 'navigate', page: 'leads' }], source: 'data' }
  }

  private recentAnalyses(days: number): AssistantReply {
    const rows = this.db.all<{ id: number; name: string; city: string | null; score: number | null; extra: string }>(
      `SELECT c.id, c.name, c.city, c.opportunity_score AS score, 'site puanı ' || COALESCE(json_extract(a.scores, '$.overall'), '—') AS extra FROM website_analyses a JOIN companies c ON c.id = a.company_id
       WHERE a.status = 'done' AND a.finished_at >= datetime('now', ?) AND a.id IN (SELECT MAX(id) FROM website_analyses WHERE status = 'done' GROUP BY company_id) ORDER BY a.finished_at DESC LIMIT 40`, `-${days} day`
    )
    if (!rows.length) return { text: `Son ${days} günde tamamlanan analiz yok.`, source: 'data' }
    return { text: `Son ${days} günde ${rows.length} web sitesinin analizi tamamlandı.`, items: this.companyItems(rows), source: 'data' }
  }

  private serviceMatches(svc: { keys: string[]; label: string }, days: number | null): AssistantReply {
    const like = svc.keys.map(() => 'c.potential_services LIKE ?').join(' OR ')
    const rows = this.db.all<{ id: number; name: string; city: string | null; score: number | null }>(
      `SELECT c.id, c.name, c.city, c.opportunity_score AS score FROM companies c WHERE c.merged_into IS NULL AND c.archived_at IS NULL AND c.stage_key NOT IN ('won','lost','do_not_contact')
       AND NOT EXISTS (SELECT 1 FROM suppression_list s WHERE s.company_id = c.id) AND (${like}) ${days ? "AND COALESCE(c.last_analysis_at, c.created_at) >= datetime('now', ?)" : ''}
       ORDER BY c.opportunity_score DESC NULLS LAST LIMIT 25`,
      ...svc.keys.map((k) => `%"${k}"%`), ...(days ? [`-${days} day`] : [])
    )
    const when = days === 7 ? 'bu hafta analiz edilen/bulunan ' : days === 1 ? 'bugün ' : days ? `son ${days} günde ` : ''
    if (!rows.length) return { text: `${when}${svc.label} hizmetiyle eşleşen şirket bulunamadı.`.replace(/^./, (c) => c.toLocaleUpperCase('tr-TR')), source: 'data' }
    return { text: `${when}${svc.label} hizmetiyle en çok eşleşen ${rows.length} şirket (fırsat puanına göre):`.replace(/^./, (c) => c.toLocaleUpperCase('tr-TR')), items: this.companyItems(rows), source: 'data' }
  }

  private openReport(q: string, companyId?: number): AssistantReply {
    let id = companyId
    if (!id) {
      const words = q.split(' ').filter((w) => w.length >= 3 && !/^(rapor|raporu|raporunu|analiz|analizi|sirketin|bu|ac|goster|nerede|lutfen|web|sitesi)$/.test(w))
      for (const w of words) {
        const r = this.db.get<{ id: number }>("SELECT id FROM companies WHERE merged_into IS NULL AND name_key LIKE ? ORDER BY opportunity_score DESC LIMIT 1", `%${w}%`)
        if (r) { id = r.id; break }
      }
    }
    if (!id) return { text: 'Hangi şirketin raporunu istediğinizi bulamadım. Şirket adını yazın (ör. "EmlaXo analiz raporunu aç") ya da şirket kartından sorun.', source: 'help' }
    const c = this.db.get<{ name: string }>('SELECT name FROM companies WHERE id = ?', id)!
    const a = this.db.get<{ report_path: string | null; created_at: string }>("SELECT report_path, created_at FROM website_analyses WHERE company_id = ? AND status = 'done' ORDER BY id DESC LIMIT 1", id)
    if (!a) return { text: `${c.name} için tamamlanmış bir analiz yok.`, items: [{ label: c.name, companyId: id }], source: 'data' }
    if (!a.report_path) return { text: `${c.name} analiz edilmiş ama PDF raporu oluşturulmamış. Şirket kartındaki Analizler sekmesinden rapor oluşturabilirsiniz.`, items: [{ label: c.name, companyId: id }], source: 'data' }
    return { text: `${c.name} — ${new Date(a.created_at).toLocaleDateString('tr-TR')} tarihli analiz raporu:`, items: [{ label: 'Raporu aç (PDF)', sub: a.report_path, path: a.report_path }, { label: c.name, sub: 'Şirket kartı', companyId: id }], source: 'data' }
  }

  private async fallback(question: string): Promise<AssistantReply> {
    const ai = this.getAi()
    if (!ai) return { text: 'Bu soruyu henüz anlayamadım. Şunları sorabilirsiniz:', items: EXAMPLES.map((e) => ({ label: e })), source: 'help' }
    const n = (sql: string) => this.db.get<{ n: number }>(sql)?.n ?? 0
    const snapshot = {
      sirket_sayisi: n('SELECT COUNT(*) AS n FROM companies WHERE merged_into IS NULL'),
      asamalar: this.db.all("SELECT s.label AS asama, COUNT(c.id) AS adet FROM stages s LEFT JOIN companies c ON c.stage_key = s.key AND c.merged_into IS NULL GROUP BY s.key ORDER BY s.position"),
      sektorler: this.db.all("SELECT COALESCE(sector,'—') AS sektor, COUNT(*) AS adet FROM companies WHERE merged_into IS NULL GROUP BY sektor ORDER BY adet DESC LIMIT 10"),
      en_yuksek_puanlilar: this.db.all("SELECT name AS ad, city AS sehir, opportunity_score AS puan, potential_services AS hizmetler FROM companies WHERE merged_into IS NULL AND opportunity_score IS NOT NULL ORDER BY opportunity_score DESC LIMIT 15"),
      acik_gorevler: this.db.all("SELECT t.title AS gorev, t.due_at AS tarih, c.name AS sirket FROM tasks t LEFT JOIN companies c ON c.id = t.company_id WHERE t.status IN ('open','in_progress') ORDER BY t.due_at LIMIT 15"),
      teklifler: this.db.all('SELECT status AS durum, COUNT(*) AS adet, SUM(total) AS toplam FROM offers GROUP BY status')
    }
    try {
      const text = await ai.complete({
        system: 'Sen UcaMedya ajans uygulamasının asistanısın. YALNIZCA verilen JSON verisine dayanarak Türkçe, kısa yanıt ver. Veride olmayan bilgiyi uydurma; yoksa "bu bilgi kayıtlarda yok" de. Mesaj göndermeyi, silmeyi veya veri değiştirmeyi önerme; kullanıcıyı ilgili ekrana yönlendir. Kişisel verileri tekrar etme.',
        user: `VERİ:\n${JSON.stringify(snapshot)}\n\nSORU: ${question.slice(0, 500)}`,
        maxTokens: 700,
        effort: 'low'
      })
      return { text: text.trim(), source: 'ai' }
    } catch (e) {
      return { text: `Yapay zekâya ulaşılamadı (${(e as Error).message.slice(0, 120)}). Şu soruları doğrudan yanıtlayabilirim:`, items: EXAMPLES.map((x) => ({ label: x })), source: 'help' }
    }
  }

  /** Onaylanan öneri: seçili şirketler için görev oluşturur (aynı başlıkta açık görev varsa atlar). */
  createTasks(companyIds: number[], title: string): number {
    let n = 0
    for (const id of companyIds.slice(0, 200)) {
      if (this.db.get("SELECT 1 FROM tasks WHERE company_id = ? AND title = ? AND status IN ('open','in_progress')", id, title)) continue
      this.db.run("INSERT INTO tasks(title, company_id, due_at, priority, status, kind) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now','+1 day'), 'normal', 'open', 'assistant')", title, id)
      n++
    }
    return n
  }
}
