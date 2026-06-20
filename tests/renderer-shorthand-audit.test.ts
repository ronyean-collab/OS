import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "..");

const FOCUS_RENDERER_FILES = [
  "src/renderer/src/App.tsx",
  "src/renderer/src/components/ChatPanel.tsx",
  "src/renderer/src/components/AssistantPreparationScreen.tsx",
  "src/renderer/src/components/ProviderSetupPanel.tsx",
  "src/renderer/src/components/FirstTimeExperienceDevPanel.tsx",
  "src/renderer/src/components/ProvidersCenterPanel.tsx",
  "src/renderer/src/components/AiConnectionStatusSection.tsx",
];

const CHAT_PANEL_REQUIRED_PROPS = ["consumerStatusMessage"];

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

function destructuredPropNames(source: string, fnName: string): Set<string> {
  const re = new RegExp(
    `export function ${fnName}\\(\\{([\\s\\S]*?)\\}:\\s*\\w+\\)\\s*\\{`,
  );
  const m = source.match(re);
  if (!m) return new Set();
  const names = new Set<string>();
  for (const part of m[1].split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const name = trimmed.split(/[=:]/)[0].trim();
    if (/^[a-zA-Z_]\w*$/.test(name)) names.add(name);
  }
  return names;
}

function hasImport(source: string, symbol: string): boolean {
  return new RegExp(
    `import\\s*\\{[^}]*\\b${symbol}\\b[^}]*\\}\\s*from`,
  ).test(source);
}

/** Unsafe: resolveComposerHint block uses bare shorthand for names not in props destructuring. */
function unsafeComposerHintShorthand(source: string, fnName: string): string | null {
  const props = destructuredPropNames(source, fnName);
  const block = source.match(/resolveComposerHint\(\{[\s\S]*?\}\)/);
  if (!block) return null;
  const body = block[0];
  for (const line of body.split("\n")) {
    const m = line.match(/^\s*([a-zA-Z_]\w*),?\s*$/);
    if (!m) continue;
    const key = m[1];
    if (!props.has(key)) {
      return `bare shorthand "${key}" in resolveComposerHint without ${fnName} prop destructuring`;
    }
  }
  return null;
}

describe("renderer shorthand audit", () => {
  it("ChatPanel destructures consumerStatusMessage and resolves in App only", () => {
    const source = read("src/renderer/src/components/ChatPanel.tsx");
    const props = destructuredPropNames(source, "ChatPanel");
    for (const name of CHAT_PANEL_REQUIRED_PROPS) {
      expect(props.has(name)).toBe(true);
    }
    expect(unsafeComposerHintShorthand(source, "ChatPanel")).toBeNull();
    if (source.includes("resolveConsumerStatusMessage(")) {
      expect(hasImport(source, "resolveConsumerStatusMessage")).toBe(true);
    }
  });

  it("focus renderer files have no unsafe resolveComposerHint shorthand", () => {
    for (const rel of FOCUS_RENDERER_FILES) {
      const source = read(rel);
      const fn = source.match(/export function (\w+)/)?.[1];
      if (!fn || !source.includes("resolveComposerHint(")) continue;
      expect(unsafeComposerHintShorthand(source, fn), rel).toBeNull();
    }
  });

  it("consumer-status-message module exports resolver with default fallback", () => {
    const source = read("src/shared/consumer-status-message.ts");
    expect(source).toContain("DEFAULT_CONSUMER_STATUS_MESSAGE");
    expect(source).toContain("export function resolveConsumerStatusMessage");
  });
});
