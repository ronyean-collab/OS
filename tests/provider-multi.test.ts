import { describe, expect, it, afterEach, beforeEach } from "vitest";
import { openTestDatabase } from "../electron/main/database/test-db";
import { createWorkspace } from "../electron/main/services/workspace-service";
import {
  __setSecureStorageForTests,
  getProviderConfig,
  saveProviderConfig,
} from "../electron/main/services/provider-service";
import { MemorySecureStorageStub } from "../electron/main/secure-storage/memory-stub";
import { testProviderConnection } from "../electron/main/services/provider-connection-test";
import { startAssistantStream } from "../electron/main/services/stream-runtime";
import { getProviderDefinition } from "../src/shared/provider-definitions";

describe("multi-provider setup", () => {
  const cleanups: Array<() => void> = [];
  const stub = new MemorySecureStorageStub();

  beforeEach(() => {
    __setSecureStorageForTests(stub);
  });

  afterEach(() => {
    __setSecureStorageForTests(null);
    while (cleanups.length) cleanups.pop()?.();
  });

  function session() {
    const s = openTestDatabase();
    cleanups.push(s.cleanup);
    return s.db;
  }

  it("saves ollama without api key", () => {
    const db = session();
    const ws = createWorkspace(db, "Ollama WS");
    const config = saveProviderConfig(db, ws.id, "ollama", "llama3.1", "", "http://localhost:11434");
    expect(config.provider).toBe("ollama");
    expect(config.hasApiKey).toBe(false);
    expect(config.baseUrl).toBe("http://localhost:11434");
    expect(config.runtimeReady).toBe(true);
  });

  it("anthropic test returns adapter_not_ready", async () => {
    const db = session();
    const ws = createWorkspace(db, "Claude");
    const result = await testProviderConnection(db, ws.id, {
      provider: "anthropic",
      model: getProviderDefinition("anthropic").recommendedModel,
      apiKey: "sk-ant-test",
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe("adapter_not_ready");
  });

  it("legacy cloud provider configs no longer activate in-app chat", async () => {
    const db = session();
    const ws = createWorkspace(db, "No runtime");
    saveProviderConfig(db, ws.id, "anthropic", "claude-3-5-haiku-latest", "sk-ant-x", "");
    const { createThread } = await import("../electron/main/services/workspace-service");
    const thread = createThread(db, ws.id, "T");
    const fakeSender = { isDestroyed: () => false, send: () => {} };
    const result = await startAssistantStream(
      db,
      fakeSender as import("electron").WebContents,
      { threadId: thread.id, content: "hi" },
    );
    expect(result.userMessage).toBeTruthy();
    expect(result.assistantMessage).toBeNull();
    expect(result.error).toMatch(/In-app chat uses Ollama only/i);
  });

  it("legacy openai config still persists, but is no longer runtime-ready", () => {
    const db = session();
    const ws = createWorkspace(db, "OpenAI");
    saveProviderConfig(db, ws.id, "openai", "gpt-4.1-mini", "sk-persist-1", null);
    const loaded = getProviderConfig(db, ws.id);
    expect(loaded?.displayName).toBe("OpenAI");
    expect(loaded?.hasApiKey).toBe(true);
    expect(loaded?.runtimeReady).toBe(false);
    expect(loaded?.model).toBe("gpt-4.1-mini");
  });
});
