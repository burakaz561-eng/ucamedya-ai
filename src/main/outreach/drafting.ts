// Kişiselleştirilmiş iletişim taslakları. İlke: yalnızca kayıtlı (ölçülmüş) bulgulardan söz edilir;
// kanıtı olmayan konularda kesin ifade yerine soru veya ihtiyatlı dil kullanılır. AI yoksa veya hata
// verirse şablon tabanlı taslak üretilir (ve bu durum taslakta "generator: template" olarak görünür).

import type { AiProvider } from '../integrations/ai/ai-client'
import { parseJson } from '../integrations/ai/ai-client'
import { MESSAGE_TONES, REWRITE_ACTIONS } from '@shared/constants'
import { renderTemplate, shortCompanyName, type MessageTemplates } from '@shared/message-templates'

export interface DraftContext {
  company: { name: string; sector: string | null; city: string | null; website: string | null; websiteStatus: string }
  findings: { code: string; category: string; title: string; evidence: string | null; severity: string; recommendation: string | null; certainty: string }[]
  services: string[]
  brand: { name: string; website: string; email: string; phone: string; signature: string; senderName: string }
  channel: 'email' | 'whatsapp'
  tone: string
  optOutLine: string | null
  /** Kullanıcının düzenlediği kurumsal şablonlar; varsa şablon taslağı bunlardan üretilir */
  templates?: MessageTemplates | null
}

export interface DraftOut {
  subject: string | null
  body: string
  usedFindings: string[]
  generator: 'ai' | 'template'
  warning?: string
}

const toneLabel = (k: string) => MESSAGE_TONES.find((t) => t.key === k)?.label ?? 'Profesyonel'

const SYSTEM = `Sen UcaMedya adlı dijital ajansın iş geliştirme asistanısın. Türkçe, doğal ve saygılı yazarsın.
Kesin kurallar:
1. YALNIZCA sana "DOĞRULANMIŞ BULGULAR" listesinde verilen sorunlardan bahset. Listede olmayan hiçbir sorunu, rakamı veya iddiayı uydurma.
2. "heuristic" (sezgisel) işaretli bulgular için kesin yargı kurma; "fark ettik ki ... olabilir", "... konusunda geliştirme alanı görüyoruz" gibi ihtiyatlı ifade kullan.
3. Şirketi küçümseme, korkutma veya baskı dili kullanma. Abartılı vaat (ör. "satışlarınızı 3 katına çıkarırız") verme.
4. Fiyat yazma. Ücretsiz/indirim vaadi yazma.
5. Robot olduğunu gizlemeye veya insan gibi davranmaya yönelik numaralar yapma; sadece net bir iş mesajı yaz.
6. Bulgu yoksa (ör. sitesi olmayan şirket) genel ve soru biçiminde bir tanışma mesajı yaz.
7. "usedFindings" alanına yalnızca metinde gerçekten değindiğin bulguların kodlarını yaz.`

function factsBlock(ctx: DraftContext): string {
  const f = ctx.findings.slice(0, 8)
  const list = f.length
    ? f.map((x) => `- [${x.code}] (${x.severity}, ${x.certainty}) ${x.title}${x.evidence ? ` — Kanıt: ${x.evidence.slice(0, 220)}` : ''}`).join('\n')
    : '(Kayıtlı bulgu yok.)'
  return `ŞİRKET: ${shortCompanyName(ctx.company.name)}
SEKTÖR: ${ctx.company.sector ?? 'belirtilmedi'}
ŞEHİR: ${ctx.company.city ?? 'belirtilmedi'}
WEB SİTESİ: ${ctx.company.website ?? 'yok'} (durum: ${ctx.company.websiteStatus})
DOĞRULANMIŞ BULGULAR:
${list}
UCAMEDYA HİZMETLERİ (uygun olanları öner): ${ctx.services.join(', ')}
GÖNDEREN: ${ctx.brand.senderName} — ${ctx.brand.website}`
}

const SCHEMA = {
  type: 'object',
  properties: { subject: { type: 'string' }, body: { type: 'string' }, usedFindings: { type: 'array', items: { type: 'string' } } },
  required: ['subject', 'body', 'usedFindings'],
  additionalProperties: false
}

function finalize(body: string, ctx: DraftContext): string {
  let b = body.trim()
  if (ctx.channel === 'email' && ctx.brand.signature && !b.includes(ctx.brand.website.replace(/\/$/, ''))) b += `\n\n${ctx.brand.signature}`
  if (ctx.optOutLine && !b.includes(ctx.optOutLine.slice(0, 30))) b += `\n\n${ctx.optOutLine}`
  return b
}

/** AI çıktısının kayıtlı bulgu kodları dışında kod iddia etmediğini doğrular. */
function sanitizeUsed(used: string[], ctx: DraftContext) {
  const valid = new Set(ctx.findings.map((f) => f.code))
  return used.filter((c) => valid.has(c))
}

