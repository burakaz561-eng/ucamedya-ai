// Yapay zekâ sağlayıcı katmanı. Anthropic (Claude) varsayılandır; kullanıcı Ayarlar'dan OpenAI'yi
// seçebilir. Anahtarlar kaynak koda gömülmez, güvenli depodan okunur ve günlüğe yazılmaz.
// Claude: adaptive thinking, efor ayarı, güvenlik sınıflandırıcısı reddinde sunucu taraflı yedek model
// ("fallbacks: default"), JSON gereken yerde yapılandırılmış çıktı (json_schema).

import Anthropic from '@anthropic-ai/sdk'

export class AiError extends Error {}

export interface AiRequest {
  system: string
  user: string
  maxTokens?: number
  effort?: 'low' | 'medium' | 'high'
  jsonSchema?: Record<string, unknown>
}

export interface AiProvider {
  name: string
  model: string
  complete(req: AiRequest): Promise<string>
  ping(): Promise<string>
}

export class AnthropicProvider implements AiProvider {
  name = 'Anthropic Claude'
  private client: Anthropic

  constructor(
    apiKey: string,
    readonly model: string
  ) {
    this.client = new Anthropic({ apiKey, maxRetries: 2, timeout: 180000 })
  }

  async complete(req: AiRequest): Promise<string> {
    try {
      const res = await this.client.beta.messages.create({
        model: this.model,
        max_tokens: req.maxTokens ?? 16000,
        system: req.system,
        messages: [{ role: 'user', content: req.user }],
        thinking: { type: 'adaptive' },
        output_config: { effort: req.effort ?? 'medium', ...(req.jsonSchema ? { format: { type: 'json_schema', schema: req.jsonSchema } } : {}) },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default'
      })
      if (res.stop_reason === 'refusal') throw new AiError('Yapay zekâ bu isteği yanıtlamayı reddetti. İçeriği farklı ifade etmeyi deneyin.')
      if (res.stop_reason === 'max_tokens') throw new AiError('Yapay zekâ yanıtı uzunluk sınırında kesildi; tekrar deneyin.')
      return res.content
        .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim()
    } catch (e) {
      if (e instanceof AiError) throw e
      if (e instanceof Anthropic.AuthenticationError) throw new AiError('Anthropic API anahtarı geçersiz. Entegrasyonlar > Yapay Zekâ bölümünden kontrol edin.')
      if (e instanceof Anthropic.PermissionDeniedError) throw new AiError('API anahtarının bu modele erişim izni yok.')
      if (e instanceof Anthropic.NotFoundError) throw new AiError(`Model bulunamadı: ${this.model}. Ayarlar'dan başka bir model seçin.`)
      if (e instanceof Anthropic.RateLimitError) throw new AiError('Yapay zekâ istek sınırına (kota) ulaşıldı. Biraz sonra tekrar deneyin.')
      if (e instanceof Anthropic.BadRequestError) throw new AiError(`Yapay zekâ isteği geçersiz: ${e.message.slice(0, 200)}`)
      if (e instanceof Anthropic.APIConnectionError) throw new AiError('Yapay zekâ servisine bağlanılamadı. İnternet bağlantınızı kontrol edin.')
      if (e instanceof Anthropic.APIError) throw new AiError(`Yapay zekâ servisi hatası (${e.status ?? '?'}).`)
      throw e
    }
  }

  async ping(): Promise<string> {
    const t = await this.complete({ system: 'Kısa yanıt ver.', user: 'Yalnızca "Tamam" yaz.', maxTokens: 2000, effort: 'low' })
    return `Bağlantı başarılı (${this.model}): ${t.slice(0, 40)}`
  }
}

/** Kullanıcının OpenAI'yi seçmesi durumunda kullanılan sağlayıcı (Chat Completions REST API). */
export class OpenAiProvider implements AiProvider {
  name = 'OpenAI'
  constructor(
    private apiKey: string,
    readonly model: string
  ) {}

