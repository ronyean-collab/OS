export type MemoryEventType =
  | "decision"
  | "blocker"
  | "build_result"
  | "phase_progress"
  | "user_preference"
  | "architecture"
  | "debugging"
  | "continuity"
  | "general";

export type MemoryEventConfidence =
  | "confirmed"
  | "likely"
  | "fresh"
  | "unknown"
  | "stale"
  | "conflicting"
  | "needs verification";

export type MemoryEventInput = {
  workspaceId?: string;
  workspaceName?: string;
  threadId?: string;
  threadTitle?: string;
  sourceMessageIds?: string[];
  latestUserIntent?: string;
  latestPolarisResult?: string;
  continuitySummary?: string;
  importanceScore?: number;
  confidence?: MemoryEventConfidence;
  scentTags?: string[];
  digitalScentTrace?: string;
  retrievalPhrases?: string[];
  nextAction?: string;
};

export type MemoryEvent = {
  id: string;
  workspace_id: string;
  thread_id: string;
  created_at: string;
  type: MemoryEventType;
  summary: string;
  importance_score: number;
  confidence: MemoryEventConfidence;
  source_message_ids: string[];
  related_files: string[];
  related_commands: string[];
  scent_tags: string[];
  emotional_weight: "low" | "normal" | "high";
  digital_scent_trace: string;
  retrieval_phrases: string[];
  next_action: string;
};

function normalizeText(value: unknown, fallback = "UNKNOWN"): string {
  if (typeof value !== "string") return fallback;

  const compacted = value.replace(/\s+/g, " ").trim();

  return compacted.length > 0 ? compacted : fallback;
}

function compactText(value: unknown, maxLength = 220, fallback = "UNKNOWN"): string {
  const normalized = normalizeText(value, fallback);

  if (normalized.length <= maxLength) return normalized;

  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
}

function slugifyIdPart(value: unknown, fallback: string): string {
  const normalized = normalizeText(value, fallback)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || fallback;
}

function stableHash(value: string): string {
  let hash = 5381;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }

  return (hash >>> 0).toString(36);
}

