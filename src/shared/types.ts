// Ana süreç ile arayüz arasında paylaşılan veri tipleri.

import type { FindingCategory, Severity } from './constants'

export interface AppSettings {
  setupCompleted: boolean
  dataDir: string
  theme: 'system' | 'light' | 'dark'
  showIntro: boolean
  robotAnimations: boolean
  lightMode: boolean
  brand: {
    name: string
    website: string
    email: string
    phone: string
    address: string
    signature: string
    logoPath: string
    senderName: string
  }
  ai: { provider: 'anthropic' | 'openai' | 'ollama' | 'none'; model: string; openaiModel: string; ollamaUrl: string; ollamaModel: string; enabled: boolean }
  search: { provider: 'google_browser' | 'google_places' | 'serpapi' | 'brave' | 'manual'; maxQueriesPerResearch: number; pagesPerQuery: number }
  automation: { browser: 'chrome' | 'edge'; autoStart: boolean; previewIntervalSec: number }
  /** Teklif varsayılanları (analizden taslakta kullanılır) */
  offers: { validityDays: number; defaultPaymentTerms: string; defaultNextSteps: string }
  /** UcaMedya Bağlantı WordPress eklentisi (web sitesi talepleri) */
  website: { siteUrl: string; enabled: boolean; syncMinutes: number }
  /** Ekip modu (ortak sunucu): oturum anahtarı güvenli depoda, şifre hiçbir yerde tutulmaz */
  team: { enabled: boolean; server: string; userId: number; email: string; name: string; role: 'admin' | 'member' }
  analysis: { concurrency: number; pagespeed: boolean; maxPages: number; screenshotMaxWidth: number; respectRobots: boolean; timeoutSec: number }
  scoring: {
    weights: { improvementNeed: number; serviceFit: number; activeSignals: number; contactValidity: number; opportunitySignals: number }
    categoryWeights: Record<FindingCategory, number>
    priorityThreshold: number
    highFitThreshold: number
  }
  outreach: {
    testMode: boolean
    testRecipientEmail: string
    testRecipientPhone: string
    requireApproval: boolean
    emailIntervalSec: number
    whatsappIntervalSec: number
    includeOptOutLine: boolean
    optOutText: string
    openTracking: boolean
    allowPersonalContacts: boolean
    emailChannel: 'webmail' | 'gmail_web' | 'smtp'
    webmailUrl: string
    whatsappChannel: 'desktop' | 'web' | 'cloud_api' | 'click_to_chat'
    sendMode: 'draft' | 'confirm' | 'queue'
    webDailyLimitEmail: number
    webDailyLimitWhatsapp: number
    attachReport: boolean
    /** Mesaja eklenecek görsel (kampanya görseli): e-postada ek, WhatsApp masaüstünde panodan yapıştırma */
    image: { path: string; email: boolean; whatsapp: boolean; autoPaste?: boolean }
    /** WhatsApp masaüstü: Enter algılanınca onay beklemeden sonraki sohbete geç (yalnızca Windows) */
    desktopAutoAdvance?: boolean
    templates: { emailSubject: string; emailBody: string; whatsappBody: string }
  }
  backup: { auto: boolean; intervalHours: number; keep: number; dir: string }
  security: { lockEnabled: boolean; lockAfterMinutes: number }
  retentionDays: number
  owners: string[]
}

export interface CategoryScore {
  score: number | null
  confidence: 'high' | 'medium' | 'low' | 'none'
  measured: boolean
  criteria: { label: string; passed: boolean | null; weight: number; note?: string }[]
  reason: string
}

export interface FindingDraft {
  category: FindingCategory
  code: string
  title: string
  detail?: string
  evidence?: string
  severity: Severity
  certainty: 'measured' | 'heuristic' | 'ai'
  recommendation?: string
  serviceKey?: string
  pageUrl?: string
  screenshotKey?: string
}

export interface TestRecord {
  key: string
  label: string
  status: 'done' | 'skipped' | 'failed'
  note?: string
}

export interface SearchHit {
  name: string
  address?: string
  city?: string
  district?: string
  website?: string
  phone?: string
  sourceRef?: string
  businessStatus?: string
  rating?: number
  ratingCount?: number
  types?: string[]
  mapsUrl?: string
}

export interface CheckResult {
  key: string
  label: string
  ok: boolean
  status: 'ok' | 'warn' | 'error' | 'skipped'
  message: string
}

export interface JobEvent {
  runId: number
  type: string
  status: string
  progress: number
  message?: string
  researchId?: number | null
  companyId?: number | null
}
