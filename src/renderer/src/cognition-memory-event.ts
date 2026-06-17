import {
  runBackgroundCognition,
  type BackgroundCognitionInput,
  type BackgroundCognitionResult,
} from "./background-cognition";
import {
  createMemoryEvent,
  shouldPersistMemoryEvent,
  serializeMemoryEventForMarkdown,
  type MemoryEvent,
} from "./memory-events";

export type CognitionMemoryEventInput = BackgroundCognitionInput & {
  workspaceId?: string;
  threadId?: string;
  sourceMessageIds?: string[];
};

export type CognitionMemoryEventResult = {
  cognition: BackgroundCognitionResult;
  event: MemoryEvent;
  shouldPersist: boolean;
  markdown: string;
};

function normalizeText(value: unknown, fallback = "UNKNOWN"): string {
  if (typeof value !== "string") return fallback;

  const compacted = value.replace(/\s+/g, " ").trim();

  return compacted.length > 0 ? compacted : fallback;
}

function resolveWorkspaceName(input: CognitionMemoryEventInput): string {
  return normalizeText(
    input.workspaceName ||
      input.projectName ||
      input.workspace ||
      input.activeWorkspace,
    "workspace"
  );
}

function resolveThreadTitle(input: CognitionMemoryEventInput): string {
  return normalizeText(
    input.threadTitle ||
      input.activeThread ||
      input.thread ||
      input.currentThread,
    "thread"
  );
}

function resolveLatestUserIntent(input: CognitionMemoryEventInput): string {
  return normalizeText(input.latestUserIntent, "UNKNOWN");
}

function resolveLatestPolarisResult(input: CognitionMemoryEventInput): string {
  return normalizeText(input.latestPolarisResult, "UNKNOWN");
}

export function buildCognitionMemoryEvent(
  input: CognitionMemoryEventInput,
  createdAt = new Date().toISOString()
): CognitionMemoryEventResult {
  const cognition = runBackgroundCognition(input);

  const event = createMemoryEvent(
    {
      workspaceId: input.workspaceId || resolveWorkspaceName(input),
      workspaceName: resolveWorkspaceName(input),
      threadId: input.threadId || resolveThreadTitle(input),
      threadTitle: resolveThreadTitle(input),
      sourceMessageIds: input.sourceMessageIds || [],
      latestUserIntent: resolveLatestUserIntent(input),
      latestPolarisResult: resolveLatestPolarisResult(input),
      continuitySummary: input.continuitySummary,
      importanceScore: cognition.memoryImportance,
      confidence: cognition.confidence,
      scentTags: cognition.scentTags,
      digitalScentTrace: cognition.digitalScentTrace,
      retrievalPhrases: cognition.retrievalPhrases,
      nextAction: cognition.nextAction,
    },
    createdAt
  );

  const shouldPersist = shouldPersistMemoryEvent(event);
  const markdown = serializeMemoryEventForMarkdown(event);

  return {
    cognition,
    event,
    shouldPersist,
    markdown,
  };
}

export function buildCognitionMemoryEventMarkdown(
  input: CognitionMemoryEventInput,
  createdAt = new Date().toISOString()
): string {
  return buildCognitionMemoryEvent(input, createdAt).markdown;
}

export function shouldPersistCognitionMemoryEvent(
  input: CognitionMemoryEventInput,
  createdAt = new Date().toISOString()
): boolean {
  return buildCognitionMemoryEvent(input, createdAt).shouldPersist;
}
