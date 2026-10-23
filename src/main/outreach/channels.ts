// Kanal istemcileri: e-posta (SMTP gönderim + IMAP yanıt okuma) ve WhatsApp Business Platform (Cloud API).

import nodemailer from 'nodemailer'
import { ImapFlow } from 'imapflow'

export interface EmailAccount {
  id: number
  from_name: string | null
  from_email: string
  smtp_host: string | null
  smtp_port: number | null
  smtp_secure: number
  imap_host: string | null
  imap_port: number | null
  imap_secure: number
  username: string | null
  signature: string | null
}

export const EMAIL_PRESETS: Record<string, { smtp_host: string; smtp_port: number; smtp_secure: boolean; imap_host: string; imap_port: number; note: string }> = {
  gmail: { smtp_host: 'smtp.gmail.com', smtp_port: 465, smtp_secure: true, imap_host: 'imap.gmail.com', imap_port: 993, note: 'Google hesabınızda 2 adımlı doğrulamayı açıp bir "Uygulama şifresi" oluşturun; normal şifre çalışmaz.' },
  workspace: { smtp_host: 'smtp.gmail.com', smtp_port: 465, smtp_secure: true, imap_host: 'imap.gmail.com', imap_port: 993, note: 'Google Workspace yöneticisinin IMAP ve uygulama şifrelerine izin vermesi gerekir.' },
  outlook: { smtp_host: 'smtp-mail.outlook.com', smtp_port: 587, smtp_secure: false, imap_host: 'outlook.office365.com', imap_port: 993, note: 'Kişisel Outlook hesaplarında SMTP için uygulama şifresi gerekebilir.' },
  m365: { smtp_host: 'smtp.office365.com', smtp_port: 587, smtp_secure: false, imap_host: 'outlook.office365.com', imap_port: 993, note: 'Microsoft 365 yöneticisinin hesap için "SMTP AUTH" özelliğini açması gerekir.' },
  smtp: { smtp_host: '', smtp_port: 465, smtp_secure: true, imap_host: '', imap_port: 993, note: 'Barındırma firmanızın verdiği SMTP/IMAP bilgilerini girin.' }
}

function transport(acc: EmailAccount, password: string) {
  if (!acc.smtp_host) throw new Error('SMTP sunucusu tanımlanmamış')
  return nodemailer.createTransport({
    host: acc.smtp_host,
    port: acc.smtp_port ?? 465,
    secure: !!acc.smtp_secure,
    requireTLS: !acc.smtp_secure,
    auth: { user: acc.username || acc.from_email, pass: password },
    connectionTimeout: 20000,
    greetingTimeout: 15000,
    socketTimeout: 30000
  })
}

export async function verifyEmail(acc: EmailAccount, password: string): Promise<{ smtp: string; imap: string }> {
  let smtp = ''
  try {
    await transport(acc, password).verify()
    smtp = 'SMTP bağlantısı başarılı.'
  } catch (e) {
    throw new Error(`SMTP doğrulaması başarısız: ${(e as Error).message}`)
  }
  let imap = 'IMAP tanımlanmadı; yanıt takibi yapılamaz.'
  if (acc.imap_host) {
    const client = new ImapFlow({ host: acc.imap_host, port: acc.imap_port ?? 993, secure: !!acc.imap_secure, auth: { user: acc.username || acc.from_email, pass: password }, logger: false })
    try {
      await client.connect()
      imap = 'IMAP bağlantısı başarılı; yanıtlar okunabilir.'
    } catch (e) {
      imap = `IMAP bağlantısı başarısız: ${(e as Error).message}`
    } finally {
      await client.logout().catch(() => undefined)
    }
  }
  return { smtp, imap }
}

export async function sendEmail(acc: EmailAccount, password: string, m: { to: string; subject: string; text: string; html?: string | null; unsubscribeMailto?: string; attachments?: { filename: string; path: string }[] }) {
  const info = await transport(acc, password).sendMail({
    from: acc.from_name ? { name: acc.from_name, address: acc.from_email } : acc.from_email,
    to: m.to,
    subject: m.subject,
    text: m.text,
    html: m.html ?? undefined,
    attachments: m.attachments,
    headers: m.unsubscribeMailto ? { 'List-Unsubscribe': `<mailto:${m.unsubscribeMailto}?subject=ISTEMIYORUM>` } : undefined
  })
  if (info.rejected?.length) throw new Error(`Alıcı sunucu tarafından reddedildi: ${info.rejected.join(', ')}`)
  return { messageId: info.messageId as string, response: String(info.response ?? '') }
}

