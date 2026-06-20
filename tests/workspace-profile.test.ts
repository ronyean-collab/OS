import { describe, expect, it, afterEach } from "vitest";
import { openTestDatabase } from "../electron/main/database/test-db";
import {
  createWorkspace,
  updateWorkspaceProfile,
  getWorkspaceById,
} from "../electron/main/services/workspace-service";
import { scanWorkspaceHealth } from "../electron/main/services/workspace-health";

describe("workspace profile", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length) cleanups.pop()?.();
  });

  it("renames workspace and stores description", () => {
    const { db, cleanup } = openTestDatabase();
    cleanups.push(cleanup);
    const ws = createWorkspace(db, "Original");
    const updated = updateWorkspaceProfile(db, ws.id, {
      name: "Renamed workspace",
      description: "Daily driver test workspace",
    });
    expect(updated.name).toBe("Renamed workspace");
    expect(updated.description).toBe("Daily driver test workspace");
    const loaded = getWorkspaceById(db, ws.id);
    expect(loaded?.name).toBe("Renamed workspace");
    const health = scanWorkspaceHealth(db, ws.id);
    expect(["healthy", "attention", "unhealthy"]).toContain(health.status);
  });
});
