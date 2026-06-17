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

export const MIGRATION_006 = `
ALTER TABLE workspaces ADD COLUMN continuity_summary TEXT;
`;

export const MIGRATION_007 = `
CREATE TABLE IF NOT EXISTS memory_fragments (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  source_message_id TEXT NOT NULL,
  fragment_type TEXT NOT NULL,
  content TEXT NOT NULL,
  importance_score REAL NOT NULL DEFAULT 0,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE,
  FOREIGN KEY (source_message_id) REFERENCES messages(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS memory_states (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  current_goals_json TEXT NOT NULL,
  important_facts_json TEXT NOT NULL,
  decisions_json TEXT NOT NULL,
  open_loops_json TEXT NOT NULL,
  user_preferences_json TEXT NOT NULL,
  recent_summary TEXT NOT NULL,
  source_message_id TEXT NOT NULL,
  last_updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, thread_id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE,
  FOREIGN KEY (source_message_id) REFERENCES messages(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_profile_memory (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  preference_key TEXT NOT NULL,
  preference_value TEXT NOT NULL,
  confidence_score REAL NOT NULL DEFAULT 0,
  source_fragment_id TEXT NOT NULL,
  source_message_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, preference_key),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (source_fragment_id) REFERENCES memory_fragments(id) ON DELETE CASCADE,
  FOREIGN KEY (source_message_id) REFERENCES messages(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS memory_savepoints (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  active_thread_id TEXT NOT NULL,
  recent_message_checkpoint TEXT NOT NULL,
  continuity_state_snapshot_json TEXT NOT NULL,
  memory_fragment_count INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (active_thread_id) REFERENCES threads(id) ON DELETE CASCADE,
  FOREIGN KEY (recent_message_checkpoint) REFERENCES messages(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_memory_fragments_workspace_thread
  ON memory_fragments(workspace_id, thread_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memory_fragments_source_message
  ON memory_fragments(source_message_id);
CREATE INDEX IF NOT EXISTS idx_memory_fragments_type
  ON memory_fragments(fragment_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memory_states_workspace_thread
  ON memory_states(workspace_id, thread_id, last_updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_profile_memory_workspace
  ON user_profile_memory(workspace_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_memory_savepoints_workspace
  ON memory_savepoints(workspace_id, created_at DESC);
`;

export const MIGRATION_008 = `
ALTER TABLE memory_fragments ADD COLUMN memory_reinforcement_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE memory_fragments ADD COLUMN last_referenced_at TEXT;
ALTER TABLE memory_fragments ADD COLUMN continuity_weight REAL NOT NULL DEFAULT 0.5;
ALTER TABLE memory_fragments ADD COLUMN continuity_category TEXT NOT NULL DEFAULT 'operational_fact';

CREATE TABLE IF NOT EXISTS compressed_memory_states (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  source_fragment_ids_json TEXT NOT NULL,
  generated_summary TEXT NOT NULL,
  continuity_categories_json TEXT NOT NULL,
  reconstruction_hints_json TEXT NOT NULL,
  compressed_at TEXT NOT NULL,
  source_message_checkpoint TEXT NOT NULL,
  compression_reason TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE,
  FOREIGN KEY (source_message_checkpoint) REFERENCES messages(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_memory_fragments_relevance
  ON memory_fragments(workspace_id, thread_id, continuity_category, importance_score DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memory_fragments_referenced
  ON memory_fragments(workspace_id, last_referenced_at DESC);
CREATE INDEX IF NOT EXISTS idx_compressed_memory_states_workspace
  ON compressed_memory_states(workspace_id, thread_id, compressed_at DESC);
`;

export const MIGRATION_009 = `
ALTER TABLE memory_fragments ADD COLUMN continuity_stability_score REAL NOT NULL DEFAULT 0.5;
ALTER TABLE memory_fragments ADD COLUMN continuity_decay_rate REAL NOT NULL DEFAULT 0.04;
ALTER TABLE memory_fragments ADD COLUMN continuity_last_reinforced_at TEXT;

ALTER TABLE compressed_memory_states ADD COLUMN compression_quality_score REAL NOT NULL DEFAULT 0.5;
ALTER TABLE compressed_memory_states ADD COLUMN summary_tier TEXT NOT NULL DEFAULT 'rolling_operational';
ALTER TABLE compressed_memory_states ADD COLUMN archival_state_json TEXT;

CREATE INDEX IF NOT EXISTS idx_memory_fragments_evolution
  ON memory_fragments(workspace_id, thread_id, continuity_stability_score DESC, continuity_last_reinforced_at DESC);
CREATE INDEX IF NOT EXISTS idx_compressed_memory_states_quality
  ON compressed_memory_states(workspace_id, thread_id, compression_quality_score DESC, compressed_at DESC);
`;

