// Ekip eşitlemesi: hangi tablolar eşitlenir ve bunun için gereken şema (migration v4).
//
// Her eşitlenen satır küresel bir uid taşır. Yerel değişiklikler tetikleyicilerle sync_outbox'a yazılır
// (yalnızca ekip modu açıkken ve sunucudan gelen değişiklik uygulanmıyorken). Varsayılan (tohum) satırlar her
// bilgisayarda aynı uid'yi alır; böylece iki bilgisayarda aynı aşama / hizmet çift kayıt olmaz.

/** Eşitlenen tablolar — ebeveynler önce (ilk yüklemede sıra korunur). */
export const SYNC_TABLES = [
  'stages', 'tags', 'services', 'automation_profiles', 'saved_filters', 'research_projects',
  'companies', 'company_contacts', 'company_tags', 'notes', 'stage_history', 'activity_logs',
  'website_analyses', 'analysis_findings', 'screenshots', 'research_results',
  'outreach_permissions', 'outreach_drafts', 'outreach_messages', 'communication_events', 'suppression_list',
  'offers', 'offer_items', 'tasks', 'files', 'inbound_requests', 'match_candidates', 'concepts'
] as const

export type SyncTable = (typeof SYNC_TABLES)[number]

const newUid = "lower(hex(randomblob(12)))"

/** Tohum satırların sabit uid'leri (seed sonrasında da çağrılır; idempotent). */
export const DETERMINISTIC_UIDS_SQL = `
UPDATE stages SET uid = 'st-' || lower(key) WHERE uid IS NULL OR uid <> 'st-' || lower(key);
UPDATE services SET uid = 'sv-' || lower(key) WHERE key IS NOT NULL AND (uid IS NULL OR uid <> 'sv-' || lower(key));
UPDATE automation_profiles SET uid = 'ap-' || substr(lower(hex(name)), 1, 36) WHERE uid IS NULL OR uid NOT LIKE 'ap-%';
`

export function syncMigrationSql(): string {
  const parts: string[] = [
    `CREATE TABLE sync_flag (id INTEGER PRIMARY KEY CHECK (id = 1), enabled INTEGER NOT NULL DEFAULT 0, applying INTEGER NOT NULL DEFAULT 0);`,
    `INSERT INTO sync_flag(id, enabled, applying) VALUES (1, 0, 0);`,
    `CREATE TABLE sync_outbox (id INTEGER PRIMARY KEY, entity TEXT NOT NULL, rid INTEGER, uid TEXT, op TEXT NOT NULL, at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));`,
    `CREATE TABLE sync_shadow (entity TEXT NOT NULL, uid TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (entity, uid));`,
    `CREATE TABLE sync_pending (entity TEXT NOT NULL, uid TEXT NOT NULL, seq INTEGER NOT NULL, data TEXT, deleted INTEGER NOT NULL DEFAULT 0, tries INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (entity, uid));`,
    `CREATE TABLE sync_blobs (uid TEXT PRIMARY KEY, direction TEXT NOT NULL, tries INTEGER NOT NULL DEFAULT 0, last_error TEXT, at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));`
  ]
  const on = `(SELECT enabled FROM sync_flag WHERE id = 1) = 1 AND (SELECT applying FROM sync_flag WHERE id = 1) = 0`
  for (const t of SYNC_TABLES) {
    parts.push(
      `ALTER TABLE ${t} ADD COLUMN uid TEXT;`,
      `UPDATE ${t} SET uid = ${newUid} WHERE uid IS NULL;`,
      `CREATE UNIQUE INDEX idx_${t}_uid ON ${t}(uid);`,
      `CREATE TRIGGER trg_${t}_uid AFTER INSERT ON ${t} WHEN NEW.uid IS NULL BEGIN UPDATE ${t} SET uid = ${newUid} WHERE rowid = NEW.rowid; END;`,
      `CREATE TRIGGER trg_${t}_oi AFTER INSERT ON ${t} WHEN ${on} BEGIN INSERT INTO sync_outbox(entity, rid, op) VALUES ('${t}', NEW.rowid, 'upsert'); END;`,
      `CREATE TRIGGER trg_${t}_ou AFTER UPDATE ON ${t} WHEN ${on} BEGIN INSERT INTO sync_outbox(entity, rid, uid, op) VALUES ('${t}', NEW.rowid, NEW.uid, 'upsert'); END;`,
      `CREATE TRIGGER trg_${t}_od AFTER DELETE ON ${t} WHEN ${on} AND OLD.uid IS NOT NULL BEGIN INSERT INTO sync_outbox(entity, rid, uid, op) VALUES ('${t}', OLD.rowid, OLD.uid, 'delete'); END;`
    )
  }
  parts.push(DETERMINISTIC_UIDS_SQL)
  return parts.join('\n')
}