function collectSearchText(input: MemoryEventInput): string {
  return [
    input.workspaceName,
    input.threadTitle,
    input.latestUserIntent,
    input.latestPolarisResult,
    input.continuitySummary,
    input.digitalScentTrace,
    input.nextAction,
    ...(input.scentTags || []),
    ...(input.retrievalPhrases || [])
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
}

function uniqueList(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

export function inferMemoryEventType(input: MemoryEventInput): MemoryEventType {
  const text = collectSearchText(input);

  if (text.includes("decision") || text.includes("decided")) return "decision";
  if (text.includes("blocker") || text.includes("stuck") || text.includes("freeze") || text.includes("timeout")) return "blocker";
  if (text.includes("build passed") || text.includes("build failed") || text.includes("npm run build")) return "build_result";
  if (text.includes("phase")) return "phase_progress";
  if (text.includes("preference") || text.includes("user wants") || text.includes("workflow")) return "user_preference";
  if (text.includes("architecture") || text.includes("orchestrator") || text.includes("agent")) return "architecture";
  if (text.includes("bug") || text.includes("debug") || text.includes("error")) return "debugging";
  if (text.includes("memory") || text.includes("continuity") || text.includes("resume")) return "continuity";

  return "general";
}

export function extractRelatedFiles(input: MemoryEventInput): string[] {
  const text = collectSearchText(input);
  const files: string[] = [];

  const knownFiles = [
    "App.tsx",
    "background-cognition.ts",
    "memory-events.ts",
    "ollama-adapter.ts",
    "task-feedback-log.txt",
    "package.json"
  ];

  for (const file of knownFiles) {
    if (text.includes(file.toLowerCase())) {
      files.push(file);
    }
  }

  return uniqueList(files);
}

export function extractRelatedCommands(input: MemoryEventInput): string[] {
  const text = collectSearchText(input);
  const commands: string[] = [];

  const knownCommands = [
    "npm run build",
    "npm run dev",
    "git diff",
    "powershell",
    "ollama serve"
  ];

  for (const command of knownCommands) {
    if (text.includes(command.toLowerCase())) {
      commands.push(command);
    }
  }

  return uniqueList(commands);
}

export function inferEmotionalWeight(input: MemoryEventInput): MemoryEvent["emotional_weight"] {
  const text = collectSearchText(input);
  const importance = typeof input.importanceScore === "number" ? input.importanceScore : 0;

  if (
    importance >= 70 ||
    text.includes("frustrating") ||
    text.includes("frustrated") ||
    text.includes("urgent") ||
    text.includes("broken") ||
    text.includes("trust")
  ) {
    return "high";
  }

  if (importance <= 25) {
    return "low";
  }

  return "normal";
}

export function shouldPersistMemoryEvent(event: MemoryEvent): boolean {
  if (event.importance_score >= 45) return true;
  if (event.type !== "general") return true;
  if (event.scent_tags.length > 0) return true;
  if (event.related_files.length > 0) return true;
  if (event.related_commands.length > 0) return true;

  return false;
}

export function createMemoryEvent(input: MemoryEventInput, createdAt = new Date().toISOString()): MemoryEvent {
  const workspaceId = slugifyIdPart(input.workspaceId || input.workspaceName, "workspace");
  const threadId = slugifyIdPart(input.threadId || input.threadTitle, "thread");
  const type = inferMemoryEventType(input);
  const summarySource = input.latestUserIntent || input.latestPolarisResult || input.continuitySummary || input.nextAction;
  const summary = compactText(summarySource, 260);
  const importanceScore = Math.max(0, Math.min(100, Math.round(input.importanceScore ?? 25)));
  const confidence = input.confidence || "fresh";
  const scentTags = uniqueList(input.scentTags || []).slice(0, 12);
  const retrievalPhrases = uniqueList(input.retrievalPhrases || []).slice(0, 12);
  const digitalScentTrace = compactText(input.digitalScentTrace, 500);
  const nextAction = compactText(input.nextAction, 260);
  const sourceMessageIds = uniqueList(input.sourceMessageIds || []).slice(0, 20);
  const relatedFiles = extractRelatedFiles(input);
  const relatedCommands = extractRelatedCommands(input);
  const emotionalWeight = inferEmotionalWeight({
    ...input,
    importanceScore
  });

  const idSeed = [
    workspaceId,
    threadId,
    type,
    summary,
    digitalScentTrace,
    retrievalPhrases.join("|"),
    createdAt.slice(0, 19)
  ].join("|");

  return {
    id: `mem_${createdAt.replace(/[^0-9]/g, "").slice(0, 14)}_${stableHash(idSeed)}`,
    workspace_id: workspaceId,
    thread_id: threadId,
    created_at: createdAt,
    type,
    summary,
    importance_score: importanceScore,
    confidence,
    source_message_ids: sourceMessageIds,
    related_files: relatedFiles,
    related_commands: relatedCommands,
    scent_tags: scentTags,
    emotional_weight: emotionalWeight,
    digital_scent_trace: digitalScentTrace,
    retrieval_phrases: retrievalPhrases,
    next_action: nextAction
  };
}

export function serializeMemoryEventForMarkdown(event: MemoryEvent): string {
  return [
    "### Memory Event",
    `- ID: ${event.id}`,
    `- Type: ${event.type}`,
    `- Created: ${event.created_at}`,
    `- Workspace: ${event.workspace_id}`,
    `- Thread: ${event.thread_id}`,
    `- Summary: ${event.summary}`,
    `- Importance: ${event.importance_score}/100`,
    `- Confidence: ${event.confidence}`,
    `- Emotional weight: ${event.emotional_weight}`,
    `- Related files: ${event.related_files.length > 0 ? event.related_files.join(", ") : "none"}`,
    `- Related commands: ${event.related_commands.length > 0 ? event.related_commands.join(", ") : "none"}`,
    `- Scent tags: ${event.scent_tags.length > 0 ? event.scent_tags.join(", ") : "none"}`,
    `- Retrieval trace: ${event.digital_scent_trace}`,
    `- Retrieval phrases: ${event.retrieval_phrases.length > 0 ? event.retrieval_phrases.join(", ") : "none"}`,
    `- Next action: ${event.next_action}`
  ].join("\n");
}
