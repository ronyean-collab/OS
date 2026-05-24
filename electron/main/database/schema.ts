/** Re-export schema version from shared app version module. */
export { SCHEMA_VERSION } from "../../../src/shared/app-version";
import { PERFORMANCE_INDEX_DDL } from "./indexes";

export const MIGRATION_001 = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT,
  display_name TEXT,
  supabase_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_opened_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS threads (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  provider TEXT,
  model TEXT,
  raw_provider_payload TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS provider_configs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  secure_key_ref TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS continuity_records (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  record_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS timeline_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  thread_id TEXT,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS snapshots (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  thread_id TEXT,
  label TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS branches (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  parent_branch_id TEXT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS workspace_roots (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  root_path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  path TEXT NOT NULL,
  content_hash TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sync_status (
  workspace_id TEXT PRIMARY KEY,
  last_sync_at TEXT,
  status TEXT NOT NULL DEFAULT 'local_only',
  error_message TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sync_queue (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_threads_workspace ON threads(workspace_id);
CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_timeline_workspace ON timeline_events(workspace_id);
CREATE INDEX IF NOT EXISTS idx_sync_queue_workspace ON sync_queue(workspace_id);
`;

export const MIGRATION_002 = `
ALTER TABLE messages ADD COLUMN message_status TEXT NOT NULL DEFAULT 'completed';
ALTER TABLE timeline_events ADD COLUMN source TEXT NOT NULL DEFAULT 'system';
ALTER TABLE snapshots ADD COLUMN snapshot_reason TEXT;
ALTER TABLE snapshots ADD COLUMN app_version TEXT;
ALTER TABLE snapshots ADD COLUMN schema_version INTEGER;
CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(message_status);
`;

export const MIGRATION_003 = `
ALTER TABLE timeline_events ADD COLUMN app_version TEXT;
ALTER TABLE timeline_events ADD COLUMN schema_version INTEGER;
ALTER TABLE timeline_events ADD COLUMN build_number TEXT;
`;

export const MIGRATION_004 = `
ALTER TABLE sync_queue ADD COLUMN status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE snapshots ADD COLUMN replay_hash TEXT;
${PERFORMANCE_INDEX_DDL}
`;

export const MIGRATION_005 = `
ALTER TABLE threads ADD COLUMN sort_order INTEGER;
ALTER TABLE threads ADD COLUMN archived_at TEXT;
ALTER TABLE threads ADD COLUMN deleted_at TEXT;
CREATE INDEX IF NOT EXISTS idx_threads_workspace_sort ON threads(workspace_id, sort_order, updated_at);
UPDATE threads SET sort_order = (
  SELECT rn FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY workspace_id ORDER BY updated_at DESC) - 1 AS rn
    FROM threads
  ) ranked WHERE ranked.id = threads.id
) WHERE sort_order IS NULL;
`;

export const REQUIRED_TABLES = [
  "schema_migrations",
  "app_meta",
  "workspaces",
  "threads",
  "messages",
  "timeline_events",
  "snapshots",
  "provider_configs",
] as const;
