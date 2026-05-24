import { describe, expect, it, vi, beforeEach } from "vitest";

const createMock = vi.fn();

vi.mock("openai", () => {
  return {
    default: class OpenAI {
      chat = {
        completions: {
          create: createMock,
        },
      };
      constructor() {}
    },
  };
});

describe("OpenAI adapter", () => {
  beforeEach(async () => {
    createMock.mockReset();
    vi.resetModules();
  });

  it("isConfigured requires api key", async () => {
    const { OpenAIAdapter } = await import(
      "../electron/main/providers/openai-adapter"
    );
    const adapter = new OpenAIAdapter();
    expect(adapter.isConfigured(null)).toBe(false);
    expect(adapter.isConfigured("sk-test")).toBe(true);
  });

  it("complete calls OpenAI SDK with messages", async () => {
    createMock.mockResolvedValue({
      model: "gpt-4o-mini",
      choices: [{ message: { content: "Hi there" } }],
    });

    const { OpenAIAdapter } = await import(
      "../electron/main/providers/openai-adapter"
    );
    const adapter = new OpenAIAdapter();
    const result = await adapter.complete(
      {
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "Hello" }],
      },
      "sk-test",
    );

    expect(result.content).toBe("Hi there");
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ stream: false, model: "gpt-4o-mini" }),
    );
  });

  it("streamMessage aggregates chunks", async () => {
    async function* fakeStream() {
      yield { choices: [{ delta: { content: "A" } }] };
      yield { choices: [{ delta: { content: "B" } }] };
    }
    createMock.mockResolvedValue(fakeStream());

    const { OpenAIAdapter } = await import(
      "../electron/main/providers/openai-adapter"
    );
    const adapter = new OpenAIAdapter();
    const chunks: string[] = [];
    let done = "";

    await adapter.streamMessage(
      { model: "gpt-4o-mini", messages: [{ role: "user", content: "Hi" }] },
      "sk-test",
      {
        onChunk: (d, acc) => {
          chunks.push(d);
          done = acc;
        },
        onComplete: (r) => {
          done = r.content;
        },
        onError: () => {},
      },
    );

    expect(chunks).toEqual(["A", "B"]);
    expect(done).toBe("AB");
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ stream: true }),
    );
  });
});
