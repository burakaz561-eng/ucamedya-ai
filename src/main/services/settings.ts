// Uygulama ayarları (app_settings tablosunda JSON). Sırlar burada DEĞİL, SecretStore'da tutulur.

import type { Db } from '../database/db'
import { DEFAULT_CATEGORY_WEIGHTS, DEFAULT_SCORING_WEIGHTS } from '@shared/constants'
import type { AppSettings } from '@shared/types'

export const DEFAULT_SETTINGS: AppSettings = {
  setupCompleted: false,
  dataDir: '',
  theme: 'system',
  showIntro: true,
  robotAnimations: true,
  lightMode: false,
  brand: {
    name: 'UcaMedya',
    website: 'https://ucamedya.com.tr/',
    email: '',
    phone: '',
    address: '',
    signature: 'UcaMedya\nhttps://ucamedya.com.tr/',
    logoPath: '',
    senderName: 'UcaMedya'
  },
  ai: { provider: 'anthropic', model: 'claude-opus-5-5', openaiModel: 'gpt-5.1', enabled: true },
  search: { provider: 'google_places', maxQueriesPerResearch: 12 },
  analysis: { concurrency: 2, pagespeed: true, maxPages: 4, screenshotMaxWidth: 1440, respectRobots: true, timeoutSec: 30 },
  scoring: { weights: { ...DEFAULT_SCORING_WEIGHTS }, categoryWeights: { ...DEFAULT_CATEGORY_WEIGHTS }, priorityThreshold: 70, highFitThreshold: 55 },
  outreach: {
    testMode: true,
    testRecipientEmail: '',
    testRecipientPhone: '',
    requireApproval: true,
    emailIntervalSec: 45,
    whatsappIntervalSec: 30,
    includeOptOutLine: true,
    optOutText: 'Bu tür bilgilendirmeler almak istemiyorsanız bu mesaja "İSTEMİYORUM" yazarak yanıt vermeniz yeterlidir; kaydınız hemen listemizden çıkarılır.',
    openTracking: false,
    allowPersonalContacts: false
  },
  backup: { auto: true, intervalHours: 24, keep: 10, dir: '' },
  security: { lockEnabled: false, lockAfterMinutes: 0 },
  retentionDays: 730,
  owners: ['Ben']
}

function deepMerge<T>(base: T, over: unknown): T {
  if (!over || typeof over !== 'object' || Array.isArray(over)) return base
  const out = { ...(base as Record<string, unknown>) }
  for (const [k, v] of Object.entries(over as Record<string, unknown>)) {
    const b = (base as Record<string, unknown>)[k]
    out[k] = b && typeof b === 'object' && !Array.isArray(b) && v && typeof v === 'object' && !Array.isArray(v) ? deepMerge(b, v) : v
  }
  return out as T
}

export class SettingsService {
  private cache: AppSettings | null = null
  constructor(private db: Db) {}

  get(): AppSettings {
    if (this.cache) return this.cache
    const row = this.db.get<{ value: string }>("SELECT value FROM app_settings WHERE key = 'settings'")
    let parsed: unknown = {}
    try {
      parsed = row ? JSON.parse(row.value) : {}
    } catch {
      parsed = {}
    }
    this.cache = deepMerge(DEFAULT_SETTINGS, parsed)
    return this.cache
  }

  update(patch: Partial<AppSettings> | Record<string, unknown>): AppSettings {
    const next = deepMerge(this.get(), patch)
    this.db.run(
      `INSERT INTO app_settings(key, value, updated_at) VALUES ('settings', ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      JSON.stringify(next)
    )
    this.cache = next
    return next
  }

  getValue(key: string): string | undefined {
    return this.db.get<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', `kv:${key}`)?.value
  }

  setValue(key: string, value: string) {
    this.db.run(
      `INSERT INTO app_settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
      `kv:${key}`,
      value
    )
  }
}
