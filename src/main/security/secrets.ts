// API anahtarları ve parolaların güvenli saklanması. Electron safeStorage: Windows'ta DPAPI,
// macOS'ta Anahtar Zinciri ile kullanıcı hesabına bağlı şifreleme. Değerler düz metin olarak
// diske yazılmaz, günlüğe yazılmaz ve arayüze geri gönderilmez (yalnızca "kayıtlı mı" bilgisi gider).

import type { Db } from '../database/db'

export interface Cipher {
  available(): boolean
  encrypt(plain: string): Buffer
  decrypt(data: Buffer): string
}

export const SECRET_NAMES = [
  'google_places_key', 'serpapi_key', 'brave_key', 'pagespeed_key', 'anthropic_key', 'openai_key', 'whatsapp_token'
] as const

export class SecretStore {
  constructor(
    private db: Db,
    private cipher: Cipher
  ) {}

  available() {
    return this.cipher.available()
  }

  private validName(name: string) {
    if (!/^[a-z0-9_:]{2,60}$/.test(name)) throw new Error('Geçersiz anahtar adı')
  }

  set(name: string, value: string) {
    this.validName(name)
    const v = value.trim()
    if (!v) {
      this.delete(name)
      return
    }
    if (v.length > 4000) throw new Error('Değer çok uzun')
    if (!this.cipher.available()) throw new Error('İşletim sisteminin güvenli sır saklama özelliği kullanılamıyor; değer kaydedilmedi.')
    const enc = this.cipher.encrypt(v).toString('base64')
    this.db.run(
      `INSERT INTO app_settings(key, value, updated_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      `secret:${name}`,
      enc
    )
  }

  get(name: string): string | undefined {
    this.validName(name)
    const row = this.db.get<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', `secret:${name}`)
    if (!row) return undefined
    try {
      return this.cipher.decrypt(Buffer.from(row.value, 'base64'))
    } catch {
      return undefined
    }
  }

  has(name: string): boolean {
    return !!this.db.get('SELECT 1 FROM app_settings WHERE key = ?', `secret:${name}`)
  }

  delete(name: string) {
    this.db.run('DELETE FROM app_settings WHERE key = ?', `secret:${name}`)
  }

  status(): Record<string, boolean> {
    const out: Record<string, boolean> = {}
    for (const n of SECRET_NAMES) out[n] = this.has(n)
    return out
  }
}
