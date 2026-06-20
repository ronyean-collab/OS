import { describe, expect, it, afterEach } from "vitest";
import { openTestDatabase } from "../electron/main/database/test-db";
import { createWorkspace } from "../electron/main/services/workspace-service";
import { getProviderConfig } from "../electron/main/services/provider-service";
import {
  bootstrapLocalAiOnStartup,
  ensureDefaultContinuityAiProvider,
} from "../electron/main/services/local-ai-bootstrap";

describe("local ai bootstrap", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length) cleanups.pop()?.();
  });

  it("enables ContinuityOS AI as default provider on new workspace", () => {
    const { db, cleanup } = openTestDatabase();
    cleanups.push(cleanup);
    const ws = createWorkspace(db, "Bootstrap test");
    ensureDefaultContinuityAiProvider(db, ws.id);
    const config = getProviderConfig(db, ws.id);
    expect(config?.provider).toBe("ollama");
    expect(config?.enabled).toBe(true);
  });

  it("bootstraps without throwing when Ollama is offline", async () => {
    const { db, cleanup } = openTestDatabase();
    cleanups.push(cleanup);
    const ws = createWorkspace(db, "Offline bootstrap");
    await expect(bootstrapLocalAiOnStartup(db, ws.id)).resolves.toBeDefined();
  });
});