  async complete(req: AiRequest): Promise<string> {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 180000)
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: req.system },
            { role: 'user', content: req.user }
          ],
          ...(req.jsonSchema ? { response_format: { type: 'json_schema', json_schema: { name: 'cikti', schema: req.jsonSchema, strict: true } } } : {})
        })
      })
      const data = (await res.json()) as { choices?: { message?: { content?: string; refusal?: string } }[]; error?: { message?: string } }
      if (res.status === 401) throw new AiError('OpenAI API anahtarı geçersiz.')
      if (res.status === 429) throw new AiError('OpenAI istek sınırına (kota) ulaşıldı.')
      if (!res.ok) throw new AiError(`OpenAI hatası (${res.status}): ${data.error?.message?.slice(0, 200) ?? ''}`)
      const msg = data.choices?.[0]?.message
      if (msg?.refusal) throw new AiError('Yapay zekâ bu isteği yanıtlamayı reddetti.')
      return (msg?.content ?? '').trim()
    } catch (e) {
      if (e instanceof AiError) throw e
      if ((e as Error).name === 'AbortError') throw new AiError('Yapay zekâ yanıtı zaman aşımına uğradı.')
      throw new AiError(`OpenAI servisine bağlanılamadı: ${(e as Error).message}`)
    } finally {
      clearTimeout(t)
    }
  }

  async ping(): Promise<string> {
    const t = await this.complete({ system: 'Kısa yanıt ver.', user: 'Yalnızca "Tamam" yaz.' })
    return `Bağlantı başarılı (${this.model}): ${t.slice(0, 40)}`
  }
}

/** Bilgisayarda çalışan yerel model (Ollama). API anahtarı gerekmez; veriler bilgisayardan çıkmaz. */
export class OllamaProvider implements AiProvider {
  name = 'Yerel model (Ollama)'
  constructor(
    private baseUrl: string,
    readonly model: string
  ) {}

  private url(path: string) {
    const u = new URL(path, this.baseUrl.endsWith('/') ? this.baseUrl : `${this.baseUrl}/`)
    // Yalnızca bu bilgisayardaki sunucuya bağlanılır
    if (!/^(127\.0\.0\.1|localhost|\[::1\])$/.test(u.hostname)) throw new AiError('Ollama adresi yalnızca bu bilgisayar (127.0.0.1) olabilir.')
    return u.toString()
  }

  async complete(req: AiRequest): Promise<string> {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 300000)
    try {
      const res = await fetch(this.url('api/chat'), {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          stream: false,
          messages: [
            { role: 'system', content: req.system },
            { role: 'user', content: req.user }
          ],
          ...(req.jsonSchema ? { format: req.jsonSchema } : {})
        })
      })
      const data = (await res.json().catch(() => ({}))) as { message?: { content?: string }; error?: string }
      if (!res.ok) throw new AiError(`Yerel model hatası: ${data.error ?? res.status}${/not found/i.test(data.error ?? '') ? ` — "ollama pull ${this.model}" ile modeli indirin.` : ''}`)
      return (data.message?.content ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').trim()
    } catch (e) {
      if (e instanceof AiError) throw e
      if ((e as Error).name === 'AbortError') throw new AiError('Yerel model 5 dakika içinde yanıt vermedi.')
      throw new AiError('Yerel modele bağlanılamadı. Ollama kurulu ve çalışıyor olmalı (https://ollama.com).')
    } finally {
      clearTimeout(t)
    }
  }

  async ping(): Promise<string> {
    const res = await fetch(this.url('api/tags')).catch(() => null)
    if (!res?.ok) throw new AiError('Ollama çalışmıyor. Ollama’yı kurup başlatın (https://ollama.com).')
    const data = (await res.json()) as { models?: { name: string }[] }
    const names = (data.models ?? []).map((m) => m.name)
    if (!names.some((n) => n === this.model || n.startsWith(`${this.model}:`) || this.model.startsWith(n))) throw new AiError(`Ollama çalışıyor ancak "${this.model}" modeli yüklü değil. Yüklü modeller: ${names.join(', ') || 'yok'}. Terminalde: ollama pull ${this.model}`)
    return `Yerel model hazır (${this.model}).`
  }
}

export function parseJson<T>(text: string): T {
  const s = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')
  try {
    return JSON.parse(s) as T
  } catch {
    const m = s.match(/\{[\s\S]*\}/)
    if (m) return JSON.parse(m[0]) as T
    throw new AiError('Yapay zekâ geçerli bir JSON yanıtı döndürmedi.')
  }
}