export function templateDraft(ctx: DraftContext): DraftOut {
  if (ctx.templates) {
    const top = ctx.findings.filter((f) => f.severity === 'high' || f.severity === 'medium').slice(0, 2)
    const vars = { company: ctx.company.name, sector: ctx.company.sector, city: ctx.company.city, website: ctx.company.website, findings: top.map((f) => f.title), brandName: ctx.brand.name, brandWeb: ctx.brand.website }
    const t = ctx.templates
    const usesFindings = /\{bulgu/.test(ctx.channel === 'email' ? t.emailBody : t.whatsappBody)
    if (ctx.channel === 'whatsapp') return { subject: null, body: finalize(renderTemplate(t.whatsappBody, vars), ctx), usedFindings: usesFindings ? top.map((f) => f.code) : [], generator: 'template' }
    return { subject: renderTemplate(t.emailSubject, vars), body: finalize(renderTemplate(t.emailBody, vars), ctx), usedFindings: usesFindings ? top.map((f) => f.code) : [], generator: 'template' }
  }
  const name = shortCompanyName(ctx.company.name)
  const top = ctx.findings.filter((f) => f.severity === 'high' || f.severity === 'medium').slice(0, 2)
  const pts = top.map((f) => f.title.charAt(0).toLocaleLowerCase('tr-TR') + f.title.slice(1))
  const noSite = ctx.company.websiteStatus === 'none' || !ctx.company.website
  if (ctx.channel === 'whatsapp') {
    const body = noSite
      ? `Merhaba, iyi çalışmalar dileriz. ${ctx.brand.name} ekibinden yazıyorum. ${name} için çevrim içi bir web sitesine ulaşamadık. Dilerseniz işletmenize uygun bir web sitesi ve dijital görünürlük için kısa bir öneri paylaşabiliriz. İlgilenirseniz memnuniyetle yardımcı oluruz.`
      : `Merhaba, iyi çalışmalar dileriz. ${ctx.brand.name} ekibinden yazıyorum. ${name} web sitesini incelerken ${pts.length ? pts.join(' ve ') + ' konularında' : 'bazı noktalarda'} geliştirilebilecek alanlar fark ettik. Dilerseniz gözlemlerimizi ve çözüm önerilerimizi sizinle paylaşabiliriz. İlgilenirseniz memnuniyetle yardımcı oluruz.`
    return { subject: null, body: finalize(body, ctx), usedFindings: top.map((f) => f.code), generator: 'template' }
  }
  const subject = noSite ? `${name} için dijital görünürlük önerisi` : 'Web siteniz için birkaç geliştirme önerisi'
  const body = noSite
    ? `Merhaba,\n\n${ctx.brand.name} olarak şirketlerin dijital görünürlüğünü, web tasarımını ve çevrim içi müşteri deneyimini geliştirmeye yönelik çalışmalar yapıyoruz.\n\n${name} için yaptığımız aramada çevrim içi bir web sitesine ulaşamadık. Potansiyel müşterilerinizin sizi internette bulabilmesi için işletmenize uygun bir web sitesi önerimiz olabilir.\n\nDilerseniz kısa bir görüşmeyle ihtiyaçlarınızı dinleyip size özel bir değerlendirme paylaşabiliriz.\n\nİyi çalışmalar dileriz.`
    : `Merhaba,\n\n${ctx.brand.name} olarak şirketlerin dijital görünürlüğünü, web tasarımını ve çevrim içi müşteri deneyimini geliştirmeye yönelik çalışmalar yapıyoruz.\n\n${name} web sitesini incelerken geliştirmeye açık olabilecek bazı noktalar fark ettik${pts.length ? `. Özellikle ${pts.join(' ve ')} konusunda birkaç önerimiz bulunuyor.` : '.'}\n\nDilerseniz bu gözlemlerimizi ve olası çözüm yollarını içeren kısa bir değerlendirmeyi sizinle paylaşabiliriz.\n\nİyi çalışmalar dileriz.`
  return { subject, body: finalize(body, ctx), usedFindings: top.map((f) => f.code), generator: 'template' }
}

export async function aiDraft(ai: AiProvider | null, ctx: DraftContext): Promise<DraftOut> {
  if (!ai) return { ...templateDraft(ctx), warning: 'Yapay zekâ bağlantısı yapılandırılmadığı için şablon taslak üretildi.' }
  const channelRule =
    ctx.channel === 'whatsapp'
      ? 'Kanal: WhatsApp. En fazla 600 karakter, 3-5 cümle, selamlama ile başla, başlık/madde işareti kullanma, imza ekleme. "subject" alanını boş string bırak.'
      : 'Kanal: E-posta. Konu satırı 60 karakteri geçmesin ve tıklama tuzağı olmasın. Gövde 120-220 kelime; selamlama, kısa tanıtım, en fazla 2-3 somut gözlem, net ve baskısız bir kapanış sorusu. İmza ekleme (otomatik eklenecek).'
  try {
    const out = await ai.complete({
      system: SYSTEM,
      user: `${factsBlock(ctx)}\n\nTON: ${toneLabel(ctx.tone)}\n${channelRule}\n${ctx.templates ? `\nKURUMSAL ŞABLON (yapısını, tonunu ve UCA Radar teklifini koru; şirkete göre yalnızca küçük kişiselleştirme yap):\n${ctx.channel === 'email' ? ctx.templates.emailBody : ctx.templates.whatsappBody}\n` : ''}\nBu şirkete ilk temas mesajını yaz. JSON olarak döndür: {"subject": "...", "body": "...", "usedFindings": ["kod", ...]}`,
      jsonSchema: SCHEMA,
      effort: 'medium',
      maxTokens: 8000
    })
    const j = parseJson<{ subject: string; body: string; usedFindings: string[] }>(out)
    if (!j.body?.trim()) throw new Error('boş yanıt')
    return { subject: ctx.channel === 'email' ? j.subject?.trim() || null : null, body: finalize(j.body, ctx), usedFindings: sanitizeUsed(j.usedFindings ?? [], ctx), generator: 'ai' }
  } catch (e) {
    return { ...templateDraft(ctx), warning: `Yapay zekâ taslağı üretilemedi (${(e as Error).message}); şablon taslak kullanıldı.` }
  }
}

const ACTION_PROMPTS: Record<string, string> = {
  rewrite: 'Metni aynı anlamı koruyarak yeniden yaz.',
  shorten: 'Metni anlamını koruyarak belirgin şekilde kısalt.',
  more_professional: 'Metni daha profesyonel ve kurumsal bir dile çevir.',
  more_friendly: 'Metni daha samimi ve sıcak bir dile çevir (laubali olmadan).',
  more_technical: 'Doğrulanmış bulgulardaki teknik ayrıntıları (ölçüm değerleri dahil) metne daha fazla yansıt.',
  add_findings: 'Metne doğrulanmış bulgulardan henüz değinilmemiş en önemli 1-2 tanesini ekle.',
  fix_spelling: 'Yalnızca yazım, noktalama ve dil bilgisi hatalarını düzelt; başka değişiklik yapma.',
  to_email: 'Metni bir e-posta biçimine dönüştür (konu satırı + selamlama + gövde + kapanış).',
  to_whatsapp: 'Metni kısa bir WhatsApp mesajına dönüştür (en fazla 600 karakter, konu satırı yok).',
  alternative: 'Aynı amaçla tamamen farklı bir yaklaşımla yeni bir alternatif yaz.'
}

export async function rewriteDraft(ai: AiProvider | null, ctx: DraftContext, current: { subject: string | null; body: string }, action: string): Promise<DraftOut> {
  if (!REWRITE_ACTIONS.some((a) => a.key === action)) throw new Error('Geçersiz düzenleme işlemi')
  if (!ai) throw new Error('Bu işlem için yapay zekâ bağlantısı gerekli (Entegrasyonlar > Yapay Zekâ).')
  const channel = action === 'to_email' ? 'email' : action === 'to_whatsapp' ? 'whatsapp' : ctx.channel
  const out = await ai.complete({
    system: SYSTEM,
    user: `${factsBlock(ctx)}\n\nMEVCUT METİN:\nKonu: ${current.subject ?? '(yok)'}\n${current.body}\n\nGÖREV: ${ACTION_PROMPTS[action]}\nTON: ${toneLabel(ctx.tone)}\nKanal: ${channel === 'email' ? 'E-posta' : 'WhatsApp'}. İmzayı ve iletişim reddi satırını metinden çıkar (otomatik eklenecek).\nJSON olarak döndür: {"subject": "...", "body": "...", "usedFindings": [...]}`,
    jsonSchema: SCHEMA,
    effort: 'low',
    maxTokens: 8000
  })
  const j = parseJson<{ subject: string; body: string; usedFindings: string[] }>(out)
  const c2 = { ...ctx, channel: channel as 'email' | 'whatsapp' }
  return { subject: channel === 'email' ? j.subject?.trim() || current.subject : null, body: finalize(j.body, c2), usedFindings: sanitizeUsed(j.usedFindings ?? [], ctx), generator: 'ai' }
}

/** Analiz için yapay zekâ destekli yönetici özeti (yalnızca bulgulardan). */
export async function aiAnalysisSummary(ai: AiProvider, company: string, findings: DraftContext['findings'], scores: Record<string, number | null>): Promise<string> {
  const out = await ai.complete({
    system: 'Bir web sitesi inceleme raporu için kısa yönetici özeti yazıyorsun. Yalnızca verilen bulgu ve puanları kullan; yeni sorun, rakam veya iddia ekleme. Sezgisel bulguları ihtiyatlı dille anlat. Türkçe, 3-5 cümle, düz metin.',
    user: `Şirket: ${company}\nPuanlar: ${Object.entries(scores).map(([k, v]) => `${k}: ${v ?? 'ölçülemedi'}`).join(', ')}\nBulgular:\n${findings.map((f) => `- (${f.severity}, ${f.certainty}) ${f.title}: ${f.evidence ?? ''}`).join('\n')}`,
    effort: 'low',
    maxTokens: 4000
  })
  return out.trim()
}