export interface InboundMail {
  uid: number
  from: string
  subject: string
  date: string
  text: string
  messageId: string | null
  inReplyTo: string | null
}

/** Son okunan UID'den sonraki gelen kutusu iletilerini getirir (salt okunur; ileti silinmez/taşınmaz). */
export async function fetchInbox(acc: EmailAccount, password: string, sinceUid: number | null, max = 200): Promise<{ mails: InboundMail[]; lastUid: number | null }> {
  if (!acc.imap_host) throw new Error('IMAP sunucusu tanımlanmamış')
  const client = new ImapFlow({ host: acc.imap_host, port: acc.imap_port ?? 993, secure: !!acc.imap_secure, auth: { user: acc.username || acc.from_email, pass: password }, logger: false })
  const mails: InboundMail[] = []
  let lastUid = sinceUid
  await client.connect()
  try {
    const lock = await client.getMailboxLock('INBOX', { readOnly: true })
    try {
      const range = sinceUid ? `${sinceUid + 1}:*` : '1:*'
      const since = new Date(Date.now() - 30 * 86400000)
      for await (const msg of client.fetch(sinceUid ? range : { since }, { uid: true, envelope: true, source: { maxLength: 60000 } }, { uid: true })) {
        if (sinceUid && msg.uid <= sinceUid) continue
        const env = msg.envelope
        const raw = msg.source?.toString('utf8') ?? ''
        const body = raw.split(/\r?\n\r?\n/).slice(1).join('\n\n')
        mails.push({
          uid: msg.uid,
          from: env?.from?.[0]?.address?.toLowerCase() ?? '',
          subject: env?.subject ?? '',
          date: new Date(env?.date ?? Date.now()).toISOString(),
          text: body.replace(/=\r?\n/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 4000),
          messageId: env?.messageId ?? null,
          inReplyTo: env?.inReplyTo ?? null
        })
        lastUid = Math.max(lastUid ?? 0, msg.uid)
        if (mails.length >= max) break
      }
    } finally {
      lock.release()
    }
  } finally {
    await client.logout().catch(() => undefined)
  }
  return { mails, lastUid }
}

// ---------------- WhatsApp Business Platform (Cloud API) ----------------

const GRAPH = 'https://graph.facebook.com/v21.0'

async function graph<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${GRAPH}/${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) } })
  const data = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; code?: number } }
  if (!res.ok || data.error) {
    const msg = data.error?.message ?? `HTTP ${res.status}`
    if (res.status === 401 || data.error?.code === 190) throw new Error(`WhatsApp erişim anahtarı geçersiz veya süresi dolmuş: ${msg}`)
    if (res.status === 429 || data.error?.code === 130429 || data.error?.code === 131056) throw new Error(`WhatsApp gönderim sınırına ulaşıldı: ${msg}`)
    throw new Error(`WhatsApp API hatası: ${msg}`)
  }
  return data
}

export async function whatsappHealth(phoneNumberId: string, token: string) {
  const d = await graph<{ display_phone_number?: string; verified_name?: string; quality_rating?: string; messaging_limit_tier?: string; name_status?: string }>(
    `${encodeURIComponent(phoneNumberId)}?fields=display_phone_number,verified_name,quality_rating,messaging_limit_tier,name_status`,
    token
  )
  return d
}

export async function whatsappTemplates(wabaId: string, token: string) {
  const d = await graph<{ data?: { name: string; language: string; status: string; category: string; components?: { type: string; text?: string }[] }[] }>(`${encodeURIComponent(wabaId)}/message_templates?limit=100`, token)
  return d.data ?? []
}

export async function whatsappSendTemplate(phoneNumberId: string, token: string, to: string, template: string, lang: string, bodyParams: string[]) {
  const d = await graph<{ messages?: { id: string; message_status?: string }[] }>(`${encodeURIComponent(phoneNumberId)}/messages`, token, {
    method: 'POST',
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: { name: template, language: { code: lang }, ...(bodyParams.length ? { components: [{ type: 'body', parameters: bodyParams.map((t) => ({ type: 'text', text: t.slice(0, 1000) })) }] } : {}) }
    })
  })
  const id = d.messages?.[0]?.id
  if (!id) throw new Error('WhatsApp API mesaj kimliği döndürmedi')
  return id
}

/** Resmî "tıkla-sohbet" bağlantısı: mesaj kullanıcının WhatsApp uygulamasında hazır açılır, gönder tuşuna kullanıcı basar. */
export function clickToChatUrl(phoneKey: string, text: string) {
  return `https://wa.me/${phoneKey}?text=${encodeURIComponent(text)}`
}