export const MIGRATION_010 = `
CREATE TABLE IF NOT EXISTS continuity_validation_snapshots (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  continuity_reconstruction_health REAL NOT NULL,
  continuity_drift_score REAL NOT NULL,
  warning_threshold REAL NOT NULL,
  created_at TEXT NOT NULL,
  metadata_json TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS embedding_cache (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  fragment_id TEXT NOT NULL,
  embedding_key TEXT NOT NULL,
  embedding_vector_json TEXT NOT NULL,
  embedding_model TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, fragment_id, embedding_model),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE,
  FOREIGN KEY (fragment_id) REFERENCES memory_fragments(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_continuity_validation_snapshots_workspace
  ON continuity_validation_snapshots(workspace_id, thread_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_embedding_cache_workspace
  ON embedding_cache(workspace_id, thread_id, updated_at DESC);
`;

export const MIGRATION_011 = `
CREATE TABLE IF NOT EXISTS runtime_calibration_snapshots (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  continuity_fidelity_score REAL NOT NULL,
  operational_consistency_score REAL NOT NULL,
  emotional_continuity_score REAL NOT NULL,
  continuity_reconstruction_health REAL NOT NULL,
  continuity_drift_score REAL NOT NULL,
  created_at TEXT NOT NULL,
  metadata_json TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS maintenance_jobs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL,
  priority INTEGER NOT NULL,
  cpu_budget_ms REAL NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  metadata_json TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_runtime_calibration_workspace
  ON runtime_calibration_snapshots(workspace_id, thread_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_maintenance_jobs_queue
  ON maintenance_jobs(workspace_id, thread_id, status, priority DESC, updated_at ASC);
`;

export const MIGRATION_012 = `
CREATE TABLE IF NOT EXISTS runtime_health_snapshots (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  runtime_health_score REAL NOT NULL,
  recovery_confidence_score REAL NOT NULL,
  memory_pressure TEXT NOT NULL,
  context_assembly_ms REAL NOT NULL,
  reconstruction_ms REAL NOT NULL,
  savepoint_ms REAL NOT NULL,
  compression_ms REAL NOT NULL,
  warnings_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_runtime_health_workspace
  ON runtime_health_snapshots(workspace_id, thread_id, created_at DESC);
`;

export const MIGRATION_013 = `
ALTER TABLE workspaces ADD COLUMN description TEXT;
`;

export const MIGRATION_014 = `
CREATE TABLE IF NOT EXISTS assistant_profile (
  id TEXT PRIMARY KEY,
  assistant_name TEXT NOT NULL DEFAULT 'Assistant',
  assistant_created_at TEXT NOT NULL,
  assistant_identity_version INTEGER NOT NULL DEFAULT 1,
  preferred_tone TEXT NOT NULL DEFAULT 'friendly',
  web_enabled INTEGER NOT NULL DEFAULT 1,
  memory_enabled INTEGER NOT NULL DEFAULT 1,
  continuity_enabled INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO assistant_profile (
  id, assistant_name, assistant_created_at, assistant_identity_version,
  preferred_tone, web_enabled, memory_enabled, continuity_enabled, updated_at
) VALUES (
  'default', 'Assistant', datetime('now'), 1, 'friendly', 1, 1, 1, datetime('now')
);
`;

