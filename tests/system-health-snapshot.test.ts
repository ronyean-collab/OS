import { describe, expect, it } from "vitest";
import { openTestDatabase } from "../electron/main/database/test-db";
import { createWorkspace } from "../electron/main/services/workspace-service";
import { buildSystemHealthSnapshot } from "../electron/main/services/system-health-snapshot";
import { SCHEMA_VERSION } from "../electron/main/database/schema";

describe("system health snapshot", () => {
  it("reports healthy migration and startup on fresh database", () => {
    const { db, cleanup } = openTestDatabase();
    const ws = createWorkspace(db, "Health test");
    const snap = buildSystemHealthSnapshot(db, ws.id);
    expect(snap.migrationHealth.appliedVersion).toBeGreaterThanOrEqual(0);
    expect(snap.migrationHealth.expectedVersion).toBe(SCHEMA_VERSION);
    expect(snap.migrationHealth.status).toBe("healthy");
    expect(snap.startupHealth.status).not.toBe("unhealthy");
    expect(snap.providerHealth.detail).toMatch(/Manual Mode|Ollama/i);
    cleanup();
  });
});
