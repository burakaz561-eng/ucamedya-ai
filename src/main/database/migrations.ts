// Veritabanı şeması. Her migration bir kez, kendi işlemi (transaction) içinde uygulanır ve
// PRAGMA user_version ile sürümlenir. Var olan bir migration ASLA değiştirilmez; değişiklik
// yeni bir sürüm olarak eklenir (kullanıcı verisi güncellemede korunur).

export interface Migration {
  version: number
  name: string
  sql: string
}

const ts = "strftime('%Y-%m-%dT%H:%M:%fZ','now')"

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'temel şema',
    sql: `
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (${ts})
);

CREATE TABLE stages (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT 'neutral',
  position INTEGER NOT NULL,
  terminal INTEGER NOT NULL DEFAULT 0,
  system INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE research_projects (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  sectors TEXT NOT NULL DEFAULT '[]',
  locations TEXT NOT NULL DEFAULT '[]',
  customer_types TEXT NOT NULL DEFAULT '[]',
  analysis_types TEXT NOT NULL DEFAULT '[]',
  outputs TEXT NOT NULL DEFAULT '[]',
  target_count INTEGER NOT NULL DEFAULT 25,
  provider TEXT,
  profile_id INTEGER,
  status TEXT NOT NULL DEFAULT 'draft',  -- draft | running | paused | completed | failed | cancelled | interrupted
  queries TEXT NOT NULL DEFAULT '[]',
  stats TEXT NOT NULL DEFAULT '{}',
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (${ts}),
  started_at TEXT,
  finished_at TEXT
);

CREATE TABLE companies (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  sector TEXT,
  city TEXT,
  district TEXT,
  address TEXT,
  website TEXT,
  domain TEXT,
  website_status TEXT NOT NULL DEFAULT 'unknown', -- unknown | none | ok | unreachable | blocked_robots | error
  description TEXT,
  source TEXT,            -- google_places | serpapi | brave | manual | import
  source_ref TEXT,        -- sağlayıcıdaki kimlik (place_id vb.)
  business_status TEXT,   -- sağlayıcının bildirdiği işletme durumu (OPERATIONAL vb.)
  rating REAL,
  rating_count INTEGER,
  stage_key TEXT NOT NULL DEFAULT 'new' REFERENCES stages(key) ON UPDATE CASCADE,
  priority_group TEXT,
  opportunity_score INTEGER,
  score_reasons TEXT NOT NULL DEFAULT '[]',
  potential_services TEXT NOT NULL DEFAULT '[]',
  analysis_summary TEXT,
  owner TEXT,
  next_action TEXT,
  next_action_at TEXT,
  internal_notes TEXT,
  contact_purpose TEXT,
  folder_path TEXT,
  first_research_at TEXT NOT NULL DEFAULT (${ts}),
  last_analysis_at TEXT,
  created_at TEXT NOT NULL DEFAULT (${ts}),
  updated_at TEXT NOT NULL DEFAULT (${ts}),
  archived_at TEXT,
  merged_into INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  protected INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_companies_domain ON companies(domain);
CREATE INDEX idx_companies_name_key ON companies(name_key, city);
CREATE INDEX idx_companies_stage ON companies(stage_key);

CREATE TABLE company_contacts (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  type TEXT NOT NULL,          -- email | phone | whatsapp | form | social
  value TEXT NOT NULL,
  value_key TEXT NOT NULL,     -- normalize edilmiş değer (tekrar kontrolü / ret listesi)
  kind TEXT NOT NULL DEFAULT 'corporate', -- corporate | personal (kişisel veri: ek kontrol)
  label TEXT,
  source_url TEXT,
  source_type TEXT,            -- website | provider | manual | import
  collected_at TEXT NOT NULL DEFAULT (${ts}),
  verified_at TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0,
  UNIQUE(company_id, type, value_key)
);

CREATE TABLE research_results (
  id INTEGER PRIMARY KEY,
  research_id INTEGER NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
  company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  raw_name TEXT NOT NULL,
  raw TEXT NOT NULL DEFAULT '{}',
  phase TEXT NOT NULL DEFAULT 'found', -- found | website | analyzing | screenshots | contacts | profiling | done | skipped
  status TEXT NOT NULL DEFAULT 'pending', -- pending | running | done | failed | duplicate | skipped
  duplicate_of INTEGER,
  message TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (${ts}),
  updated_at TEXT NOT NULL DEFAULT (${ts})
);
CREATE INDEX idx_rr_research ON research_results(research_id);

CREATE TABLE website_analyses (
  id INTEGER PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  research_id INTEGER REFERENCES research_projects(id) ON DELETE SET NULL,
  version INTEGER NOT NULL DEFAULT 1,
  url TEXT NOT NULL,
  final_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | running | done | failed | unreachable | blocked
  scores TEXT NOT NULL DEFAULT '{}',      -- kategori → {score, confidence, measured, criteria}
  metrics TEXT NOT NULL DEFAULT '{}',     -- ölçülen ham değerler
  tests TEXT NOT NULL DEFAULT '[]',       -- yapılan / yapılamayan testler ve nedenleri
  summary TEXT,
  ai_summary TEXT,
  error TEXT,
  folder_path TEXT,
  report_path TEXT,
  started_at TEXT,
  finished_at TEXT,
  created_at TEXT NOT NULL DEFAULT (${ts})
);
CREATE INDEX idx_wa_company ON website_analyses(company_id);

CREATE TABLE analysis_findings (
  id INTEGER PRIMARY KEY,
  analysis_id INTEGER NOT NULL REFERENCES website_analyses(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT,
  evidence TEXT,           -- ölçülen değer / gözlem metni
  severity TEXT NOT NULL,  -- high | medium | low | info
  certainty TEXT NOT NULL DEFAULT 'measured', -- measured | heuristic | ai
  recommendation TEXT,
  service_key TEXT,
  screenshot_id INTEGER,
  page_url TEXT
);
CREATE INDEX idx_af_analysis ON analysis_findings(analysis_id);

CREATE TABLE screenshots (
  id INTEGER PRIMARY KEY,
  analysis_id INTEGER REFERENCES website_analyses(id) ON DELETE CASCADE,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  company_name TEXT,
  site_url TEXT,
  page_url TEXT NOT NULL,
  page_kind TEXT,      -- home | services | about | contact | other | issue
  viewport TEXT NOT NULL, -- desktop | mobile
  width INTEGER,
  height INTEGER,
  finding_code TEXT,
  file_path TEXT NOT NULL,
  bytes INTEGER,
  taken_at TEXT NOT NULL DEFAULT (${ts})
);

CREATE TABLE suppression_list (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL,      -- email | phone | domain
  value_key TEXT NOT NULL,
  reason TEXT,
  source TEXT,             -- user | reply | unsubscribe | import
  company_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (${ts}),
  UNIQUE(type, value_key)
);

CREATE TABLE outreach_permissions (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,         -- email | whatsapp
  status TEXT NOT NULL,          -- unknown | b2b_legitimate_interest | opt_in | opted_out
  legal_basis TEXT,
  purpose TEXT,
  evidence TEXT,
  recorded_by TEXT,
  recorded_at TEXT NOT NULL DEFAULT (${ts}),
  UNIQUE(company_id, channel)
);

CREATE TABLE outreach_drafts (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  analysis_id INTEGER REFERENCES website_analyses(id) ON DELETE SET NULL,
  channel TEXT NOT NULL,     -- email | whatsapp
  tone TEXT,
  subject TEXT,
  body TEXT NOT NULL,
  body_html TEXT,
  generator TEXT NOT NULL DEFAULT 'template', -- template | ai | manual
  used_findings TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft', -- draft | approved | queued | sent | rejected
  approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (${ts}),
  updated_at TEXT NOT NULL DEFAULT (${ts})
);

CREATE TABLE email_accounts (
  id INTEGER PRIMARY KEY,
  label TEXT NOT NULL,
  provider TEXT NOT NULL,       -- gmail | workspace | outlook | m365 | smtp
  from_name TEXT,
  from_email TEXT NOT NULL,
  smtp_host TEXT, smtp_port INTEGER, smtp_secure INTEGER NOT NULL DEFAULT 1,
  imap_host TEXT, imap_port INTEGER, imap_secure INTEGER NOT NULL DEFAULT 1,
  username TEXT,
  signature TEXT,
  daily_limit INTEGER NOT NULL DEFAULT 50,
  status TEXT NOT NULL DEFAULT 'unchecked',
  last_check_at TEXT,
  last_error TEXT,
  last_imap_uid INTEGER,
  created_at TEXT NOT NULL DEFAULT (${ts})
);

CREATE TABLE whatsapp_accounts (
  id INTEGER PRIMARY KEY,
  label TEXT NOT NULL,
  mode TEXT NOT NULL,           -- cloud_api | click_to_chat
  phone_number_id TEXT,
  waba_id TEXT,
  display_phone TEXT,
  template_name TEXT,
  template_lang TEXT DEFAULT 'tr',
  daily_limit INTEGER NOT NULL DEFAULT 50,
  status TEXT NOT NULL DEFAULT 'unchecked',
  last_check_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (${ts})
);

CREATE TABLE outreach_messages (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  draft_id INTEGER REFERENCES outreach_drafts(id) ON DELETE SET NULL,
  channel TEXT NOT NULL,
  account_id INTEGER,
  recipient TEXT NOT NULL,
  recipient_key TEXT NOT NULL,
  subject TEXT,
  body TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  campaign TEXT,
  status TEXT NOT NULL DEFAULT 'queued', -- queued | sending | sent | delivered | read | failed | cancelled | blocked | test_sent | manual_opened
  provider_message_id TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  test_mode INTEGER NOT NULL DEFAULT 0,
  queued_at TEXT NOT NULL DEFAULT (${ts}),
  sent_at TEXT,
  status_at TEXT
);
CREATE INDEX idx_om_status ON outreach_messages(status);

CREATE TABLE communication_events (
  id INTEGER PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  message_id INTEGER REFERENCES outreach_messages(id) ON DELETE SET NULL,
  channel TEXT NOT NULL,
  direction TEXT NOT NULL,  -- out | in | note
  kind TEXT NOT NULL,       -- sent | delivered | read | reply | bounce | opt_out | call | meeting | note
  summary TEXT,
  body TEXT,
  external_id TEXT,
  occurred_at TEXT NOT NULL DEFAULT (${ts}),
  UNIQUE(channel, external_id)
);

CREATE TABLE services (
  id INTEGER PRIMARY KEY,
  key TEXT UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  unit TEXT DEFAULT 'proje',
  price REAL,               -- boş: fiyat girilmedi (sabit fiyat varsayılmaz)
  currency TEXT NOT NULL DEFAULT 'TRY',
  vat_rate REAL NOT NULL DEFAULT 20,
  active INTEGER NOT NULL DEFAULT 1,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE offers (
  id INTEGER PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  currency TEXT NOT NULL DEFAULT 'TRY',
  discount_type TEXT NOT NULL DEFAULT 'none', -- none | percent | amount
  discount_value REAL NOT NULL DEFAULT 0,
  vat_included INTEGER NOT NULL DEFAULT 0,
  delivery_estimate TEXT,
  valid_until TEXT,
  payment_terms TEXT,
  notes TEXT,
  subtotal REAL NOT NULL DEFAULT 0,
  vat_total REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  pdf_path TEXT,
  history TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (${ts}),
  updated_at TEXT NOT NULL DEFAULT (${ts})
);

CREATE TABLE offer_items (
  id INTEGER PRIMARY KEY,
  offer_id INTEGER NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  service_id INTEGER REFERENCES services(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  quantity REAL NOT NULL DEFAULT 1,
  unit TEXT,
  unit_price REAL NOT NULL DEFAULT 0,
  vat_rate REAL NOT NULL DEFAULT 20,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE tasks (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  offer_id INTEGER REFERENCES offers(id) ON DELETE SET NULL,
  assignee TEXT,
  due_at TEXT,
  remind_at TEXT,
  reminded INTEGER NOT NULL DEFAULT 0,
  priority TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'open', -- open | in_progress | done | cancelled
  kind TEXT,
  created_at TEXT NOT NULL DEFAULT (${ts}),
  completed_at TEXT
);

CREATE TABLE automation_profiles (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  config TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (${ts}),
  updated_at TEXT NOT NULL DEFAULT (${ts})
);

CREATE TABLE automation_runs (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL,      -- research | analysis | report | drafts | outreach | backup | reply_sync
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued', -- queued | running | paused | completed | failed | cancelled | interrupted
  progress REAL NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  done INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  research_id INTEGER REFERENCES research_projects(id) ON DELETE SET NULL,
  company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  result TEXT,
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  files TEXT NOT NULL DEFAULT '[]',
  log TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (${ts}),
  started_at TEXT,
  finished_at TEXT
);
CREATE INDEX idx_runs_status ON automation_runs(status);

CREATE TABLE integrations (
  key TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'not_configured', -- not_configured | ok | error | disabled
  last_check_at TEXT,
  last_error TEXT,
  details TEXT NOT NULL DEFAULT '{}',
  quota TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE activity_logs (
  id INTEGER PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  entity TEXT,
  entity_id INTEGER,
  action TEXT NOT NULL,
  detail TEXT,
  actor TEXT NOT NULL DEFAULT 'user',
  created_at TEXT NOT NULL DEFAULT (${ts})
);
CREATE INDEX idx_activity_company ON activity_logs(company_id);

CREATE TABLE tags (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT 'neutral'
);
CREATE TABLE company_tags (
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY(company_id, tag_id)
);

CREATE TABLE notes (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  author TEXT,
  created_at TEXT NOT NULL DEFAULT (${ts})
);

CREATE TABLE files (
  id INTEGER PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  research_id INTEGER REFERENCES research_projects(id) ON DELETE SET NULL,
  analysis_id INTEGER REFERENCES website_analyses(id) ON DELETE CASCADE,
  offer_id INTEGER REFERENCES offers(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,     -- screenshot | analysis_json | report_pdf | draft | offer_pdf | export | attachment | company_json | research_report
  name TEXT NOT NULL,
  path TEXT NOT NULL UNIQUE,
  bytes INTEGER,
  created_at TEXT NOT NULL DEFAULT (${ts})
);
CREATE INDEX idx_files_company ON files(company_id);

CREATE TABLE saved_filters (
  id INTEGER PRIMARY KEY,
  scope TEXT NOT NULL,
  name TEXT NOT NULL,
  config TEXT NOT NULL
);

CREATE TABLE backups (
  id INTEGER PRIMARY KEY,
  path TEXT NOT NULL,
  bytes INTEGER,
  kind TEXT NOT NULL DEFAULT 'manual', -- manual | auto | pre_restore
  schema_version INTEGER,
  status TEXT NOT NULL DEFAULT 'ok',
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (${ts})
);
`
  },
  {
    version: 2,
    name: 'firmanın yayımladığı ücretsiz e-posta adresleri kurumsal',
    sql: `UPDATE company_contacts SET kind = 'corporate' WHERE type = 'email' AND kind = 'personal' AND source_type IN ('website','provider');`
  },
  {
    version: 3,
    name: '0.3: aşama geçmişi, eşleşme onayı, web sitesi talepleri, tasarım konseptleri',
    sql: `
CREATE TABLE stage_history (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  from_key TEXT,
  to_key TEXT NOT NULL,
  at TEXT NOT NULL DEFAULT (${ts})
);
CREATE INDEX idx_stage_history_company ON stage_history(company_id, at);
CREATE TRIGGER trg_stage_history AFTER UPDATE OF stage_key ON companies
  WHEN OLD.stage_key IS NOT NEW.stage_key
  BEGIN INSERT INTO stage_history(company_id, from_key, to_key) VALUES (NEW.id, OLD.stage_key, NEW.stage_key); END;

-- Emin olunmayan eşleşmeler: kullanıcı "birleştir" ya da "ayrı kayıt" diyene kadar bekler
CREATE TABLE match_candidates (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  candidate_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | merged | separate
  created_at TEXT NOT NULL DEFAULT (${ts}),
  decided_at TEXT,
  UNIQUE(company_id, candidate_id)
);

-- Web sitesinden (WordPress eklentisi) gelen teklif / ön analiz talepleri
CREATE TABLE inbound_requests (
  id INTEGER PRIMARY KEY,
  site TEXT NOT NULL,
  external_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'quote', -- quote | audit
  company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  person_name TEXT,
  company_name TEXT,
  email TEXT,
  phone TEXT,
  website TEXT,
  service TEXT,
  answers TEXT NOT NULL DEFAULT '{}',
  message TEXT,
  contact_pref TEXT,
  page_url TEXT,
  consent TEXT NOT NULL DEFAULT '{}',
  submitted_at TEXT,
  received_at TEXT NOT NULL DEFAULT (${ts}),
  status TEXT NOT NULL DEFAULT 'new', -- new | reviewed | converted | spam
  match_reason TEXT,
  UNIQUE(site, external_id)
);
CREATE INDEX idx_inbound_company ON inbound_requests(company_id);

CREATE TABLE concepts (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  analysis_id INTEGER REFERENCES website_analyses(id) ON DELETE SET NULL,
  data TEXT NOT NULL,
  pdf_path TEXT,
  created_at TEXT NOT NULL DEFAULT (${ts})
);

ALTER TABLE companies ADD COLUMN last_seen_at TEXT;
ALTER TABLE companies ADD COLUMN contact_preference TEXT;

-- "Yanıt geldi" aşaması (yalnızca aşamaları zaten olan kurulumlarda; yeni kurulum varsayılanlardan alır)
UPDATE stages SET position = position + 1 WHERE EXISTS (SELECT 1 FROM stages WHERE key = 'waiting_reply') AND NOT EXISTS (SELECT 1 FROM stages WHERE key = 'replied') AND position > (SELECT position FROM stages WHERE key = 'waiting_reply');
INSERT INTO stages(key, label, color, position, terminal, system)
  SELECT 'replied', 'Yanıt geldi', 'success', COALESCE((SELECT position FROM stages WHERE key = 'waiting_reply') + 1, (SELECT MAX(position) + 1 FROM stages)), 0, 1
  WHERE EXISTS (SELECT 1 FROM stages) AND NOT EXISTS (SELECT 1 FROM stages WHERE key = 'replied');
`
  }
]