export const MIGRATION_015 = `
ALTER TABLE memory_fragments ADD COLUMN continuity_score REAL NOT NULL DEFAULT 0;
ALTER TABLE memory_fragments ADD COLUMN project_score REAL NOT NULL DEFAULT 0;
ALTER TABLE memory_fragments ADD COLUMN confidence_score REAL NOT NULL DEFAULT 0.5;

CREATE TABLE IF NOT EXISTS continuity_decision_records (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  source_message_id TEXT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  decided_at TEXT NOT NULL,
  importance_score REAL NOT NULL DEFAULT 0.5,
  continuity_score REAL NOT NULL DEFAULT 0.5,
  project_score REAL NOT NULL DEFAULT 0.5,
  confidence_score REAL NOT NULL DEFAULT 0.5,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS continuity_open_question_records (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  source_message_id TEXT,
  question TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  importance_score REAL NOT NULL DEFAULT 0.5,
  continuity_score REAL NOT NULL DEFAULT 0.5,
  project_score REAL NOT NULL DEFAULT 0.5,
  confidence_score REAL NOT NULL DEFAULT 0.5,
  last_discussed_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS continuity_intelligence_snapshots (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  snapshot_markdown TEXT NOT NULL,
  continuity_score REAL NOT NULL DEFAULT 0.5,
  generated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS continuity_health_metrics (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  thread_id TEXT,
  continuity_coverage REAL NOT NULL DEFAULT 0,
  continuity_confidence REAL NOT NULL DEFAULT 0,
  rebuild_confidence REAL NOT NULL DEFAULT 0,
  project_awareness REAL NOT NULL DEFAULT 0,
  decision_coverage REAL NOT NULL DEFAULT 0,
  open_question_coverage REAL NOT NULL DEFAULT 0,
  metrics_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_continuity_decisions_workspace
  ON continuity_decision_records(workspace_id, decided_at DESC);
CREATE INDEX IF NOT EXISTS idx_continuity_open_questions_workspace
  ON continuity_open_question_records(workspace_id, status, last_discussed_at DESC);
CREATE INDEX IF NOT EXISTS idx_continuity_intelligence_snapshots_workspace
  ON continuity_intelligence_snapshots(workspace_id, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_continuity_health_metrics_workspace
  ON continuity_health_metrics(workspace_id, created_at DESC);
`;

export const MIGRATION_016 = `
CREATE TABLE IF NOT EXISTS ai_life_goals (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  thread_id TEXT,
  source_message_id TEXT,
  goal TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  confidence_score REAL NOT NULL DEFAULT 0.5,
  last_referenced_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ai_life_projects (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  thread_id TEXT,
  source_message_id TEXT,
  project_name TEXT NOT NULL,
  current_objective TEXT NOT NULL,
  last_activity_at TEXT NOT NULL,
  continuity_confidence REAL NOT NULL DEFAULT 0.5,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ai_life_achievements (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  thread_id TEXT,
  source_message_id TEXT,
  project_name TEXT NOT NULL,
  achievement TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  confidence_score REAL NOT NULL DEFAULT 0.5,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ai_life_assistant_history (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  event_title TEXT NOT NULL,
  event_description TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  event_kind TEXT NOT NULL DEFAULT 'milestone',
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ai_life_interests (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  interest TEXT NOT NULL,
  mention_count INTEGER NOT NULL DEFAULT 1,
  confidence_score REAL NOT NULL DEFAULT 0.5,
  last_referenced_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ai_life_snapshots (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  snapshot_markdown TEXT NOT NULL,
  ai_life_score REAL NOT NULL DEFAULT 0.5,
  generated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ai_life_health_metrics (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  ai_life_coverage REAL NOT NULL DEFAULT 0,
  goal_coverage REAL NOT NULL DEFAULT 0,
  project_coverage REAL NOT NULL DEFAULT 0,
  rebuild_confidence REAL NOT NULL DEFAULT 0,
  assistant_history_coverage REAL NOT NULL DEFAULT 0,
  metrics_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ai_life_goals_workspace
  ON ai_life_goals(workspace_id, status, last_referenced_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_life_projects_workspace
  ON ai_life_projects(workspace_id, status, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_life_achievements_workspace
  ON ai_life_achievements(workspace_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_life_assistant_history_workspace
  ON ai_life_assistant_history(workspace_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_life_interests_workspace
  ON ai_life_interests(workspace_id, mention_count DESC);
CREATE INDEX IF NOT EXISTS idx_ai_life_snapshots_workspace
  ON ai_life_snapshots(workspace_id, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_life_health_metrics_workspace
  ON ai_life_health_metrics(workspace_id, created_at DESC);
`;

export const REQUIRED_TABLES = [
  "schema_migrations",
  "app_meta",
  "workspaces",
  "threads",
  "messages",
  "memory_fragments",
  "memory_states",
  "user_profile_memory",
  "memory_savepoints",
  "timeline_events",
  "snapshots",
  "provider_configs",
  "assistant_profile",
  "continuity_decision_records",
  "continuity_open_question_records",
  "continuity_intelligence_snapshots",
  "continuity_health_metrics",
  "ai_life_goals",
  "ai_life_projects",
  "ai_life_achievements",
  "ai_life_assistant_history",
  "ai_life_interests",
  "ai_life_snapshots",
  "ai_life_health_metrics",
] as const;
