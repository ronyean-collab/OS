/**
 * Performance indexes — deterministic ordering queries unchanged.
 * Applied via migration 004; definitions kept here for auditability.
 */
export const PERFORMANCE_INDEX_DDL = `
CREATE INDEX IF NOT EXISTS idx_messages_thread_created ON messages(thread_id, created_at, id);
CREATE INDEX IF NOT EXISTS idx_timeline_workspace_created ON timeline_events(workspace_id, created_at, id);
CREATE INDEX IF NOT EXISTS idx_snapshots_workspace_created ON snapshots(workspace_id, created_at, id);
CREATE INDEX IF NOT EXISTS idx_threads_workspace_updated ON threads(workspace_id, updated_at, id);
CREATE INDEX IF NOT EXISTS idx_sync_queue_status_created ON sync_queue(status, created_at);
`;

export const PERFORMANCE_INDEX_NAMES = [
  "idx_messages_thread_created",
  "idx_timeline_workspace_created",
  "idx_snapshots_workspace_created",
  "idx_threads_workspace_updated",
  "idx_sync_queue_status_created",
] as const;
