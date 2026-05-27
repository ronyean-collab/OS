import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openTestDatabase } from "../electron/main/database/test-db";
import { createThread, createWorkspace, updateContinuitySummary } from "../electron/main/services/workspace-service";
import {
  __setSecureStorageForTests,
  saveProviderConfig,
} from "../electron/main/services/provider-service";
import { MemorySecureStorageStub } from "../electron/main/secure-storage/memory-stub";
import { getLocalAiStatus } from "../electron/main/services/local-ai-service";
import { startAssistantStream } from "../electron/main/services/stream-runtime";
import { listMessages } from "../electron/main/services/message-service";
import { applyContinuityImportFile } from "../electron/main/services/continuity-import-file";

const mockSender = {
  isDestroyed: () => false,
  send: vi.fn(),
} as unknown as import("electron").WebContents;

describe("local AI / Ollama", () => {
  const cleanups: Array<() => void> = [];
  const secureStorageStub = new MemorySecureStorageStub();

  beforeEach(() => {
    __setSecureStorageForTests(secureStorageStub);
  });

  afterEach(() => {
    __setSecureStorageForTests(null);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    while (cleanups.length) cleanups.pop()?.();
  });

  function session() {
    const opened = openTestDatabase();
    cleanups.push(opened.cleanup);
    return opened.db;
  }

  it("returns a calm not-running status when Ollama is unavailable", async () => {
    const db = session();
    const workspace = createWorkspace(db, "Local AI");
    vi.stubEnv("OLLAMA_HOST", "");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    const status = await getLocalAiStatus(db, workspace.id);
    expect(status.detected).toBe(false);
    expect(status.state).toBe("ollama_not_detected");
    expect(status.message).toMatch(/Install or start Ollama/i);
    expect(status.models).toEqual([]);
  });

  it("detects Ollama on the default 11434 endpoint and lists models", async () => {
    const db = session();
    const workspace = createWorkspace(db, "Default Ollama");
    vi.stubEnv("OLLAMA_HOST", "");
    const fetchMock = vi.fn().mockImplementation((input: string | URL) => {
      const url = String(input);
      if (url === "http://localhost:11434/api/tags") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              models: [{ name: "llama3.1" }, { name: "mistral" }],
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
        );
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    const status = await getLocalAiStatus(db, workspace.id);
    expect(status.detected).toBe(true);
    expect(status.state).toBe("ollama_ready");
    expect(status.baseUrl).toBe("http://localhost:11434");
    expect(status.models).toEqual(["llama3.1", "mistral"]);
  });

  it("detects Ollama on fallback port 11500 and uses the detected URL for chat", async () => {
    const db = session();
    const workspace = createWorkspace(db, "Ollama workspace");
    vi.stubEnv("OLLAMA_HOST", "");
    updateContinuitySummary(db, workspace.id, "Keep the app local-first.");
    const thread = createThread(db, workspace.id, "Chat");
    saveProviderConfig(
      db,
      workspace.id,
      "ollama",
      "llama3.1:latest",
      "",
      "http://localhost:11434",
    );
    applyContinuityImportFile(
      db,
      {
        workspaceId: workspace.id,
        mode: "update-current",
        text: `# CONTINUITYOS IMPORT FILE
version: 1
source_ai: Claude
generated_at: 2026-05-25T10:00:00.000Z
project_name: Local AI workspace
project_type: Desktop app
## CURRENT OBJECTIVE
Route chat through local AI when available.
## STABLE FACTS
- Local AI is optional
## NEXT STEPS
- Keep fallback calm
`,
      },
    );

    const fetchMock = vi.fn().mockImplementation((input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (
        url === "http://localhost:11434/api/tags" ||
        url === "http://127.0.0.1:11434/api/tags"
      ) {
        return Promise.reject(new Error("ECONNREFUSED"));
      }
      if (url === "http://localhost:11500/api/tags") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              models: [{ name: "llama3.1" }, { name: "llama3" }, { name: "mistral" }],
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
        );
      }
      if (url === "http://localhost:11500/api/chat") {
        const parsed = JSON.parse(String(init?.body)) as { model: string };
        expect(parsed.model).toBe("llama3.1:latest");
        return Promise.resolve(
          new Response(
            JSON.stringify({
              model: "llama3.1:latest",
              message: { content: "Local response complete." },
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
        );
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    const status = await getLocalAiStatus(db, workspace.id);
    expect(status.detected).toBe(true);
    expect(status.baseUrl).toBe("http://localhost:11500");
    expect(status.models).toEqual(["llama3.1", "llama3", "mistral"]);
    expect(status.selected).toBe(true);
    expect(status.selectedModel).toBe("llama3.1:latest");

    const result = await startAssistantStream(db, mockSender, {
      threadId: thread.id,
      content: "Use local AI please",
    });

    expect(result.streamId).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 20));

    const chatCall = fetchMock.mock.calls.find(
      (call) => String(call[0]) === "http://localhost:11500/api/chat",
    );
    expect(chatCall).toBeTruthy();

    const chatRequestBody = JSON.parse(String(chatCall?.[1]?.body)) as {
      model: string;
      messages: Array<{ role: string; content: string }>;
    };
    const systemMessage = chatRequestBody.messages.find((message) => message.role === "system");
    expect(systemMessage?.content).toContain("Keep the app local-first.");
    expect(systemMessage?.content).toContain("Route chat through local AI when available.");
    expect(systemMessage?.content).toContain("Local AI is optional");

    const messages = listMessages(db, thread.id);
    expect(messages.some((message) => message.content === "Use local AI please")).toBe(true);
    expect(messages.some((message) => message.content === "Local response complete.")).toBe(true);
    const assistant = messages.find((message) => message.role === "assistant");
    expect(assistant?.provider).toBe("ollama");
    expect(assistant?.model).toBe("llama3.1:latest");
  });

  it("streams chat with ready local status baseUrl and model without setup-guide errors", async () => {
    const db = session();
    const workspace = createWorkspace(db, "Ready Ollama");
    const thread = createThread(db, workspace.id, "Chat");
    saveProviderConfig(db, workspace.id, "openai", "gpt-4.1-mini", "sk-openai-x", "");
    saveProviderConfig(
      db,
      workspace.id,
      "ollama",
      "llama3.1:latest",
      "",
      "http://127.0.0.1:11500",
    );
    vi.stubEnv("OLLAMA_HOST", "127.0.0.1:11500");

    const fetchMock = vi.fn().mockImplementation((input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "http://127.0.0.1:11500/api/tags") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              models: [{ name: "llama3.1:latest" }, { name: "mistral" }],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }
      if (url === "http://127.0.0.1:11500/api/chat") {
        const parsed = JSON.parse(String(init?.body)) as { model: string };
        expect(parsed.model).toBe("llama3.1:latest");
        return Promise.resolve(
          new Response(
            JSON.stringify({
              model: "llama3.1:latest",
              message: { content: "Hello from Ollama." },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    const status = await getLocalAiStatus(db, workspace.id);
    expect(status.state).toBe("ollama_ready");
    expect(status.baseUrl).toBe("http://127.0.0.1:11500");
    expect(status.selectedModel).toBe("llama3.1:latest");

    const result = await startAssistantStream(db, mockSender, {
      threadId: thread.id,
      content: "hello",
      ollama: {
        model: status.selectedModel!,
        baseUrl: status.baseUrl!,
      },
    });

    expect(result.streamId).toBeTruthy();
    expect(String(result.error ?? "")).not.toMatch(/select a local model/i);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(fetchMock.mock.calls.some((call) => String(call[0]).endsWith("/api/chat"))).toBe(
      true,
    );
    const messages = listMessages(db, thread.id);
    expect(messages.some((message) => message.content === "Hello from Ollama.")).toBe(true);
  });

  it("prefers OLLAMA_HOST when it is configured", async () => {
    const db = session();
    const workspace = createWorkspace(db, "Env Ollama");
    vi.stubEnv("OLLAMA_HOST", "127.0.0.1:11500");
    const fetchMock = vi.fn().mockImplementation((input: string | URL) => {
      const url = String(input);
      if (url === "http://127.0.0.1:11500/api/tags") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              models: [{ name: "llama3.1" }],
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
        );
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    const status = await getLocalAiStatus(db, workspace.id);
    expect(status.detected).toBe(true);
    expect(status.baseUrl).toBe("http://127.0.0.1:11500");
    expect(status.models).toEqual(["llama3.1"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("http://127.0.0.1:11500/api/tags");
  });
});
