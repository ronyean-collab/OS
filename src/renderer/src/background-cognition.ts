export type MemoryConfidenceLabel =
  | "confirmed"
  | "likely"
  | "fresh"
  | "unknown"
  | "stale"
  | "conflicting"
  | "needs verification";

export type BackgroundCognitionInput = {
  workspace?: string;
  workspaceName?: string;
  projectName?: string;
  activeWorkspace?: string;
  thread?: string;
  activeThread?: string;
  threadTitle?: string;
  currentThread?: string;
  latestUserIntent?: string;
  latestPolarisResult?: string;
  nextAction?: string;
  continuitySummary?: string;
  messages?: Array<{
    role?: string;
    content?: string;
    createdAt?: string;
  }>;
};

export type BackgroundCognitionResult = {
  backgroundCognitionSnapshot: string;
  memoryImportance: number;
  confidence: MemoryConfidenceLabel;
  scentTags: string[];
  digitalScentTrace: string;
  retrievalPhrases: string[];
  nextAction: string;
};

function compactCognitionText(value: unknown, maxLength = 140): string {
  if (typeof value !== "string") return "UNKNOWN";

  const compacted = value.replace(/\s+/g, " ").trim();

  if (!compacted) return "UNKNOWN";
  if (compacted.length <= maxLength) return compacted;

  return `${compacted.slice(0, Math.max(0, maxLength - 3))}...`;
}

function readCognitionString(input: BackgroundCognitionInput, keys: string[], fallback = "UNKNOWN"): string {
  const record = input as Record<string, unknown>;

  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string" && value.trim().length > 0) {
      return compactCognitionText(value);
    }
  }

  return fallback;
}

function collectCognitionSearchText(input: BackgroundCognitionInput): string {
  const directText = Object.values(input)
    .flatMap((value) => {
      if (typeof value === "string") return [value];
      return [];
    })
    .join(" ");

  const messageText = Array.isArray(input.messages)
    ? input.messages.map((message) => message.content || "").join(" ")
    : "";

  return `${directText} ${messageText}`.toLowerCase();
}

