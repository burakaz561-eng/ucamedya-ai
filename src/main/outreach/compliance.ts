// Gönderim öncesi uygunluk kontrolü (saf fonksiyon). Bir mesaj ancak tüm kontrollerden geçerse gönderilir.
// Bu kontroller hukuki uygunluğu GARANTİ ETMEZ; ret listesi, izin durumu, kişisel veri ayrımı ve kanal
// kuralları gibi operasyonel güvenlik önlemlerini uygular.

export interface EligibilityInput {
  channel: 'email' | 'whatsapp'
  recipientKey: string
  contactKind: 'corporate' | 'personal' | string
  draftStatus: string
  requireApproval: boolean
  suppressedCompany: boolean
  suppressedRecipient: boolean
  permissionStatus: string | null // unknown | b2b_legitimate_interest | opt_in | opted_out | null
  allowPersonalContacts: boolean
  alreadySentToRecipient: boolean // aynı kanalda aynı alıcıya daha önce gönderildi mi (yakın dönem)
  accountReady: boolean
  dailySent: number
  dailyLimit: number
  whatsappMode?: 'cloud_api' | 'click_to_chat'
  whatsappTemplateReady?: boolean
  isMobileNumber?: boolean
  testMode: boolean
  testRecipientReady: boolean
}

export interface Eligibility {
  ok: boolean
  reasons: string[]
  warnings: string[]
}

export function checkEligibility(i: EligibilityInput): Eligibility {
  const reasons: string[] = []
  const warnings: string[] = []
  if (!i.recipientKey) reasons.push(i.channel === 'email' ? 'Geçerli bir e-posta adresi yok.' : 'Geçerli bir telefon numarası yok.')
  if (i.suppressedCompany || i.suppressedRecipient) reasons.push('Şirket veya alıcı ret listesinde ("iletişim istemiyor").')
  if (i.permissionStatus === 'opted_out') reasons.push('Bu kanal için iletişim reddi kaydı var.')
  if (i.requireApproval && i.draftStatus !== 'approved' && i.draftStatus !== 'queued') reasons.push('Taslak henüz onaylanmadı.')
  if (i.contactKind === 'personal' && !i.allowPersonalContacts) reasons.push('Alıcı kişisel bir iletişim bilgisi (ör. bireysel e-posta). Kişisel verilere ticari ileti göndermek ek hukuki koşullar gerektirir; ayarlardan bilinçli olarak izin verilmedikçe gönderilmez.')
  if (i.alreadySentToRecipient) reasons.push('Bu alıcıya bu kanaldan daha önce mesaj gönderilmiş (tekrar gönderim engeli).')
  if (!i.accountReady) reasons.push(i.channel === 'email' ? 'Gönderim için doğrulanmış bir e-posta hesabı yok.' : 'WhatsApp hesabı yapılandırılmamış.')
  if (i.dailyLimit > 0 && i.dailySent >= i.dailyLimit) reasons.push(`Günlük gönderim sınırına ulaşıldı (${i.dailyLimit}).`)
  if (i.channel === 'whatsapp') {
    if (i.whatsappMode === 'cloud_api' && !i.whatsappTemplateReady) reasons.push('WhatsApp Business Platform ilk temas için Meta tarafından onaylanmış bir şablon gerektirir; şablon adı tanımlanmamış.')
    if (i.isMobileNumber === false) warnings.push('Numara sabit hat gibi görünüyor; WhatsApp hesabı olmayabilir.')
  }
  if (i.testMode && !i.testRecipientReady) reasons.push('Test modu açık ancak test alıcısı tanımlanmamış (Ayarlar > İletişim).')
  if (i.permissionStatus == null || i.permissionStatus === 'unknown') warnings.push('İzin/hukuki dayanak kaydı yok. Şirketin yayımladığı kurumsal iletişim bilgisi, her türlü pazarlama iletişimine izin verildiği anlamına gelmez.')
  return { ok: reasons.length === 0, reasons, warnings }
}

/** Tekrar gönderimi veritabanı düzeyinde imkânsız kılan anahtar (outreach_messages.idempotency_key UNIQUE). */
export function idempotencyKey(channel: string, companyId: number, recipientKey: string, campaign: string | null) {
  return `${channel}:${companyId}:${recipientKey}:${campaign ?? 'ilk-temas'}`
}

const OPT_OUT_RE = /(istemiyorum|istemiyoruz|abonelikten çık|listeden çıkar|listeden cikar|bir daha yazmayın|rahatsız etmeyin|mesaj atmayın|mail atmayın|unsubscribe)/

/** Gelen yanıtın iletişim reddi içerip içermediğini tespit eder. Kısa "STOP/DUR" yanıtları da ret sayılır. */
export function isOptOutReply(text: string): boolean {
  const t = text.toLocaleLowerCase('tr-TR').trim().slice(0, 2000)
  return OPT_OUT_RE.test(t) || /^(stop|dur|ret|hayır teşekkürler)[.! ]*$/.test(t)
}