function uniqueList(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function extractDigitalScentTags(input: BackgroundCognitionInput): string[] {
  const text = collectCognitionSearchText(input);
  const tags: string[] = [];

  if (text.includes("ollama") || text.includes("llama") || text.includes("qwen") || text.includes("mistral")) {
    tags.push("local-ai");
  }

  if (text.includes("freeze") || text.includes("frozen") || text.includes("streaming") || text.includes("timeout")) {
    tags.push("runtime-freeze");
  }

  if (text.includes("build") || text.includes("npm run build") || text.includes("task-feedback-log")) {
    tags.push("build-debugging");
  }

  if (text.includes("memory") || text.includes("continuity") || text.includes("resume") || text.includes("project state")) {
    tags.push("continuity-memory");
  }

  if (text.includes("scent") || text.includes("retrieval phrase") || text.includes("association")) {
    tags.push("digital-scent");
  }

  if (text.includes("phase")) {
    tags.push("phased-development");
  }

  if (text.includes("powershell") || text.includes("aider") || text.includes("continue.dev") || text.includes("vscode")) {
    tags.push("user-workflow");
  }

  return uniqueList(tags).slice(0, 10);
}

function resolveMemoryImportanceScore(input: BackgroundCognitionInput): number {
  const text = collectCognitionSearchText(input);
  let score = 20;

  const highValueSignals = [
    "must",
    "need",
    "bug",
    "failed",
    "error",
    "freeze",
    "timeout",
    "decision",
    "architecture",
    "phase",
    "important",
    "remember",
    "frustrating",
    "trust",
    "blocker"
  ];

  for (const signal of highValueSignals) {
    if (text.includes(signal)) score += 7;
  }

  return Math.max(0, Math.min(100, score));
}

function resolveMemoryConfidenceLabel(input: BackgroundCognitionInput, importance: number): MemoryConfidenceLabel {
  const text = collectCognitionSearchText(input);

  if (text.includes("unknown")) return "unknown";
  if (text.includes("conflict") || text.includes("contradict")) return "conflicting";
  if (text.includes("stale") || text.includes("old")) return "stale";
  if (text.includes("passed") || text.includes("verified") || text.includes("build passed")) return "confirmed";
  if (importance >= 70) return "likely";

  return "fresh";
}

function pickMatches(text: string, patterns: Array<[string, string[]]>, fallback: string): string {
  const matches = patterns
    .filter(([, needles]) => needles.some((needle) => text.includes(needle)))
    .map(([label]) => label);

  return matches.length > 0 ? matches.slice(0, 5).join(", ") : fallback;
}

function buildDigitalScentTrace(input: BackgroundCognitionInput, scentTags: string[]): string {
  const text = collectCognitionSearchText(input);

  const place = readCognitionString(input, ["workspace", "workspaceName", "projectName", "activeWorkspace"]);
  const thread = readCognitionString(input, ["activeThread", "threadTitle", "thread", "currentThread"]);

  const files = pickMatches(
    text,
    [
      ["App.tsx", ["app.tsx"]],
      ["background-cognition.ts", ["background-cognition.ts", "retrieval context"]],
      ["ollama-adapter.ts", ["ollama-adapter.ts", "ollama adapter"]],
      ["task-feedback-log.txt", ["task-feedback-log", "feedback log"]],
      ["continuity markdown", ["continuity file", "markdown export", "project state"]]
    ],
    "not detected"
  );

  const tools = pickMatches(
    text,
    [
      ["PowerShell", ["powershell", "pwsh"]],
      ["npm run build", ["npm run build", "build check"]],
      ["Ollama", ["ollama", "llama", "qwen", "mistral"]],
      ["Electron", ["electron"]],
      ["Vite", ["vite"]]
    ],
    "not detected"
  );

  const symptoms = pickMatches(
    text,
    [
      ["freeze", ["freeze", "frozen", "stuck", "streaming"]],
      ["timeout", ["timeout", "timed out"]],
      ["build error", ["build error", "failed to compile", "tsc"]],
      ["memory gap", ["lost context", "memory", "resume", "continue"]]
    ],
    "not detected"
  );

  const emotionalWeight = pickMatches(
    text,
    [
      ["frustration", ["frustrating", "frustrated", "annoying", "not clear"]],
      ["urgency", ["urgent", "must", "need", "blocker"]],
      ["trust risk", ["wrong", "failed", "broken", "does not work"]]
    ],
    "normal"
  );

  const tags = scentTags.length > 0 ? scentTags.join(", ") : "none";

  return `place: ${place} | thread: ${thread} | files: ${files} | tools/commands: ${tools} | symptoms: ${symptoms} | emotional weight: ${emotionalWeight} | tags: ${tags}`;
}

function buildDigitalScentRetrievalPhrases(input: BackgroundCognitionInput, scentTags: string[]): string[] {
  const text = collectCognitionSearchText(input);
  const phrases: string[] = [];

  if (text.includes("freeze") || text.includes("streaming") || text.includes("timeout")) {
    phrases.push("the freeze issue", "the streaming bug");
  }

  if (text.includes("build") || text.includes("task-feedback-log")) {
    phrases.push("the build bug", "the latest build log");
  }

  if (text.includes("memory") || text.includes("continuity") || text.includes("resume")) {
    phrases.push("the memory work", "the continuity state");
  }

  if (text.includes("scent") || scentTags.includes("digital-scent")) {
    phrases.push("the memory retrieval idea", "the retrieval trace phase");
  }

  if (text.includes("ollama")) {
    phrases.push("the Ollama path");
  }

  if (phrases.length === 0) {
    phrases.push("the current phase", "the latest Polaris work");
  }

  return uniqueList(phrases).slice(0, 8);
}

function resolveNextAction(input: BackgroundCognitionInput): string {
  const explicitNextAction = readCognitionString(input, ["nextAction"], "");

  if (explicitNextAction) {
    return explicitNextAction;
  }

  const text = collectCognitionSearchText(input);

  if (text.includes("build") || text.includes("task-feedback-log")) {
    return "Review the uploaded result log, verify the build, then proceed one phase at a time.";
  }

  if (text.includes("freeze") || text.includes("timeout")) {
    return "Protect the local chat path with deterministic fallback logic before adding more model calls.";
  }

  if (text.includes("memory") || text.includes("scent")) {
    return "Continue strengthening hidden background memory while keeping Polaris as the only user-facing assistant.";
  }

  return "Continue the current phase with a small deterministic patch and verify with npm run build.";
}

export function runBackgroundCognition(input: BackgroundCognitionInput): BackgroundCognitionResult {
  const scentTags = extractDigitalScentTags(input);
  const memoryImportance = resolveMemoryImportanceScore(input);
  const confidence = resolveMemoryConfidenceLabel(input, memoryImportance);
  const digitalScentTrace = buildDigitalScentTrace(input, scentTags);
  const retrievalPhrases = buildDigitalScentRetrievalPhrases(input, scentTags);
  const nextAction = resolveNextAction(input);

  const workspace = readCognitionString(input, ["workspace", "workspaceName", "projectName", "activeWorkspace"]);
  const thread = readCognitionString(input, ["activeThread", "threadTitle", "thread", "currentThread"]);
  const latestUserIntent = readCognitionString(input, ["latestUserIntent"]);
  const latestPolarisResult = readCognitionString(input, ["latestPolarisResult"]);

  const backgroundCognitionSnapshot = [
    "## Retrieval Context Snapshot",
    "",
    "### Memory Context",
    `- Workspace: ${workspace}`,
    `- Active thread: ${thread}`,
    `- Latest user intent: ${latestUserIntent}`,
    `- Latest Polaris result: ${latestPolarisResult}`,
    "",
    "### Scent Agent",
    "- Purpose: mimic human smell by storing contextual retrieval cues, not just exact words.",
    "- Human analogy: smell retrieves memories through association; memory retrieval retrieves work through project cues.",
    `- Retrieval tags: ${scentTags.length > 0 ? scentTags.join(", ") : "UNKNOWN"}`,
    `- Retrieval trace: ${digitalScentTrace}`,
    `- Retrieval phrases: ${retrievalPhrases.join(", ")}`,
    "",
    "### Priority Context",
    `- Importance score: ${memoryImportance}/100`,
    "- Priority rule: decisions, blockers, freezes, architecture, and user workflow preferences are high priority.",
    "",
    "### Confidence Context",
    `- Confidence: ${confidence}`,
    "- Trust rule: if memory is weak, Polaris should say it is uncertain instead of inventing.",
    "",
    "### Planning Context",
    `- Next action: ${nextAction}`
  ].join("\n");

  return {
    backgroundCognitionSnapshot,
    memoryImportance,
    confidence,
    scentTags,
    digitalScentTrace,
    retrievalPhrases,
    nextAction
  };
}
