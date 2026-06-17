import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { runBackgroundCognition } from "./background-cognition";
import { buildCognitionMemoryEvent } from "./cognition-memory-event";
import { buildPolarisMemoryRecallContext } from "./polaris-memory-recall";
import { buildPolarisStreamEnvelope } from "./polaris-stream-envelope";
import type {
  AppState,
  AssistantProfile,
  AssistantProfileUpdate,
  AutosaveStatus,
  ContinuityImportApplyResult,
  EmbeddedLocalLlmStatus,
  EmbeddedAiConsumerStatus,
  ImportPreview,
  LocalAiStatus,
  Message,
  ProviderConfig,
  SnapshotRecord,
  StreamDeltaEvent,
  StreamDoneEvent,
  StreamErrorEvent,
  Thread,
  ThreadActionResult,
  TimelineGroup,
  UniversalContextPackResult,
  Workspace,
  WorkspaceHealthReport,
  ContinuityInspectorReport,
} from "@shared/types";
import { ImportPreviewModal } from "./components/ImportPreviewModal";
import { ChatPanel } from "./components/ChatPanel";
import { OpsSidebar, type OpsFocusTarget, type OpsTabId } from "./components/OpsSidebar";
import { RecoveryBanner } from "./components/RecoveryBanner";
import { ThreadSidebar } from "./components/ThreadSidebar";
import { AppFooter } from "./components/AppFooter";
const DiagnosticsPanel = lazy(() =>
  import("./components/DiagnosticsPanel").then((m) => ({ default: m.DiagnosticsPanel })),
);
import { WorkspaceHeader } from "./components/WorkspaceHeader";
import { EncryptedImportFlow } from "./components/EncryptedImportFlow";
import { EncryptedExportDialog } from "./components/EncryptedExportDialog";
import {
  buildManualFallbackState,
  type ManualFallbackState,
} from "./manual-fallback";
import {
  resolveGuidanceCard,
  transitionGuidanceState,
  type GuidanceCard,
  type GuidanceActionId,
  type GuidanceState,
} from "./guided-routines";
import {
  createChatWorkflowSession,
  getContextPackRequestHint,
  routeChatIntent,
  type ActiveChatWorkflow,
  type ChatWorkflowSession,
} from "./chat-workflows";
import { buildChatFailureCard, buildConversationalShellCard } from "./conversational-shell";
import {
  buildProjectMemorySnapshot,
  buildResumeCard,
  shouldSuggestMemoryUpdate,
} from "./project-memory";
import { ProjectMemoryDashboard } from "./components/ProjectMemoryDashboard";
import { MemoryUpdateSuggestion } from "./components/MemoryUpdateSuggestion";
const ContinuityInspectorModal = lazy(() =>
  import("./components/ContinuityInspectorModal").then((m) => ({
    default: m.ContinuityInspectorModal,
  })),
);
import type { MemoryCompressionDraft } from "@shared/types";
import {
  chatSendAllowed,
  resolveProviderStatusPresentation,
  resolveRecoveryPresentation,
  resolveWorkspaceSubtitle,
} from "@shared/startup-flow";
import { AI_SAVED_NOT_READY_MESSAGE, AI_STATUS_PREPARING_CONSUMER, AI_STATUS_READY_CONSUMER, EMBEDDED_AI_PREPARING_BANNER, EMBEDDED_AI_CHAT_PLACEHOLDER } from "@shared/consumer-experience-copy";
import { resolveConsumerStatusMessage } from "@shared/consumer-status-message";
import { buildOllamaPreparationChecklist } from "@shared/ollama-preparation-checklist";
import { resolveProvisioningReadiness } from "@shared/provisioning-readiness";
import { freshOnboardingState } from "@shared/first-time-user-experience";
import { AI_TRY_AGAIN_ACTION, AI_USE_CLOUD_ACTION, AI_CONTINUE_WITHOUT_ACTION } from "@shared/ai-readiness";
import { ConnectAiModal } from "./components/ConnectAiModal";
import { AssistantPreparationScreen } from "./components/AssistantPreparationScreen";
import { resolveSendWhenProviderOffline } from "@shared/ux-send-flow";
import {
  resolveUnifiedAssistantStatus,
} from "@shared/assistant-preparation-service";
import {
  completeOnboardingWithProvider,
  loadOnboardingState,
  markAssistantPreparationCompleted,
  saveWizardProgress,
  shouldShowFirstRunWelcome,
  syncProviderConfiguredFlag,
  type OnboardingState,
} from "@shared/onboarding-state";
import { OnboardingWizard } from "./components/OnboardingWizard";
import { TransferStatusBanner } from "./components/TransferStatusBanner";
import { RecoveryDetailsModal } from "./components/RecoveryDetailsModal";
import {
  type OnboardingWizardStep,
} from "@shared/onboarding-wizard";
import {
  failTransfer,
  startTransfer,
  succeedTransfer,
  type TransferUxState,
} from "@shared/transfer-ux";

function PreloadBridgeFallback() {
  const isDev = import.meta.env.DEV;
  return (
    <div className="app-shell loading">
      <p>Continuity preload bridge did not initialize.</p>
      <p className="muted small">
        The Electron preload script did not load, so the UI cannot talk to the local database.
      </p>
      {isDev && (
        <p className="muted small">
          Dev check: confirm <code>out/preload/index.cjs</code> exists after{" "}
          <code>npm run dev</code> (not a stale <code>index.js</code> with{" "}
          <code>require is not defined</code>).
        </p>
      )}
    </div>
  );
}

export function App() {
  if (!window.continuity) {
    return <PreloadBridgeFallback />;
  }
  return <ContinuityApp continuity={window.continuity} />;
}

type ResumeCardState = {
  threadId: string;
  threadTitle: string;
  messageCount: number;
  lastUserMessage: string | null;
  lastAssistantMessage: string | null;
};

function truncateResumeText(value: string | null | undefined, max = 180): string | null {
  const text = value?.trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function buildResumeCardState(thread: Thread, messages: Message[], totalCount: number): ResumeCardState | null {
  if (messages.length === 0 && totalCount === 0) return null;

  const lastUserMessage =
    [...messages].reverse().find((message) => message.role === "user")?.content ?? null;
  const lastAssistantMessage =
    [...messages].reverse().find((message) => message.role === "assistant")?.content ?? null;

  return {
    threadId: thread.id,
    threadTitle: thread.title || "Current thread",
    messageCount: totalCount || messages.length,
    lastUserMessage: truncateResumeText(lastUserMessage),
    lastAssistantMessage: truncateResumeText(lastAssistantMessage),
  };
}
function isLocalResumeRequest(content: string): boolean {
  const normalized = content.trim().toLowerCase().replace(/[?.!]+$/g, "");
  return [
    "continue",
    "resume",
    "what next",
    "what's next",
    "whats next",
    "what should i do next",
    "where did we leave off",
    "where were we",
    "pick up where we left off",
  ].includes(normalized);
}

function buildLocalResumeResponse(input: {
  workspaceName?: string | null;
  continuitySummary?: string | null;
  thread: Thread;
  messages: Message[];
  totalCount: number;
}): string {
  const priorMessages = input.messages.filter((message) => message.content.trim().length > 0);
  const lastUserMessage =
    [...priorMessages].reverse().find((message) => message.role === "user")?.content ?? null;
  const lastAssistantMessage =
    [...priorMessages].reverse().find((message) => message.role === "assistant")?.content ?? null;

  const threadTitle = input.thread.title || "this thread";
  const workspaceName = input.workspaceName || "this workspace";

  const savedObjective = extractProjectStateValue(input.continuitySummary, "Current objective");
  const savedThread = extractProjectStateValue(input.continuitySummary, "Active thread");
  const savedLatestReply = extractProjectStateValue(input.continuitySummary, "Latest Polaris reply");
  const savedNextStep = extractProjectStateValue(input.continuitySummary, "Next step");

  const lastUser = truncateResumeText(lastUserMessage, 180);
  const lastAssistant = truncateResumeText(lastAssistantMessage, 220);

  const recallQuery = [
    savedNextStep,
    savedObjective,
    savedLatestReply,
    lastUser,
    lastAssistant,
    "where did we leave off",
  ]
    .filter(Boolean)
    .join(" ");

  const recall = buildPolarisMemoryRecallContext({
    query: recallQuery,
    continuitySummary: input.continuitySummary,
    limit: 2,
  });

  const contextLine = savedObjective
    ? `We were working on: ${savedObjective}`
    : savedLatestReply
      ? `We left off with: ${savedLatestReply}`
      : lastAssistant
        ? `We left off with: ${lastAssistant}`
        : lastUser
          ? `The last thing you asked was: ${lastUser}`
          : `You're in ${workspaceName}, working in "${threadTitle}".`;

  const threadLine = savedThread ? `Active thread: ${savedThread}` : null;
  const recallLine = recall.hasRecall
    ? `Memory recall: ${recall.matchedCount} related memory event${recall.matchedCount === 1 ? "" : "s"} found.`
    : null;
  const recallSignalLine =
    recall.topSignals.length > 0 ? `Recall signals: ${recall.topSignals.slice(0, 4).join(", ")}` : null;

  const nextLine =
    savedNextStep ||
    "Keep moving from the latest saved work in this thread. I'm ready for the next task.";

  return [
    "Sure - here's what's next.",
    "",
    contextLine,
    threadLine,
    recallLine,
    recallSignalLine,
    "",
    `Next step: ${nextLine}`,
  ]
    .filter((line) => line !== null)
    .join("\n");
}
function extractProjectStateValue(summary: string | null | undefined, label: string): string | null {
  const text = summary?.trim();
  if (!text) return null;

  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`^- ${escaped}:\\s*(.+)$`, "im"));
  const value = match?.[1]?.trim();
  return value && value.toUpperCase() !== "UNKNOWN" ? value : null;
}

function stripLatestLocalStateSection(summary: string | null | undefined): string {
  const text = summary?.trim();
  if (!text) return "";
  return text.replace(/\n{0,2}## Latest Local State[\s\S]*$/m, "").trim();
}

function isLocalResumeAssistantContent(content: string | null | undefined): boolean {
  const text = content?.trim().toLowerCase() ?? "";
  return (
    text.startsWith("sure � here's what's next") ||
    text.startsWith("sure - here's what's next")
  );
}

function isTrivialMemoryInput(content: string | null | undefined): boolean {
  const normalized = content?.trim().toLowerCase().replace(/[?.!]+$/g, "") ?? "";
  return [
    "",
    "ok",
    "okay",
    "thanks",
    "thank you",
    "yes",
    "no",
    "a",
    "continue",
    "resume",
    "what next",
    "what's next",
    "whats next",
    "where did we leave off",
    "where were we",
  ].includes(normalized);
}

function deriveNextStepFromText(input: {
  latestAssistant: string | null;
  latestUser: string | null;
}): string {
  const assistant = input.latestAssistant?.trim() ?? "";
  const user = input.latestUser?.trim() ?? "";

  const lines = assistant
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[-*]\s*/, ""))
    .filter(Boolean);

  const directNext = lines.find((line) =>
    /^(next|next step|run this|upload|test|report back)\s*:/i.test(line),
  );

  if (directNext) {
    return directNext.replace(/^(next|next step)\s*:\s*/i, "").trim();
  }

  const phaseLine = lines.find((line) =>
    /\b(phase \d+[a-z]?|next patch|next step|move to|we move to|run this|upload)\b/i.test(line),
  );

  if (phaseLine) {
    return phaseLine;
  }

  if (user && !isTrivialMemoryInput(user)) {
    return `Continue: ${truncateResumeText(user, 180)}`;
  }

  return "Continue from the latest saved project state.";
}
function getLatestCompletedAssistantMessage(messages: Message[]): Message | null {
  const latest = [...messages]
    .reverse()
    .find((message) => {
      const status = (message as Message & { messageStatus?: string }).messageStatus;
      return (
        message.role === "assistant" &&
        message.content.trim().length > 0 &&
        !isLocalResumeAssistantContent(message.content) &&
        (!status || status === "completed")
      );
    });

  return latest ?? null;
}

function mergeImportedProjectMemory(input: {
  existingSummary?: string | null;
  importedSummary: string;
  importedName?: string | null;
}): string {
  const existing = input.existingSummary?.trim() ?? "";
  const imported = input.importedSummary.trim();

  if (!existing) return imported.slice(0, 8000);
  if (!imported) return existing.slice(0, 8000);
  if (existing.includes(imported)) return existing.slice(0, 8000);

  const merged = [
    stripLatestLocalStateSection(existing),
    "## RESTORED_PROJECT_MEMORY",
    `Imported from: ${input.importedName?.trim() || "markdown restore"}`,
    imported,
  ]
    .filter(Boolean)
    .join("\n\n");

  return merged.slice(0, 8000);
}
function injectSavedProjectMemoryIntoMarkdown(input: {
  markdown: string;
  continuitySummary?: string | null;
}): string {
  const markdown = input.markdown.trim();
  const memory = input.continuitySummary?.trim();

  if (!markdown) return markdown;
  if (markdown.includes("## SAVED_PROJECT_MEMORY")) return markdown;
  if (!memory) return markdown;

  const lines = markdown.split(/\r?\n/);
  const title = lines.shift() ?? "# CONTINUITYOS_CONTEXT_PACK";

  return [
    title,
    "## SAVED_PROJECT_MEMORY",
    memory,
    lines.join("\n").trim(),
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 20000);
}
function extractSavedProjectMemoryFromMarkdown(markdown: string | null | undefined): string | null {
  const text = markdown?.trim() ?? "";
  if (!text) return null;

  const match = text.match(/(?:^|\n)##\s+SAVED_PROJECT_MEMORY\s*\n([\s\S]*?)(?=\n##\s+|$)/i);
  const value = match?.[1]?.trim();

  if (!value) return null;
  if (value.toLowerCase() === "no saved project memory yet.") return null;

  return value.slice(0, 8000);
}
type DurableStructuredMemoryEventRecord = {
  id: string;
  workspaceId: string;
  createdAt: string;
  markdown: string;
  parsed: Record<string, unknown>;
};

function extractStructuredMemoryEventMarkdownBlocks(summary: string): string[] {
  const text = summary.trim();
  if (!text) return [];

  const blocks = [
    ...text.matchAll(/(?:^|\n)## Structured Memory Event\n([\s\S]*?)(?=\n## Structured Memory Event\n|\n## Latest Local State\n|\n## Internal Continuity Snapshot\n|\n## RESTORED_PROJECT_MEMORY\n|$)/g),
  ];

  return blocks
    .map((match) => ["## Structured Memory Event", match[1]?.trim() ?? ""].join("\n").trim())
    .filter((block) => block.length > 0);
}

function buildDurableStructuredMemoryEventSummary(
  records: DurableStructuredMemoryEventRecord[] | null | undefined,
): string | null {
  const seen = new Set<string>();
  const blocks: string[] = [];

  for (const record of records ?? []) {
    const markdown = record?.markdown?.trim();
    if (!markdown) continue;
    if (seen.has(markdown)) continue;
    seen.add(markdown);
    blocks.push(markdown);
    if (blocks.length >= 10) break;
  }

  return blocks.length > 0 ? blocks.join("\n\n") : null;
}

function mergeDurableStructuredMemoryIntoSummary(input: {
  continuitySummary?: string | null;
  durableMemoryEventSummary?: string | null;
}): string | null {
  const base = input.continuitySummary?.trim() ?? "";
  const durable = input.durableMemoryEventSummary?.trim() ?? "";

  if (!base && !durable) return null;
  if (!durable) return base;
  if (!base) return durable.slice(0, 12000);

  const existingBlocks = new Set(extractStructuredMemoryEventMarkdownBlocks(base));
  const durableBlocks = extractStructuredMemoryEventMarkdownBlocks(durable).filter(
    (block) => !existingBlocks.has(block),
  );

  if (durableBlocks.length === 0) return base;

  return [base, ...durableBlocks].join("\n\n").slice(0, 12000);
}
function resolveMemoryRuntimeLabel(input: {
  status: "loading" | "ready" | "empty";
  continuitySummary?: string | null;
  messageCount: number;
}): string {
  if (input.status === "loading") return "Memory loading";
  if (input.status === "ready") return "Memory ready";
  if (input.continuitySummary?.trim()) return "Memory ready";
  if (input.messageCount > 0) return "Memory ready";
  return "No memory yet";
}
function buildImmediateUserIntentMemorySummary(input: {
  workspaceName?: string | null;
  thread: Thread;
  userMessage: Message;
  existingSummary?: string | null;
  totalCount: number;
}): string | null {
  if (isTrivialMemoryInput(input.userMessage.content)) return null;

  const workspaceName = input.workspaceName || "this workspace";
  const threadTitle = input.thread.title || "this thread";
  const userShort = truncateResumeText(input.userMessage.content, 320) ?? "UNKNOWN";
  if (userShort === "UNKNOWN") return null;

  const existingBase = stripStructuredMemoryEventSections(
    stripLatestLocalStateSection(input.existingSummary)
  );

  const existingObjective =
    extractProjectStateValue(input.existingSummary, "Current objective") ||
    extractProjectStateValue(input.existingSummary, "Objective") ||
    `Continue work in ${workspaceName}, thread "${threadTitle}".`;

  const latestLocalState = [
    "## Latest Local State",
    `- Current objective: ${existingObjective}`,
    `- Active thread: ${threadTitle}`,
    `- Saved message count: ${input.totalCount}`,
    `- Latest user request: ${userShort}`,
    "- Latest Polaris reply: UNKNOWN",
    `- Next step: Continue: ${userShort}`,
  ].join("\n");

  const {
    backgroundCognitionSnapshot,
    structuredMemoryEventMarkdown: memoryEventMarkdown,
  } = runBackgroundAgentOrchestrator({
    workspaceName,
    threadTitle,
    latestUserIntent: userShort,
    latestPolarisResult: "UNKNOWN",
    continuitySummary: input.existingSummary,
    sourceMessageIds: [input.userMessage.id],
  });

  const existingWithoutBackgroundCognition =
    stripBackgroundCognitionSnapshotSection(existingBase);

  return [
    existingWithoutBackgroundCognition,
    latestLocalState,
    backgroundCognitionSnapshot,
    memoryEventMarkdown,
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 12000);
}
function runBackgroundAgentOrchestrator(input: {
  workspaceName?: string | null;
  threadTitle?: string | null;
  latestUserIntent?: string | null;
  latestPolarisResult?: string | null;
  latestUser?: string | null;
  latestAssistant?: string | null;
  messageCount?: number;
  continuitySummary?: string | null;
  sourceMessageIds?: string[];
}): {
  backgroundCognitionSnapshot: string;
  structuredMemoryEventMarkdown: string | null;
} {
  const latestUser = input.latestUser ?? input.latestUserIntent ?? null;
  const latestAssistant = input.latestAssistant ?? input.latestPolarisResult ?? null;

  const backgroundCognitionSnapshot = buildBackgroundCognitionSnapshot({
    workspaceName: input.workspaceName,
    threadTitle: input.threadTitle,
    latestUser,
    latestAssistant,
    latestUserIntent: input.latestUserIntent,
    latestPolarisResult: input.latestPolarisResult,
    messageCount: input.messageCount ?? 0,
    continuitySummary: input.continuitySummary,
    sourceMessageIds: input.sourceMessageIds,
  });

  const structuredMemoryEventMarkdown = buildProjectMemoryEventMarkdown({
    workspaceName: input.workspaceName,
    threadTitle: input.threadTitle,
    latestUserIntent: latestUser,
    latestPolarisResult: latestAssistant,
    continuitySummary: input.continuitySummary,
    sourceMessageIds: input.sourceMessageIds,
  });

  return {
    backgroundCognitionSnapshot,
    structuredMemoryEventMarkdown,
  };
}

function buildProjectMemoryEventMarkdown(input: {
  workspaceName?: string | null;
  threadTitle?: string | null;
  latestUserIntent?: string | null;
  latestPolarisResult?: string | null;
  continuitySummary?: string | null;
  sourceMessageIds?: string[];
}): string | null {
  const result = buildCognitionMemoryEvent({
    workspaceName: input.workspaceName ?? undefined,
    threadTitle: input.threadTitle ?? undefined,
    latestUserIntent: input.latestUserIntent ?? undefined,
    latestPolarisResult: input.latestPolarisResult ?? undefined,
    continuitySummary: input.continuitySummary ?? undefined,
    sourceMessageIds: input.sourceMessageIds ?? [],
  });

  if (!result.shouldPersist) return null;

  return ["## Structured Memory Event", result.markdown].join("\n\n");
}

function stripStructuredMemoryEventSections(summary: string | null | undefined): string {
  const text = summary?.trim() ?? "";
  if (!text) return "";

  return text
    .replace(/\n*## Structured Memory Event\n[\s\S]*?(?=\n## |$)/g, "")
    .trim();
}
function stripBackgroundCognitionSnapshotSection(summary: string | null | undefined): string {
  const text = summary?.trim() ?? "";
  if (!text) return "";

  return text
    .replace(/\n*## Internal Continuity Snapshot\n[\s\S]*?(?=\n## |$)/g, "")
    .replace(/\n*## Internal Memory Snapshot\n[\s\S]*?(?=\n## |$)/g, "")
    .trim();
}

function compactCognitionText(value: string | null | undefined, max = 500): string {
  const text = value?.trim() ?? "";
  if (!text) return "UNKNOWN";
  return text.length > max ? text.slice(0, max).trimEnd() + "..." : text;
}

function extractDigitalScentTags(input: {
  workspaceName?: string | null;
  threadTitle?: string | null;
  latestUser?: string | null;
  latestAssistant?: string | null;
  continuitySummary?: string | null;
}): string[] {
  const combined = [
    input.workspaceName,
    input.threadTitle,
    input.latestUser,
    input.latestAssistant,
    input.continuitySummary,
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();

  const tags = new Set<string>();

  const addIf = (condition: boolean, tag: string) => {
    if (condition) tags.add(tag);
  };

  addIf(/ollama|local model|llama|mistral|qwen/.test(combined), "local-ai");
  addIf(/freeze|froze|stuck|timeout|slow|hang/.test(combined), "runtime-freeze");
  addIf(/build|npm run build|vite|typescript|tsx|error/.test(combined), "build-debugging");
  addIf(/memory|remember|context|continuity|resume|save point|handoff/.test(combined), "continuity-memory");
  addIf(/agent|agents|architecture|brain|scent|smell/.test(combined), "agent-architecture");
  addIf(/powershell|terminal|log|task-feedback-log/.test(combined), "developer-workflow");
  addIf(/app\.tsx|ollama-adapter|electron|renderer|preload/.test(combined), "codebase-context");
  addIf(/user only chats with polaris|only chat with polaris|background/.test(combined), "single-polari-interface");
  addIf(/frustrat|annoy|bug|trust|reliable|reliability/.test(combined), "trust-signal");

  const fileMatches = combined.match(/[a-z0-9_-]+\.(tsx|ts|js|jsx|json|md|css)/g) ?? [];
  for (const fileName of fileMatches.slice(0, 6)) {
    tags.add(`file:${fileName}`);
  }

  return Array.from(tags).slice(0, 14);
}


function readCognitionString(input: unknown, keys: string[], fallback = "unknown"): string {
  if (!input || typeof input !== "object") return fallback;

  const record = input as Record<string, unknown>;

  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string" && value.trim().length > 0) {
      return compactCognitionText(value, 120);
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return fallback;
}

function collectCognitionSearchText(input: unknown): string {
  if (!input || typeof input !== "object") return "";

  const values = Object.values(input as Record<string, unknown>)
    .flatMap((value) => {
      if (typeof value === "string") return [value];
      if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
      return [];
    })
    .join(" ");

  return values.toLowerCase();
}

function pickDigitalScentMatches(text: string, patterns: Array<[string, string[]]>, fallback: string): string {
  const matches = patterns
    .filter(([, needles]) => needles.some((needle) => text.includes(needle)))
    .map(([label]) => label);

  return matches.length > 0 ? matches.slice(0, 5).join(", ") : fallback;
}

function buildDigitalScentTrace(input: unknown, scentTags: string[]): string {
  const searchText = collectCognitionSearchText(input);

  const place = readCognitionString(input, ["workspace", "workspaceName", "projectName", "activeWorkspace"]);
  const thread = readCognitionString(input, ["activeThread", "threadTitle", "thread", "currentThread"]);

  const files = pickDigitalScentMatches(
    searchText,
    [
      ["App.tsx", ["app.tsx"]],
      ["ollama-adapter.ts", ["ollama-adapter.ts", "ollama adapter"]],
      ["task-feedback-log.txt", ["task-feedback-log", "feedback log"]],
      ["continuity markdown", ["continuity file", "markdown export", "project state"]]
    ],
    "not detected"
  );

  const tools = pickDigitalScentMatches(
    searchText,
    [
      ["PowerShell", ["powershell", "pwsh"]],
      ["npm run build", ["npm run build", "build check"]],
      ["Ollama", ["ollama", "llama3", "qwen", "mistral"]],
      ["Electron", ["electron"]],
      ["Vite", ["vite"]]
    ],
    "not detected"
  );

  const symptoms = pickDigitalScentMatches(
    searchText,
    [
      ["freeze", ["freeze", "frozen", "stuck", "streaming"]],
      ["timeout", ["timeout", "timed out"]],
      ["build error", ["build error", "failed to compile", "tsc"]],
      ["memory gap", ["lost context", "memory", "resume", "continue"]]
    ],
    "not detected"
  );

  const emotionalWeight = pickDigitalScentMatches(
    searchText,
    [
      ["frustration", ["frustrating", "frustrated", "annoying", "not clear"]],
      ["urgency", ["urgent", "must", "need", "blocker"]],
      ["trust risk", ["wrong", "failed", "broken", "does not work"]]
    ],
    "normal"
  );

  const tags = scentTags.length > 0 ? scentTags.slice(0, 8).join(", ") : "none";

  return `place: ${place} | thread: ${thread} | files: ${files} | tools/commands: ${tools} | symptoms: ${symptoms} | emotional weight: ${emotionalWeight} | tags: ${tags}`;
}

function buildDigitalScentRetrievalPhrases(input: unknown, scentTags: string[]): string {
  const searchText = collectCognitionSearchText(input);
  const phrases = new Set<string>();

  if (searchText.includes("freeze") || searchText.includes("streaming") || searchText.includes("timeout")) {
    phrases.add("the freeze issue");
    phrases.add("the streaming bug");
  }

  if (searchText.includes("build") || searchText.includes("task-feedback-log")) {
    phrases.add("the build bug");
    phrases.add("the latest build log");
  }

  if (searchText.includes("memory") || searchText.includes("continuity") || searchText.includes("resume")) {
    phrases.add("the memory work");
    phrases.add("the continuity state");
  }

  if (searchText.includes("scent") || scentTags.includes("digital-scent")) {
    phrases.add("the memory retrieval idea");
    phrases.add("the retrieval phase");
  }

  if (searchText.includes("ollama")) {
    phrases.add("the Ollama path");
  }

  if (phrases.size === 0) {
    phrases.add("the current phase");
    phrases.add("the latest Polaris work");
  }

  return Array.from(phrases).slice(0, 6).join(", ");
}

function resolveMemoryImportanceScore(input: {
  latestUser?: string | null;
  latestAssistant?: string | null;
  scentTags: string[];
}): number {
  const combined = [input.latestUser, input.latestAssistant].filter(Boolean).join("\n").toLowerCase();

  let score = 35;

  if (/decision|we need|must|important|architecture|phase|next step/.test(combined)) score += 20;
  if (/freeze|froze|failed|error|bug|timeout|stuck/.test(combined)) score += 20;
  if (/remember|memory|context|continuity|agent|polaris/.test(combined)) score += 15;
  if (/a$|ok$|thanks$|hi$|hello$/.test(combined.trim())) score -= 20;

  score += Math.min(20, input.scentTags.length * 2);

  return Math.max(0, Math.min(100, score));
}

function resolveMemoryConfidenceLabel(input: {
  latestUser?: string | null;
  latestAssistant?: string | null;
  continuitySummary?: string | null;
}): string {
  const hasUser = Boolean(input.latestUser?.trim());
  const hasAssistant = Boolean(input.latestAssistant?.trim());
  const hasMemory = Boolean(input.continuitySummary?.trim());

  if (hasUser && hasAssistant && hasMemory) return "confirmed";
  if (hasUser && hasMemory) return "likely";
  if (hasUser) return "fresh";
  return "unknown";
}

function buildBackgroundCognitionSnapshot(input: {
  workspaceName?: string | null;
  threadTitle?: string | null;
  latestUser?: string | null;
  latestAssistant?: string | null;
  latestUserIntent?: string | null;
  latestPolarisResult?: string | null;
  messageCount?: number;
  continuitySummary?: string | null;
  sourceMessageIds?: string[];
}): string {
  const normalizedInput = {
    ...input,
    latestUser: input.latestUser ?? input.latestUserIntent ?? null,
    latestAssistant: input.latestAssistant ?? input.latestPolarisResult ?? null,
  };

  const scentTags = extractDigitalScentTags(normalizedInput);
  const scentTrace = buildDigitalScentTrace(normalizedInput, scentTags);
  const retrievalPhrases = buildDigitalScentRetrievalPhrases(normalizedInput, scentTags);
  const retrievalPhraseText = Array.isArray(retrievalPhrases)
    ? retrievalPhrases.join(", ")
    : retrievalPhrases;

  const importanceScore = resolveMemoryImportanceScore({
    latestUser: normalizedInput.latestUser,
    latestAssistant: normalizedInput.latestAssistant,
    scentTags,
  });

  const confidence = resolveMemoryConfidenceLabel(input);
  const latestUser = compactCognitionText(normalizedInput.latestUser, 500);
  const latestAssistant = compactCognitionText(normalizedInput.latestAssistant, 650);

  const nextAction =
    latestUser === "UNKNOWN"
      ? "Ask the user what they want to work on next."
      : latestAssistant !== "UNKNOWN"
        ? "Continue from the latest saved intent and Polaris result."
        : "Respond to the latest saved user intent.";

  return [
    "## Internal Continuity Snapshot",
    "- Visibility: hidden from normal chat UI",
    "- Rule: the user only chats with Polaris; all agents run silently in the background.",
    "",
    "### Memory Context",
    `- Workspace: ${compactCognitionText(input.workspaceName, 160)}`,
    `- Active thread: ${compactCognitionText(input.threadTitle, 160)}`,
    `- Saved message count: ${input.messageCount ?? 0}`,
    `- Latest user intent: ${latestUser}`,
    `- Latest Polaris result: ${latestAssistant}`,
    "",
    "### Retrieval Context",
    "- Purpose: store contextual retrieval cues, not just exact words.",
    "- Retrieval rule: use project cues and associations to reconnect prior work.",
    `- Retrieval tags: ${scentTags.length > 0 ? scentTags.join(", ") : "UNKNOWN"}`,
    `- Retrieval trace: ${scentTrace || "UNKNOWN"}`,
    `- Retrieval phrases: ${retrievalPhraseText || "UNKNOWN"}`,
    "",
    "### Priority Context",
    `- Importance score: ${importanceScore}/100`,
    "- Priority rule: decisions, blockers, freezes, architecture, and user workflow preferences are high priority.",
    "",
    "### Confidence Context",
    `- Confidence: ${confidence}`,
    "- Trust rule: mark weak memory as unknown instead of inventing missing facts.",
    "",
    "### Planning Context",
    `- Next action: ${nextAction}`,
  ].join("\n");
}
function buildProjectStateMemorySummary(input: {
  workspaceName?: string | null;
  thread: Thread;
  messages: Message[];
  totalCount: number;
  existingSummary?: string | null;
}): string | null {
  const latestAssistant = getLatestCompletedAssistantMessage(input.messages);

  const priorMessages = input.messages.filter((message) => message.content.trim().length > 0);
  const latestUser =
    [...priorMessages]
      .reverse()
      .find((message) => message.role === "user" && !isTrivialMemoryInput(message.content))
      ?.content ?? null;

  if (!latestAssistant && !latestUser) return null;

  const workspaceName = input.workspaceName || "this workspace";
  const threadTitle = input.thread.title || "this thread";
  const messageCount = input.totalCount || input.messages.length;

  const latestUserShort = truncateResumeText(latestUser, 260) ?? "UNKNOWN";
  const latestAssistantShort = truncateResumeText(latestAssistant?.content, 320) ?? "UNKNOWN";

  const existingBase = stripStructuredMemoryEventSections(stripLatestLocalStateSection(input.existingSummary));
  const existingObjective =
    extractProjectStateValue(input.existingSummary, "Current objective") ||
    extractProjectStateValue(input.existingSummary, "Objective");

  const currentObjective =
    existingObjective ||
    `Continue work in ${workspaceName}, thread "${threadTitle}".`;

  const nextStep = deriveNextStepFromText({
    latestAssistant: latestAssistant?.content ?? null,
    latestUser,
  });

  const latestLocalState = [
    "## Latest Local State",
    `- Current objective: ${currentObjective}`,
    `- Active thread: ${threadTitle}`,
    `- Saved message count: ${messageCount}`,
    `- Latest user request: ${latestUserShort}`,
    `- Latest Polaris reply: ${latestAssistantShort}`,
    `- Next step: ${nextStep}`,
  ].join("\n");

  const {
    backgroundCognitionSnapshot,
    structuredMemoryEventMarkdown: projectMemoryEventMarkdown,
  } = runBackgroundAgentOrchestrator({
    workspaceName,
    threadTitle,
    latestUser: latestUserShort,
    latestAssistant: latestAssistantShort,
    latestUserIntent: latestUserShort,
    latestPolarisResult: latestAssistantShort,
    messageCount,
    continuitySummary: input.existingSummary,
    sourceMessageIds: [
      ...(latestAssistant?.id ? [latestAssistant.id] : []),
    ],
  });

  return [existingBase, latestLocalState, backgroundCognitionSnapshot, projectMemoryEventMarkdown]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 12000);
}
function isLocalGreetingRequest(content: string): boolean {
  const normalized = content.trim().toLowerCase().replace(/[?.!]+$/g, "");
  return [
    "hi",
    "hello",
    "hey",
    "yo",
    "sup",
    "good morning",
    "good afternoon",
    "good evening",
  ].includes(normalized);
}

function buildLocalGreetingResponse(input: {
  workspaceName?: string | null;
  memoryReady: boolean;
}): string {
  const workspaceLine = input.workspaceName?.trim()
    ? `Workspace: ${input.workspaceName.trim()}`
    : "Workspace loaded.";

  const memoryLine = input.memoryReady
    ? "Memory is ready."
    : "Memory is available once this workspace has saved context.";

  return [
    "Hi - I'm ready.",
    "",
    workspaceLine,
    memoryLine,
    "",
    "Ask me what to do next, paste a build log, or tell me what you want to work on.",
  ].join("\n");
}

function isVagueImplementationRequest(content: string): boolean {
  const text = content.trim();
  const normalized = text.toLowerCase();

  const asksToFix =
    /\b(fix|debug|solve|repair|patch)\b/.test(normalized) &&
    /\b(latest|last|current|bug|error|build log|log|failed|failure)\b/.test(normalized);

  const hasSpecificEvidence =
    /\b(error:|exception|traceback|typeerror|referenceerror|syntaxerror|vite:esbuild|npm err|line \d+|tsx:\d+|ts:\d+)\b/i.test(text) ||
    /\.(tsx|ts|js|jsx|json|md)\b/i.test(text) ||
    text.length > 220;

  return asksToFix && !hasSpecificEvidence;
}

function buildLocalImplementationClarificationResponse(): string {
  return [
    "I can fix it, but I need the actual build log first.",
    "",
    "The request says there is a latest build bug, but the error text is not included. To avoid guessing or freezing the local model, run this and upload the log:",
    "",
    "```powershell",
    "cd C:\\Users\\ronye\\continuity-os-desktop",
    "$out = 'task-feedback-log.txt'",
    "'===== BUILD CHECK =====' | Out-File $out -Encoding utf8",
    "npm run build 2>&1 | Out-File $out -Append -Encoding utf8",
    "Write-Host 'Created task-feedback-log.txt' -ForegroundColor Green",
    "```",
    "",
    "Next step: upload `task-feedback-log.txt`, and I will give the exact patch.",
  ].join("\n");
}
function ContinuityApp({ continuity }: { continuity: NonNullable<typeof window.continuity> }) {

  const [appState, setAppState] = useState<AppState | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThread, setActiveThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [resumeCard, setResumeCard] = useState<ResumeCardState | null>(null);
  const [messageTotalCount, setMessageTotalCount] = useState(0);
  const [hasMoreOlderMessages, setHasMoreOlderMessages] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [oldestMessageCursor, setOldestMessageCursor] = useState<{
    createdAt: string;
    id: string;
  } | null>(null);
  const [workspaceHealth, setWorkspaceHealth] = useState<WorkspaceHealthReport | null>(
    null,
  );
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [timelineGroups, setTimelineGroups] = useState<TimelineGroup[]>([]);
  const [snapshots, setSnapshots] = useState<SnapshotRecord[]>([]);
  const [providerConfig, setProviderConfig] = useState<ProviderConfig | null>(null);
  const [opsTab, setOpsTab] = useState<OpsTabId>("backups");
  const [showProjectTools, setShowProjectTools] = useState(false);
  const [connectAiModalOpen, setConnectAiModalOpen] = useState(false);
  const [showArchivedThreads, setShowArchivedThreads] = useState(false);
  const [showDeletedThreads, setShowDeletedThreads] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [loading, setLoading] = useState(true);
  const [startupPhase, setStartupPhase] = useState<
    "starting" | "migrating" | "loading" | "ready"
  >("starting");
  const [threadSwitching, setThreadSwitching] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [manualFallback, setManualFallback] = useState<ManualFallbackState | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importJson, setImportJson] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [showEncryptedExport, setShowEncryptedExport] = useState(false);
  const [encryptedImport, setEncryptedImport] = useState<{
    json: string;
    fileName: string;
  } | null>(null);
  const [guidanceState, setGuidanceState] = useState<GuidanceState>("welcome");
  const [guidanceImportedSource, setGuidanceImportedSource] = useState<string | null>(null);
  const [chatWorkflow, setChatWorkflow] = useState<ChatWorkflowSession>(
    createChatWorkflowSession("none"),
  );
  const [chatWorkflowTick, setChatWorkflowTick] = useState(0);
  const [localAiStatus, setLocalAiStatus] = useState<LocalAiStatus | null>(null);
  const [embeddedLocalAiStatus, setEmbeddedLocalAiStatus] =
    useState<EmbeddedLocalLlmStatus | null>(null);
  const [embeddedAiConsumerStatus, setEmbeddedAiConsumerStatus] =
    useState<EmbeddedAiConsumerStatus | null>(null);
  const [conversationalGuideCard, setConversationalGuideCard] = useState<GuidanceCard | null>(
    null,
  );
  const [opsFocusTarget, setOpsFocusTarget] = useState<OpsFocusTarget | null>(null);
  const [opsFocusTick, setOpsFocusTick] = useState(0);
  // Consumer memory state
  const [memoryDraft, setMemoryDraft] = useState<MemoryCompressionDraft | null>(null);
  const [localAiBannerDismissed, setLocalAiBannerDismissed] = useState(false);
  const [memoryUpdateSuggestionVisible, setMemoryUpdateSuggestionVisible] = useState(false);
  const [memoryUpdateSuggestionLastAt, setMemoryUpdateSuggestionLastAt] = useState<number | null>(null);
  const [messagesSinceLastUpdate, setMessagesSinceLastUpdate] = useState(0);
  const [memoryHydrationStatus, setMemoryHydrationStatus] = useState<"loading" | "ready" | "empty">("loading");
  const [durableMemoryEventSummary, setDurableMemoryEventSummary] = useState<string | null>(null);
  const [showContinuityInspector, setShowContinuityInspector] = useState(false);
  const [continuityInspectorReport, setContinuityInspectorReport] =
    useState<ContinuityInspectorReport | null>(null);
  const [runtimePresence, setRuntimePresence] = useState<string | null>(null);
  const [onboardingState, setOnboardingState] = useState<OnboardingState | null>(null);
  const [assistantProfile, setAssistantProfile] = useState<AssistantProfile | null>(null);
  const [assistantNameDraft, setAssistantNameDraft] = useState("Assistant");
  const [dismissedExportMessage, setDismissedExportMessage] = useState(false);
  const [transferUx, setTransferUx] = useState<TransferUxState>({ phase: "idle" });
  const [showRecoveryDetails, setShowRecoveryDetails] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const encryptedImportInputRef = useRef<HTMLInputElement>(null);
  const activeStreamIdRef = useRef<string | null>(null);
  const assistantMessageIdRef = useRef<string | null>(null);
  const latestSentUserMessageIdRef = useRef<string | null>(null);
  const latestSentContentRef = useRef<string>("");
  const lastAutoProjectStateSummaryRef = useRef<string | null>(null);

  const memoryRuntimeLabel = useMemo(
    () =>
      resolveMemoryRuntimeLabel({
        status: memoryHydrationStatus,
        continuitySummary: workspace?.continuitySummary,
        messageCount: messageTotalCount,
      }),
    [memoryHydrationStatus, workspace?.continuitySummary, messageTotalCount],
  );
  const effectiveContinuitySummary = useMemo(
    () =>
      mergeDurableStructuredMemoryIntoSummary({
        continuitySummary: workspace?.continuitySummary,
        durableMemoryEventSummary,
      }),
    [workspace?.continuitySummary, durableMemoryEventSummary],
  );

  const isProviderConfigured = (config: ProviderConfig | null) => {
    if (!config?.enabled) return false;
    return config.provider === "ollama";
  };

  const updateGuidance = useCallback(
    (state: GuidanceState, importedSource?: string | null) => {
      setGuidanceState(state);
      if (importedSource !== undefined) {
        setGuidanceImportedSource(importedSource);
      }
    },
    [],
  );

  const focusProjectTools = useCallback(
    (tab: OpsTabId, target: OpsFocusTarget) => {
      setShowProjectTools(true);
      setOpsTab(tab);
      setOpsFocusTarget(target);
      setOpsFocusTick((value) => value + 1);
    },
    [],
  );

  const openChatWorkflow = useCallback(
    (
      kind: ActiveChatWorkflow,
      options: Partial<Omit<ChatWorkflowSession, "kind">> = {},
    ) => {
      setChatWorkflow(createChatWorkflowSession(kind, options));
      setChatWorkflowTick((value) => value + 1);
    },
    [],
  );

  const closeChatWorkflow = useCallback(() => {
    setChatWorkflow(createChatWorkflowSession("none"));
    setChatWorkflowTick((value) => value + 1);
  }, []);

  const refreshAppState = useCallback(async () => {
    const state = await continuity.getAppState();
    setAppState(state);
    return state;
  }, []);

  const refreshLocalAiStatus = useCallback(
    async (workspaceId?: string | null): Promise<LocalAiStatus | null> => {
      const nextWorkspaceId = workspaceId ?? workspace?.id ?? null;
      if (!nextWorkspaceId) {
        setLocalAiStatus(null);
        return null;
      }
      const status = await continuity.getLocalAiStatus(nextWorkspaceId).catch(() => null);
      setLocalAiStatus(status);
      return status;
    },
    [workspace?.id],
  );

  const refreshEmbeddedLocalAiStatus = useCallback(async (): Promise<EmbeddedLocalLlmStatus | null> => {
    const status = await continuity.getEmbeddedLocalAiStatus().catch(() => null);
    setEmbeddedLocalAiStatus(status);
    return status;
  }, []);

  const refreshEmbeddedAiConsumerStatus = useCallback(async (): Promise<EmbeddedAiConsumerStatus | null> => {
    const status = await continuity.getEmbeddedAiConsumerStatus?.().catch(() => null);
    if (status) {
      setEmbeddedAiConsumerStatus(status);
      if (status.aiRepliesReady) {
        void refreshAppState();
        if (workspace?.id) void refreshLocalAiStatus(workspace.id);
      }
    }
    return status ?? null;
  }, [refreshAppState, refreshLocalAiStatus, workspace?.id]);

  const openProjectToolsFromChat = useCallback(
    (target: OpsFocusTarget) => {
      if (target === "local-ai") {
        focusProjectTools("settings", target);
        return;
      }
      focusProjectTools("overview" as OpsTabId, target);
    },
    [focusProjectTools],
  );

  const refreshOpsPanels = useCallback(async (wsId: string) => {
    setHealthLoading(true);
    try {
      const [groups, snapList, state, health, autosave] = await Promise.all([
        continuity.listTimelineGrouped(wsId),
        continuity.listSnapshots(wsId),
        continuity.getAppState(),
        continuity.getWorkspaceHealth(wsId),
        continuity.getAutosaveStatus(),
      ]);
      setTimelineGroups(groups);
      setSnapshots(snapList);
      setAppState(state);
      setWorkspaceHealth(health);
      setAutosaveStatus(autosave);
      const profile = await continuity.getAssistantProfile().catch(() => null);
      if (profile) {
        setAssistantProfile(profile);
        setAssistantNameDraft(profile.assistantName);
      }
    } finally {
      setHealthLoading(false);
    }
  }, []);

  const loadThreadMessages = useCallback(async (threadId: string) => {
    const page = await continuity.listMessagesPage(threadId);
    setMessages(page.messages);
    setMessageTotalCount(page.totalCount);
    setHasMoreOlderMessages(page.hasMoreOlder);
    if (page.oldestLoadedCreatedAt && page.oldestLoadedId) {
      setOldestMessageCursor({
        createdAt: page.oldestLoadedCreatedAt,
        id: page.oldestLoadedId,
      });
    } else {
      setOldestMessageCursor(null);
    }
  }, []);

  const reloadThreads = useCallback(
    async (wsId: string, archived = showArchivedThreads, deleted = showDeletedThreads) => {
      const list = await continuity.listThreads(wsId, {
        includeArchived: archived,
        includeDeleted: deleted,
      });
      setThreads(list);
      return list;
    },
    [showArchivedThreads, showDeletedThreads],
  );

  const applyActiveThreadRepair = useCallback(
    async (repair: ThreadActionResult) => {
      if (repair.thread) {
        setActiveThread(repair.thread);
        await continuity.setActiveThread(repair.thread.id);
        await loadThreadMessages(repair.thread.id);
        setStreamError(null);
        setManualFallback((prev) =>
          prev?.threadId === repair.thread?.id ? prev : null,
        );
      } else {
        setActiveThread(null);
        setMessages([]);
        setMessageTotalCount(0);
        setHasMoreOlderMessages(false);
        setOldestMessageCursor(null);
        setManualFallback(null);
      }
    },
    [loadThreadMessages],
  );

  const loadWorkspace = useCallback(async (ws: Workspace | null) => {
    setWorkspace(ws);
    if (!ws) {
      setThreads([]);
      setActiveThread(null);
      setMessages([]);
      setTimelineGroups([]);
      setSnapshots([]);
      setProviderConfig(null);
      setManualFallback(null);
      setLocalAiStatus(null);
      setEmbeddedLocalAiStatus(null);
      setEmbeddedAiConsumerStatus(null);
      setConversationalGuideCard(null);
      closeChatWorkflow();
      return;
    }
    const [config, nextLocalAiStatus, nextEmbeddedLocalAiStatus, nextEmbeddedConsumer] =
      await Promise.all([
      continuity.getProviderConfig(ws.id),
      continuity.getLocalAiStatus(ws.id).catch(() => null),
      continuity.getEmbeddedLocalAiStatus().catch(() => null),
      continuity.getEmbeddedAiConsumerStatus?.().catch(() => null),
    ]);
    setProviderConfig(config);
    setLocalAiStatus(nextLocalAiStatus);
    setEmbeddedLocalAiStatus(nextEmbeddedLocalAiStatus);
    setEmbeddedAiConsumerStatus(nextEmbeddedConsumer);
    if (ws.id && continuity.prepareEmbeddedLocalAi) {
      void continuity.prepareEmbeddedLocalAi(ws.id).then((status) => {
        setEmbeddedAiConsumerStatus(status);
      });
    }
    setOnboardingState(loadOnboardingState(window.localStorage, ws.id));
    await refreshOpsPanels(ws.id);

    setMessagesSinceLastUpdate(0);
    setMemoryUpdateSuggestionVisible(false);
    try {
      const draft = await continuity.previewMemoryCompression({ workspaceId: ws.id, threadId: null });
      setMemoryDraft(draft);
    } catch {
      setMemoryDraft(null);
    }

    const repair = await continuity.repairActiveThread(ws.id);
    const threadList = await reloadThreads(ws.id);
    const thread =
      repair.thread ?? threadList.find((t) => !t.archivedAt && !t.deletedAt) ?? null;
    setActiveThread(thread);
    if (thread) {
      await continuity.setActiveThread(thread.id);
      await loadThreadMessages(thread.id, thread);
    } else {
      setMessages([]);
      setMessageTotalCount(0);
      setHasMoreOlderMessages(false);
      setOldestMessageCursor(null);
    }
    updateGuidance("welcome");
    setConversationalGuideCard(null);
    closeChatWorkflow();
  }, [closeChatWorkflow, refreshOpsPanels, loadThreadMessages, reloadThreads, updateGuidance]);

  const bootstrap = useCallback(async () => {
    setLoading(true);
    setStartupPhase("starting");
    try {
      const state = await refreshAppState();
      if (state.migrationsJustApplied.length > 0) {
        setStartupPhase("migrating");
      }
      if (state.recoveryMode) {
        setWorkspace(null);
        setStartupPhase("ready");
        return;
      }

      setStartupPhase("loading");
      let ws = await continuity.getActiveWorkspace();
      if (!ws) {
        const all = await continuity.listWorkspaces();
        ws = all[0] ?? null;
      }
      if (!ws) {
        ws = await continuity.createWorkspace("My Continuity Workspace");
      } else {
        await continuity.setActiveWorkspace(ws.id);
      }
      await loadWorkspace(ws);
      const recovery = resolveRecoveryPresentation(state);
      if (recovery.subtleStatus) {
        setRuntimePresence(recovery.subtleStatus);
        window.setTimeout(() => setRuntimePresence(null), 6000);
      }
      setStartupPhase("ready");
    } finally {
      setLoading(false);
    }
  }, [loadWorkspace, refreshAppState]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  // Test-only: Skip preparation if E2E ready assistant flag is set
  useEffect(() => {
    if (!workspace) return;
    if (!continuity.isE2eReadyAssistant?.()) return;
    // E2E test mode: mark assistant preparation as complete if not already done
    if (onboardingState?.assistantPreparationCompleted) return;
    const next = markAssistantPreparationCompleted(window.localStorage, workspace.id);
    setOnboardingState(next);
  }, [workspace, onboardingState?.assistantPreparationCompleted]);

  // Test-only: skip first-run onboarding for preparation-screen-only tests
  useEffect(() => {
    if (!workspace) return;
    if (!continuity.isE2eSkipOnboarding?.()) return;
    if (!onboardingState) return;
    if (onboardingState.onboardingCompleted) return;
    const next = completeOnboardingWithProvider(
      window.localStorage,
      workspace.id,
      "ollama",
      Boolean(appState?.providerReady),
    );
    setOnboardingState({ ...next, onboardingCompleted: true, wizardStep: 2 });
  }, [workspace, onboardingState, appState?.providerReady]);

  useEffect(() => {
    if (!workspace?.id) return;
    const prepComplete = Boolean(onboardingState?.assistantPreparationCompleted);
    const canReply = Boolean(appState?.defaultAiCanReply);
    if (prepComplete && canReply) return;
    void refreshEmbeddedAiConsumerStatus();
    void refreshAppState();
    const intervalMs =
      !prepComplete || !canReply ? 2000 : 4000;
    const timer = window.setInterval(() => {
      void refreshEmbeddedAiConsumerStatus();
      void refreshAppState();
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [
    workspace?.id,
    onboardingState?.assistantPreparationCompleted,
    appState?.defaultAiCanReply,
    embeddedAiConsumerStatus?.phase,
    refreshEmbeddedAiConsumerStatus,
    refreshAppState,
  ]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || !workspace || appState?.recoveryMode) return;
      const key = e.key.toLowerCase();
      if (key === "n" && !e.shiftKey) {
        e.preventDefault();
        void handleCreateThread();
      }
      if (e.shiftKey && key === "s") {
        e.preventDefault();
        const label = window.prompt("Snapshot label (optional)") ?? "";
        void handleCreateSnapshot(label);
      }
      if (e.shiftKey && key === "e") {
        e.preventDefault();
        void handleExport();
      }
      if (e.shiftKey && key === "k") {
        e.preventDefault();
        void handleEncryptedExport();
      }
      if (
        import.meta.env.DEV &&
        import.meta.env.VITE_CONTINUITY_DEBUG_INSPECTOR === "1" &&
        e.altKey &&
        e.shiftKey &&
        key === "i" &&
        activeThread
      ) {
        e.preventDefault();
        void continuity
          .getContinuityInspector({
            workspaceId: workspace.id,
            threadId: activeThread.id,
            query: messages
              .slice()
              .reverse()
              .find((message) => message.role === "user")
              ?.content,
          })
          .then((report) => {
            setContinuityInspectorReport(report);
            setShowContinuityInspector(true);
          })
          .catch(() => null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [workspace, appState?.recoveryMode, activeThread, continuity, messages]);

  const contextPackRequestHint = useMemo(
    () =>
      getContextPackRequestHint({
        messages,
        guidanceState,
        continuitySummary: workspace?.continuitySummary ?? null,
        importedSource: guidanceImportedSource,
      }),
    [guidanceImportedSource, guidanceState, messages, workspace?.continuitySummary],
  );

  const activeInAppChat = useMemo(() => {
    const provider = providerConfig?.provider ?? null;
    const configuredModel = providerConfig?.model.trim() ?? "";
    const configuredBaseUrl = providerConfig?.baseUrl?.trim() ?? "";
    const detectedModel = localAiStatus?.selectedModel?.trim() ?? "";
    const detectedBaseUrl = localAiStatus?.baseUrl?.trim() ?? "";
    const isOllama = provider === "ollama";
    const model = isOllama
      ? detectedModel || configuredModel
      : configuredModel;
    const baseUrl = isOllama
      ? detectedBaseUrl || configuredBaseUrl
      : configuredBaseUrl;
    const canReply = Boolean(appState?.defaultAiCanReply ?? appState?.providerReady);
    const ready = Boolean(canReply && model && (!isOllama || Boolean(baseUrl)));

    return {
      provider,
      baseUrl: baseUrl || null,
      model: model || null,
      ready,
      canReply,
      isOllama,
    };
  }, [appState?.defaultAiCanReply, appState?.providerReady, localAiStatus, providerConfig]);

  const buildSendFailureGuide = useCallback(
    (error?: string | null) =>
      buildChatFailureCard({
        error,
        localAiState: localAiStatus?.state ?? null,
        providerReady: activeInAppChat.ready,
        selectedModel: activeInAppChat.model,
        baseUrl: activeInAppChat.baseUrl,
      }),
    [
      activeInAppChat.baseUrl,
      activeInAppChat.model,
      activeInAppChat.ready,
      localAiStatus?.state,
    ],
  );

  useEffect(() => {
    const cleanup = continuity.onStreamEvents({
      onDelta: (event: StreamDeltaEvent) => {
        if (event.streamId !== activeStreamIdRef.current && event.messageId !== assistantMessageIdRef.current) return;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === event.messageId ? { ...m, content: event.content } : m,
          ),
        );
      },
      onDone: (event: StreamDoneEvent) => {
        // Completion from backend should always unlock the composer.
        setMessages((prev) =>
          prev.map((m) => (m.id === event.message.id ? event.message : m)),
        );
        setStreaming(false);
        activeStreamIdRef.current = null;
        assistantMessageIdRef.current = null;
        latestSentUserMessageIdRef.current = null;
        latestSentContentRef.current = "";
        setStreamError(null);
        setManualFallback(null);
        setConversationalGuideCard(null);
        updateGuidance("welcome");
        closeChatWorkflow();
        if (workspace) void refreshOpsPanels(workspace.id);
      },
      onError: (event: StreamErrorEvent) => {
        // Error from backend should always unlock the composer.
        setMessages((prev) =>
          prev.map((m) =>
            m.id === event.messageId ? { ...m, content: event.content } : m,
          ),
        );
        setStreaming(false);
        activeStreamIdRef.current = null;
        assistantMessageIdRef.current = null;
        const fallback = activeThread
          ? buildManualFallbackState({
              threadId: activeThread.id,
              sourceMessageId: latestSentUserMessageIdRef.current,
              error: event.error,
              providerConfigured:
                activeInAppChat.ready || isProviderConfigured(providerConfig),
            })
          : null;
        if (!event.cancelled) {
          if (fallback) {
            setManualFallback(fallback);
            setStreamError(null);
            setConversationalGuideCard(buildSendFailureGuide(event.error));
            if (!activeInAppChat.ready) {
              updateGuidance(
                transitionGuidanceState(guidanceState, "message_saved_without_provider"),
              );
            }
          } else {
            setStreamError(event.error);
            setManualFallback(null);
            setConversationalGuideCard(null);
          }
        } else {
          setStreamError(null);
          setManualFallback(null);
          setConversationalGuideCard(null);
        }
        latestSentUserMessageIdRef.current = null;
        latestSentContentRef.current = "";
        if (workspace) void refreshOpsPanels(workspace.id);
      },
    });
    return cleanup;
  }, [
    activeInAppChat.ready,
    activeThread,
    buildSendFailureGuide,
    closeChatWorkflow,
    guidanceState,
    providerConfig,
    refreshOpsPanels,
    updateGuidance,
    workspace,
    localAiStatus?.detected,
  ]);

  const handleCreateThread = async () => {
    if (!workspace) return;
    const thread = await continuity.createThread(
      workspace.id,
      `Thread ${threads.filter((t) => !t.deletedAt && !t.archivedAt).length + 1}`,
    );
    await reloadThreads(workspace.id);
    setActiveThread(thread);
    await continuity.setActiveThread(thread.id);
    setMessages([]);
    setResumeCard(null);
    setManualFallback(null);
    updateGuidance("welcome");
    setConversationalGuideCard(null);
    closeChatWorkflow();
    await refreshOpsPanels(workspace.id);
  };



  useEffect(() => {
    if (!activeThread || messages.length === 0) {
      return;
    }

    setResumeCard((current) => {
      if (current?.threadId === activeThread.id) {
        return current;
      }

      return buildResumeCardState(activeThread, messages, messageTotalCount);
    });
  }, [activeThread, messages, messageTotalCount]);

  useEffect(() => {
    if (!workspace || !activeThread || messages.length === 0) {
      return;
    }

    const nextSummary = buildProjectStateMemorySummary({
      workspaceName: workspace.name,
      thread: activeThread,
      messages,
      totalCount: messageTotalCount,
      existingSummary: workspace.continuitySummary,
    });

    if (!nextSummary) return;
    if (nextSummary === workspace.continuitySummary) return;
    if (nextSummary === lastAutoProjectStateSummaryRef.current) return;

    lastAutoProjectStateSummaryRef.current = nextSummary;

    const timer = window.setTimeout(() => {
      void continuity
        .updateContinuitySummary(workspace.id, nextSummary)
        .then((updatedWorkspace) => {
          setWorkspace(updatedWorkspace);
        })
        .catch((error) => {
          console.warn("[project-state-memory] auto-save failed", error);
          lastAutoProjectStateSummaryRef.current = null;
        });
    }, 500);

    return () => window.clearTimeout(timer);
  }, [continuity, workspace?.id, activeThread?.id, messages, messageTotalCount]);

  useEffect(() => {
    if (loading) {
      setMemoryHydrationStatus("loading");
      return;
    }

    if (!workspace || !activeThread) {
      setMemoryHydrationStatus("empty");
      return;
    }

    const hasSavedProjectState =
      typeof workspace.continuitySummary === "string" &&
      workspace.continuitySummary.trim().length > 0;

    const hasMessages = messages.length > 0 || messageTotalCount > 0;

    if (hasSavedProjectState || hasMessages) {
      setMemoryHydrationStatus("ready");
      return;
    }

    setMemoryHydrationStatus("empty");
  }, [
    loading,
    workspace?.id,
    workspace?.continuitySummary,
    activeThread?.id,
    messages.length,
    messageTotalCount,
  ]);

  useEffect(() => {
    if (import.meta.env.DEV) {
      console.info("[memory-hydration]", {
        status: memoryHydrationStatus,
        workspace: workspace?.name ?? null,
        thread: activeThread?.title ?? null,
        hasContinuitySummary: Boolean(workspace?.continuitySummary?.trim()),
        visibleMessages: messages.length,
        totalMessages: messageTotalCount,
      });
    }
  }, [
    memoryHydrationStatus,
    workspace?.name,
    workspace?.continuitySummary,
    activeThread?.title,
    messages.length,
    messageTotalCount,
  ]);

  useEffect(() => {
    if (import.meta.env.DEV) {
      console.info("[memory-runtime]", {
        label: memoryRuntimeLabel,
        hydration: memoryHydrationStatus,
        hasProjectState: Boolean(workspace?.continuitySummary?.includes("## Latest Local State")),
        totalMessages: messageTotalCount,
      });
    }
  }, [
    memoryRuntimeLabel,
    memoryHydrationStatus,
    workspace?.continuitySummary,
    messageTotalCount,
  ]);
  useEffect(() => {
    if (!workspace?.id) {
      setDurableMemoryEventSummary(null);
      return;
    }

    if (typeof continuity.listStructuredMemoryEventRecords !== "function") {
      setDurableMemoryEventSummary(null);
      return;
    }

    let disposed = false;

    void continuity
      .listStructuredMemoryEventRecords(workspace.id)
      .then((records) => {
        if (disposed) return;
        setDurableMemoryEventSummary(
          buildDurableStructuredMemoryEventSummary(records as DurableStructuredMemoryEventRecord[]),
        );
      })
      .catch((error) => {
        if (disposed) return;
        if (import.meta.env.DEV) {
          console.warn("[durable-memory-recall] failed to load structured memory events", error);
        }
        setDurableMemoryEventSummary(null);
      });

    return () => {
      disposed = true;
    };
  }, [continuity, workspace?.id, workspace?.continuitySummary]);

  // Phase 1 reliability watchdog:
  // While a local AI response is active, reload the active thread from SQLite.
  // This prevents the UI from staying stuck if a stream delta/done/error event is missed.
  useEffect(() => {
    if (!streaming || !activeThread?.id) return;

    const threadId = activeThread.id;
    const assistantMessageId = assistantMessageIdRef.current;
    const startedAt = Date.now();
    let disposed = false;

    const poll = async () => {
      if (disposed) return;

      try {
        const page = await continuity.listMessagesPage(threadId);
        if (disposed) return;

        setMessages(page.messages);
        setMessageTotalCount(page.totalCount);
        setHasMoreOlderMessages(page.hasMore);
        setOldestMessageCursor(page.nextCursor ?? null);

        const trackedAssistant = assistantMessageId
          ? page.messages.find((message) => message.id === assistantMessageId)
          : [...page.messages].reverse().find((message) => message.role === "assistant");

        if (
          trackedAssistant &&
          trackedAssistant.messageStatus &&
          trackedAssistant.messageStatus !== "streaming"
        ) {
          setStreaming(false);
          activeStreamIdRef.current = null;
          assistantMessageIdRef.current = null;
          latestSentUserMessageIdRef.current = null;
          latestSentContentRef.current = "";

          if (trackedAssistant.messageStatus === "failed") {
            setStreamError("Polaris could not get a response from the local AI. Check Ollama or try again.");
          } else {
            setStreamError(null);
          }

          if (workspace) void refreshOpsPanels(workspace.id);
          return;
        }

        if (Date.now() - startedAt > 60000) {
          setStreaming(false);
          activeStreamIdRef.current = null;
          assistantMessageIdRef.current = null;
          setStreamError("Polaris took too long to respond. Check Ollama or try again.");
        }
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error("[phase1-stream-watchdog] failed to reload messages", error);
        }
      }
    };

    void poll();
    const timer = window.setInterval(() => {
      void poll();
    }, 1000);

    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [streaming, activeThread?.id, workspace?.id, refreshOpsPanels]);

  const handleSelectThread = async (thread: Thread) => {
    if (streaming || thread.id === activeThread?.id) return;
    setThreadSwitching(true);
    setActiveThread(thread);
    try {
      await continuity.setActiveThread(thread.id);
      await loadThreadMessages(thread.id, thread);
      setStreamError(null);
      setManualFallback((prev) => (prev?.threadId === thread.id ? prev : null));
      updateGuidance("welcome");
      setConversationalGuideCard(null);
      closeChatWorkflow();
    } finally {
      setThreadSwitching(false);
    }
  };

  const saveImmediateUserIntentMemory = async (savedMessage: Message) => {
    if (!workspace || !activeThread) return;
    if (isTrivialMemoryInput(savedMessage.content)) return;

    const nextSummary = buildImmediateUserIntentMemorySummary({
      workspaceName: workspace.name,
      thread: activeThread,
      userMessage: savedMessage,
      existingSummary: workspace.continuitySummary,
      totalCount: Math.max(messageTotalCount, messages.length) + 1,
    });

    if (!nextSummary) return;
    if (nextSummary === workspace.continuitySummary) return;
    if (nextSummary === lastAutoProjectStateSummaryRef.current) return;

    lastAutoProjectStateSummaryRef.current = nextSummary;

    try {
      const updatedWorkspace = await continuity.updateContinuitySummary(workspace.id, nextSummary);
      setWorkspace(updatedWorkspace);
    } catch (error) {
      console.warn("[project-state-memory] immediate user intent autosave failed", error);
      lastAutoProjectStateSummaryRef.current = null;
    }
  };
  const handleLoadOlderMessages = async () => {
    if (!activeThread || !oldestMessageCursor || loadingOlderMessages) return;
    setLoadingOlderMessages(true);
    try {
      const page = await continuity.listMessagesPage(activeThread.id, {
        beforeCreatedAt: oldestMessageCursor.createdAt,
        beforeId: oldestMessageCursor.id,
      });
      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        const older = page.messages.filter((m) => !seen.has(m.id));
        return [...older, ...prev];
      });
      setHasMoreOlderMessages(page.hasMoreOlder);
      if (page.oldestLoadedCreatedAt && page.oldestLoadedId) {
        setOldestMessageCursor({
          createdAt: page.oldestLoadedCreatedAt,
          id: page.oldestLoadedId,
        });
      }
      setMessageTotalCount(page.totalCount);
    } finally {
      setLoadingOlderMessages(false);
    }
  };

  const handleRenameThread = async (threadId: string, title: string) => {
    const updated = await continuity.renameThread(threadId, title);
    if (workspace) await reloadThreads(workspace.id);
    if (activeThread?.id === threadId) {
      setActiveThread(updated);
    }
    if (workspace) await refreshOpsPanels(workspace.id);
  };

  const handleMoveThreadUp = async (threadId: string) => {
    if (!workspace) return;
    await continuity.moveThreadUp(threadId);
    await reloadThreads(workspace.id);
    await refreshOpsPanels(workspace.id);
  };

  const handleMoveThreadDown = async (threadId: string) => {
    if (!workspace) return;
    await continuity.moveThreadDown(threadId);
    await reloadThreads(workspace.id);
    await refreshOpsPanels(workspace.id);
  };

  const handleArchiveThread = async (threadId: string) => {
    if (!workspace) return;
    const result = await continuity.archiveThread(threadId);
    await reloadThreads(workspace.id);
    await applyActiveThreadRepair(result.repair);
    await refreshOpsPanels(workspace.id);
  };

  const handleUnarchiveThread = async (threadId: string) => {
    if (!workspace) return;
    await continuity.unarchiveThread(threadId);
    await reloadThreads(workspace.id);
    await refreshOpsPanels(workspace.id);
  };

  const handleDeleteThread = async (threadId: string) => {
    if (!workspace) return;
    const result = await continuity.deleteThread(threadId);
    await reloadThreads(workspace.id);
    await applyActiveThreadRepair(result.repair);
    await refreshOpsPanels(workspace.id);
  };

  const handleRestoreThread = async (threadId: string) => {
    if (!workspace) return;
    await continuity.restoreThread(threadId);
    await reloadThreads(workspace.id);
    await refreshOpsPanels(workspace.id);
  };

  const buildRestoredMemoryPin = (input: { name: string; markdown: string }) => {
    const normalized = input.markdown
      .replace(/\r\n/g, "\n")
      .replace(/\n{4,}/g, "\n\n\n")
      .trim();

    const userMessageMatches = [...normalized.matchAll(/###\s+User\s*\n([\s\S]*?)(?=\n---\n|\n###\s+|$)/gi)]
      .map((match) => match[1]?.trim())
      .filter(Boolean);

    const assistantMessageMatches = [...normalized.matchAll(/###\s+Polaris\s*\n([\s\S]*?)(?=\n---\n|\n###\s+|$)/gi)]
      .map((match) => match[1]?.trim())
      .filter(Boolean);

    const userFacts = userMessageMatches
      .filter((message) =>
        /\b(i like|i love|i prefer|my favorite|my favourite|remember|i want|i need|i am|i'm|i have|we are|we need|the project|current|goal|issue|problem)\b/i.test(message),
      )
      .slice(-40);

    const recentUserMessages = userMessageMatches.slice(-30);
    const recentAssistantMessages = assistantMessageMatches.slice(-12);

    const compactSource = [
      "# RESTORED_MEMORY_PIN",
      "",
      "This is pinned restored context for this thread.",
      "Polaris must use this context to answer future questions in this restored conversation.",
      "If the user asks about preferences, facts, project state, or prior work, check this restored memory first.",
      "",
      `## RESTORED_FROM`,
      input.name || "Imported save point",
      "",
      "## USER_FACTS_AND_PREFERENCES",
      userFacts.length > 0
        ? userFacts.map((fact) => `- ${fact.replace(/\s+/g, " ").slice(0, 500)}`).join("\n")
        : "No explicit user facts were extracted. Use RECENT_USER_MESSAGES below.",
      "",
      "## RECENT_USER_MESSAGES",
      recentUserMessages.length > 0
        ? recentUserMessages.map((message) => `- ${message.replace(/\s+/g, " ").slice(0, 500)}`).join("\n")
        : "No user messages found in imported save point.",
      "",
      "## RECENT_POLARIS_MESSAGES",
      recentAssistantMessages.length > 0
        ? recentAssistantMessages.map((message) => `- ${message.replace(/\s+/g, " ").slice(0, 500)}`).join("\n")
        : "No Polaris messages found in imported save point.",
      "",
      "## RAW_SAVE_POINT_EXCERPT",
      normalized.slice(0, 6000),
    ].join("\n");

    return compactSource.slice(0, 12000);
  };

  const handleRestoreSavePoint = async (input: { name: string; markdown: string }) => {
    if (!workspace) {
      throw new Error("Open a workspace before restoring a save point.");
    }

    try {
      const safeName = input.name.trim() || "Save point";
    const importedProjectMemory = extractSavedProjectMemoryFromMarkdown(input.markdown);

    if (importedProjectMemory) {
      try {
        const mergedProjectMemory = mergeImportedProjectMemory({
          existingSummary: workspace.continuitySummary,
          importedSummary: importedProjectMemory,
          importedName: safeName,
        });
        const updatedWorkspace = await continuity.updateContinuitySummary(workspace.id, mergedProjectMemory);
        setWorkspace(updatedWorkspace);
        lastAutoProjectStateSummaryRef.current = mergedProjectMemory;
      } catch (error) {
        console.warn("[savepoint-restore] saved project memory import failed", error);
      }
    }
      const title =
        safeName.length > 48
          ? `Restored: ${safeName.slice(0, 45)}...`
          : `Restored: ${safeName}`;

      const thread = await continuity.createThread(workspace.id, title);
      setActiveThread(thread);
      await continuity.setActiveThread(thread.id);

      const restoredMemoryPin = buildRestoredMemoryPin(input);
      const pinnedMemoryMessage = await continuity.saveLocalUserMessage({
        threadId: thread.id,
        content: restoredMemoryPin,
      });

      const restoreMessage = [
        "# RESTORED_CONTINUITYOS_SAVE_POINT",
        "",
        "Polaris, restore this save point and continue the conversation from it.",
        "Do not ask the user to resend this context. Treat the save point below as already imported.",
        "Respond as the user's continuity assistant, not as a generic chatbot.",
        "First provide a useful restored-state summary with these sections:",
        "1. What I restored",
        "2. Current objective",
        "3. Important context",
        "4. Open issues or blockers",
        "5. Recommended next step",
        "Then continue naturally from the latest point in the save point.",
        "Do not give a generic greeting. Do not say you cannot see previous chats if the save point contains context.",
        "",
        input.markdown,
      ].join("\n");

      setStreamError(null);
      setManualFallback(null);
      setConversationalGuideCard(null);
      updateGuidance("welcome");
      closeChatWorkflow();

      if (
        workspace &&
        activeInAppChat.ready &&
        activeInAppChat.isOllama &&
        providerConfig &&
        (
          !providerConfig.enabled ||
          providerConfig.model.trim() !== activeInAppChat.model ||
          (providerConfig.baseUrl?.trim() ?? "") !== activeInAppChat.baseUrl
        )
      ) {
        const syncedConfig = await continuity.saveProviderConfig(
          workspace.id,
          "ollama",
          activeInAppChat.model ?? "",
          "",
          activeInAppChat.baseUrl,
        );
        setProviderConfig(syncedConfig);
      }

      setStreaming(true);
      const result = await continuity.startMessageStream({
        threadId: thread.id,
        content: restoreMessage,
        ...(activeInAppChat.ready &&
        activeInAppChat.isOllama &&
        activeInAppChat.model &&
        activeInAppChat.baseUrl
          ? {
              ollama: {
                model: activeInAppChat.model,
                baseUrl: activeInAppChat.baseUrl,
              },
            }
          : {}),
      });

      const next: Message[] = [];
      if (result.userMessage) {
        next.push(result.userMessage);
        latestSentUserMessageIdRef.current = result.userMessage.id;
      }
      if (result.assistantMessage) {
        next.push(result.assistantMessage);
        assistantMessageIdRef.current = result.assistantMessage.id;
      }

      setMessages(next);
      setMessageTotalCount(next.length);
      setHasMoreOlderMessages(false);
      setOldestMessageCursor(null);

      await reloadThreads(workspace.id);
      await refreshOpsPanels(workspace.id);

      if (result.error) {
        const fallback = buildManualFallbackState({
          threadId: thread.id,
          sourceMessageId: result.userMessage?.id ?? null,
          error: result.error,
          providerConfigured:
            activeInAppChat.ready || isProviderConfigured(providerConfig),
        });

        if (fallback) {
          setManualFallback(fallback);
          setStreamError(null);
        } else {
          setStreamError(result.error);
        }
        return;
      }

      if (result.streamId && result.assistantMessage) {
        activeStreamIdRef.current = result.streamId;
        setStreaming(true);
      } else {
        setStreaming(false);
      }
    } catch (error) {
      console.error("[savepoint-restore-autosubmit] failed in App", error);
      throw error;
    }
  };
  const handleSendMessage = async (content: string) => {
    if (!activeThread || streaming) return;

    const streamEnvelope = buildPolarisStreamEnvelope({
      userVisibleContent: content,
      continuitySummary: effectiveContinuitySummary,
      workspaceName: workspace?.name,
      threadTitle: activeThread.title,
      includeMemoryRecall: true,
    });

    const visibleContent = streamEnvelope.visibleUserContent;
    const modelContent = streamEnvelope.modelContent;
    const localRoute = activeInAppChat.ready
      ? { kind: "none" as const }
      : routeChatIntent(visibleContent, guidanceState);
    latestSentContentRef.current = visibleContent.trim();
    setStreamError(null);
    setManualFallback(null);
    setConversationalGuideCard(null);
    updateGuidance("welcome");
    closeChatWorkflow();

    const saveLocalMessage = async () => {
      const savedMessage = await continuity.saveLocalUserMessage({
        threadId: activeThread.id,
        content: visibleContent,
      });
      setMessages((prev) =>
        [...prev, savedMessage].filter(
          (message, index, list) => list.findIndex((item) => item.id === message.id) === index,
        ),
      );
      latestSentUserMessageIdRef.current = savedMessage.id;
      assistantMessageIdRef.current = null;
      activeStreamIdRef.current = null;
      await saveImmediateUserIntentMemory(savedMessage);
      setStreaming(false);
      if (workspace) {
        await reloadThreads(workspace.id);
        await refreshOpsPanels(workspace.id);
      }
      return savedMessage;
    };

    if (isLocalGreetingRequest(visibleContent) && workspace) {
      const savedMessage = await saveLocalMessage();
      const assistantResponse = buildLocalGreetingResponse({
        workspaceName: workspace.name,
        memoryReady: Boolean(workspace.continuitySummary?.trim()) || messageTotalCount > 0,
      });

      await continuity.saveManualAssistantResponse({
        workspaceId: workspace.id,
        threadId: activeThread.id,
        assistantResponse,
        targetPlatform: "local-greeting",
        sourceUserMessageId: savedMessage.id,
      });

      const page = await continuity.listMessagesPage(activeThread.id);
      setMessages(page.messages);
      setMessageTotalCount(page.totalCount);
      setHasMoreOlderMessages(page.hasMoreOlder);
      if (page.oldestLoadedCreatedAt && page.oldestLoadedId) {
        setOldestMessageCursor({
          createdAt: page.oldestLoadedCreatedAt,
          id: page.oldestLoadedId,
        });
      } else {
        setOldestMessageCursor(null);
      }

      setStreaming(false);
      setStreamError(null);
      setManualFallback(null);
      await reloadThreads(workspace.id);
      await refreshOpsPanels(workspace.id);
      return;
    }

    if (isVagueImplementationRequest(visibleContent) && workspace) {
      const savedMessage = await saveLocalMessage();
      const assistantResponse = buildLocalImplementationClarificationResponse();

      await continuity.saveManualAssistantResponse({
        workspaceId: workspace.id,
        threadId: activeThread.id,
        assistantResponse,
        targetPlatform: "local-implementation-clarification",
        sourceUserMessageId: savedMessage.id,
      });

      const page = await continuity.listMessagesPage(activeThread.id);
      setMessages(page.messages);
      setMessageTotalCount(page.totalCount);
      setHasMoreOlderMessages(page.hasMoreOlder);
      if (page.oldestLoadedCreatedAt && page.oldestLoadedId) {
        setOldestMessageCursor({
          createdAt: page.oldestLoadedCreatedAt,
          id: page.oldestLoadedId,
        });
      } else {
        setOldestMessageCursor(null);
      }

      await reloadThreads(workspace.id);
      await refreshOpsPanels(workspace.id);
      return;
    }
    if (isLocalResumeRequest(visibleContent) && workspace) {
      const savedMessage = await saveLocalMessage();
      const assistantResponse = buildLocalResumeResponse({
        workspaceName: workspace.name,
        continuitySummary: effectiveContinuitySummary,
        thread: activeThread,
        messages,
        totalCount: messageTotalCount,
      });

      await continuity.saveManualAssistantResponse({
        workspaceId: workspace.id,
        threadId: activeThread.id,
        assistantResponse,
        targetPlatform: "local-resume",
        sourceUserMessageId: savedMessage.id,
      });

      const page = await continuity.listMessagesPage(activeThread.id);
      setMessages(page.messages);
      setMessageTotalCount(page.totalCount);
      setHasMoreOlderMessages(page.hasMoreOlder);
      if (page.oldestLoadedCreatedAt && page.oldestLoadedId) {
        setOldestMessageCursor({
          createdAt: page.oldestLoadedCreatedAt,
          id: page.oldestLoadedId,
        });
      } else {
        setOldestMessageCursor(null);
      }

      setStreaming(false);
      setStreamError(null);
      setManualFallback(null);
      await reloadThreads(workspace.id);
      await refreshOpsPanels(workspace.id);
      return;
    }
    if (localRoute.kind !== "none") {
      const savedMessage = await saveLocalMessage();
      if (localRoute.kind === "guidance") {
        setConversationalGuideCard(
          buildConversationalShellCard({
            message: visibleContent,
            guidanceState,
            localAiDetected: localAiStatus?.detected ?? null,
            workspaceName: workspace?.name ?? null,
          }),
        );
        return;
      }
      const requestText =
        localRoute.workflow === "continue_any_ai"
          ? contextPackRequestHint
          : localRoute.workflow === "paste_ai_response"
            ? contextPackRequestHint
            : null;
      openChatWorkflow(localRoute.workflow, {
        sourceUserMessageId: savedMessage.id,
        requestText,
      });
      return;
    }

    if (import.meta.env.DEV) {
      console.info("[continuity] chat send route", {
        activeEngine: activeInAppChat.ready ? activeInAppChat.provider : "guide",
        selectedModel: activeInAppChat.model,
        baseUrl: activeInAppChat.baseUrl,
        route: activeInAppChat.ready ? activeInAppChat.provider : "guide",
      });
    }

    if (
      workspace &&
      activeInAppChat.ready &&
      activeInAppChat.isOllama &&
      providerConfig &&
      (
        !providerConfig.enabled ||
        providerConfig.model.trim() !== activeInAppChat.model ||
        (providerConfig.baseUrl?.trim() ?? "") !== activeInAppChat.baseUrl
      )
    ) {
      const syncedConfig = await continuity.saveProviderConfig(
        workspace.id,
        "ollama",
        activeInAppChat.model ?? "",
        "",
        activeInAppChat.baseUrl,
      );
      setProviderConfig(syncedConfig);
    }

    const offlineSend = resolveSendWhenProviderOffline(activeInAppChat.ready);
    if (offlineSend.action === "manual_save") {
      await saveLocalMessage();
      setConversationalGuideCard({
        state: "context_pack_ready",
        title: "Message saved",
        body: AI_SAVED_NOT_READY_MESSAGE,
        footer: null,
        actions: [
          { id: "continue_chatting", label: AI_TRY_AGAIN_ACTION, tone: "primary" },
          { id: "set_up_local_ai", label: AI_USE_CLOUD_ACTION },
          { id: "backup_export", label: AI_CONTINUE_WITHOUT_ACTION },
        ],
      });
      updateGuidance(transitionGuidanceState(guidanceState, "message_saved_without_provider"));
      return;
    }

    setStreaming(true);
    const result = await continuity.startMessageStream({
      threadId: activeThread.id,
      content: modelContent,
      visibleContent,
      ...(activeInAppChat.ready &&
      activeInAppChat.isOllama &&
      activeInAppChat.model &&
      activeInAppChat.baseUrl
        ? {
            ollama: {
              model: activeInAppChat.model,
              baseUrl: activeInAppChat.baseUrl,
            },
          }
        : {}),
    });

    const next: Message[] = [];
    if (result.userMessage) {
      next.push(result.userMessage);
      latestSentUserMessageIdRef.current = result.userMessage.id;
    }
    if (result.assistantMessage) {
      next.push(result.assistantMessage);
      assistantMessageIdRef.current = result.assistantMessage.id;
    }
    if (next.length > 0) {
      setMessages((prev) => [...prev, ...next.filter((m) => !prev.some((p) => p.id === m.id))]);
    }

    if (result.error) {
      const fallback = buildManualFallbackState({
        threadId: activeThread.id,
        sourceMessageId: result.userMessage?.id ?? null,
        error: result.error,
        providerConfigured:
          activeInAppChat.ready || isProviderConfigured(providerConfig),
      });
      if (fallback) {
        setManualFallback(fallback);
        if (!activeInAppChat.ready) {
          updateGuidance(
            transitionGuidanceState(guidanceState, "message_saved_without_provider"),
          );
        }
        setConversationalGuideCard(buildSendFailureGuide(result.error));
      } else {
        setStreamError(result.error);
      }
      if (workspace) await refreshOpsPanels(workspace.id);
      return;
    }

    // Track messages for smart memory update suggestion
    if (result.userMessage) {
      setMessagesSinceLastUpdate((prev) => prev + 1);
      const suggestion = shouldSuggestMemoryUpdate({
        messagesSinceLastUpdate: messagesSinceLastUpdate + 1,
        latestUserMessage: visibleContent,
        lastSuggestedAt: memoryUpdateSuggestionLastAt,
      });
      if (suggestion.show && !memoryUpdateSuggestionVisible) {
        setMemoryUpdateSuggestionVisible(true);
        setMemoryUpdateSuggestionLastAt(Date.now());
      }
    }

    if (result.streamId && result.assistantMessage) {
      activeStreamIdRef.current = result.streamId;
      setStreaming(true);
    } else if (!result.assistantMessage) {
      const fallback = buildManualFallbackState({
        threadId: activeThread.id,
        sourceMessageId: result.userMessage?.id ?? null,
        providerConfigured:
          activeInAppChat.ready || isProviderConfigured(providerConfig),
      });
      if (fallback) {
        setManualFallback(fallback);
        if (!activeInAppChat.ready) {
          updateGuidance(
            transitionGuidanceState(guidanceState, "message_saved_without_provider"),
          );
        }
        setConversationalGuideCard(buildSendFailureGuide());
      }
      if (workspace) await refreshOpsPanels(workspace.id);
    }
  };

  const handleBuildContextPack = async (input: {
    userRequest: string;
    targetPlatform: string;
  }): Promise<UniversalContextPackResult> => {
    if (!workspace || !activeThread) {
      throw new Error("Open a thread before building an advanced AI handoff.");
    }
    const result = await continuity.buildContextPack({
      workspaceId: workspace.id,
      threadId: activeThread.id,
      userRequest: input.userRequest,
      targetPlatform: input.targetPlatform,
    });
    await refreshOpsPanels(workspace.id);
    return {
      ...result,
      text: injectSavedProjectMemoryIntoMarkdown({
        markdown: result.text,
        continuitySummary: workspace?.continuitySummary,
      }),
    };
  };

  const handleSaveManualAssistantResponse = async (input: {
    assistantResponse: string;
    targetPlatform: string;
    sourceUserMessageId?: string;
  }) => {
    if (!workspace || !activeThread) {
      throw new Error("Open a thread before saving a manual AI response.");
    }
    await continuity.saveManualAssistantResponse({
      workspaceId: workspace.id,
      threadId: activeThread.id,
      assistantResponse: input.assistantResponse,
      targetPlatform: input.targetPlatform,
      sourceUserMessageId: input.sourceUserMessageId,
    });
    await reloadThreads(workspace.id);
    await loadThreadMessages(activeThread.id);
    setManualFallback(null);
    await refreshOpsPanels(workspace.id);
  };

  const handleCancelStream = () => {
    const id = activeStreamIdRef.current;
    if (!id) return;
    void continuity.cancelMessageStream(id);
  };

  const openExternalUrl = (url: string) => {
    void continuity.openExternalUrl(url);
  };

  const handleSaveProvider = async (
    provider: string,
    model: string,
    apiKey: string,
    baseUrl: string,
  ) => {
    if (!workspace) return;
    try {
      const config = await continuity.saveProviderConfig(
        workspace.id,
        provider,
        model,
        apiKey,
        baseUrl || null,
      );
      setProviderConfig(config);
      setOnboardingState(
        syncProviderConfiguredFlag(window.localStorage, workspace.id, true),
      );
      await refreshOpsPanels(workspace.id);
      await refreshAppState();
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error("[continuity] save provider failed", err);
      }
      throw err;
    }
  };

  const handleUseLocalAi = useCallback(
    async (input: { model: string; baseUrl: string }) => {
      if (!workspace) {
        throw new Error("Open a workspace before enabling Local AI.");
      }
      await handleSaveProvider("ollama", input.model, "", input.baseUrl);
      const status = await refreshLocalAiStatus(workspace.id);
      if (status?.detected) {
        updateGuidance("local_ai_available");
      }
      setConversationalGuideCard(null);
      return status;
    },
    [handleSaveProvider, refreshLocalAiStatus, updateGuidance, workspace],
  );

  const handleTestProvider = async (
    provider: string,
    model: string,
    apiKey: string,
    baseUrl: string,
  ) => {
    if (!workspace) {
      return {
        ok: false,
        status: "unknown_error" as const,
        message: "No workspace loaded.",
      };
    }
    return continuity.testProviderConnection(workspace.id, {
      apiKey: apiKey.trim() || undefined,
      provider,
      model,
      baseUrl: baseUrl.trim() || undefined,
    });
  };

  const handleRemoveProviderKey = async (provider: string) => {
    if (!workspace) return;
    const config = await continuity.removeProviderKey(workspace.id, provider);
    if (config) setProviderConfig(config);
    else setProviderConfig(null);
  };

  const handleCreateSnapshot = async (label: string) => {
    if (!workspace) return;
    await continuity.createSnapshot(
      workspace.id,
      label || undefined,
      activeThread?.id ?? null,
    );
    await refreshOpsPanels(workspace.id);
  };

  const handleSaveContinuitySummary = async (summary: string) => {
    if (!workspace) return;
    const updated = await continuity.updateContinuitySummary(workspace.id, summary);
    setWorkspace(updated);
    await refreshOpsPanels(workspace.id);
  };

  const handleSaveWorkspaceProfile = async (patch: {
    name?: string;
    description?: string | null;
  }) => {
    if (!workspace) return;
    const updated = await continuity.updateWorkspaceProfile(workspace.id, patch);
    setWorkspace(updated);
    await refreshOpsPanels(workspace.id);
  };

  const handleSaveAssistantProfile = async (patch: AssistantProfileUpdate) => {
    const updated = await continuity.updateAssistantProfile(patch);
    setAssistantProfile(updated);
    setAssistantNameDraft(updated.assistantName);
  };

  const handleContinuityImported = async (result: ContinuityImportApplyResult) => {
    setExportMessage(result.message);
    setConversationalGuideCard(null);
    updateGuidance(
      transitionGuidanceState(guidanceState, "memory_imported"),
      result.sourceAi || null,
    );
    setShowProjectTools(false);
    if (result.workspace) {
      await continuity.setActiveWorkspace(result.workspace.id);
      await loadWorkspace(result.workspace);
      updateGuidance("memory_imported", result.sourceAi || null);
      closeChatWorkflow();
      return;
    }
    if (workspace) {
      await refreshOpsPanels(workspace.id);
    }
    closeChatWorkflow();
  };

  const handleApplyWorkflowImport = async (input: {
    text: string;
    mode: "update-current" | "create-workspace" | "checkpoint-only";
  }) => {
    const result = await continuity.applyContinuityImport({
      text: input.text,
      mode: input.mode,
      workspaceId: workspace?.id ?? undefined,
    });
    if (!result.ok) {
      throw new Error(result.message);
    }
    await handleContinuityImported(result);
    return result;
  };

  const isEncryptedBackupFile = (text: string): boolean => {
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      return parsed.encryptedBackupFormatVersion != null && parsed.ciphertext != null;
    } catch {
      return false;
    }
  };

  const handleImportFile = async (file: File) => {
    const text = await file.text();
    if (isEncryptedBackupFile(text)) {
      setEncryptedImport({ json: text, fileName: file.name });
      return;
    }
    const preview = await continuity.previewWorkspaceImport(text);
    setImportJson(text);
    setImportPreview(preview);
  };

  const handleEncryptedImportFile = async (file: File) => {
    try {
      const text = await file.text();
      setEncryptedImport({ json: text, fileName: file.name });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not read the encrypted backup file.";
      setExportMessage(message);
      if (import.meta.env.DEV) {
        console.error("[continuity] encrypted import file read failed", err);
      }
    }
  };

  const openEncryptedImportPicker = () => {
    const input = encryptedImportInputRef.current;
    if (!input) {
      const message = "Import picker is not ready. Restart the app and try again.";
      setExportMessage(message);
      if (import.meta.env.DEV) {
        console.error("[continuity] encrypted import file input ref is missing");
      }
      return;
    }
    input.click();
  };

  const handleConfirmImport = async () => {
    if (!importJson) return;
    setImporting(true);
    try {
      const result = await continuity.importWorkspace(importJson);
      setExportMessage(result.message);
      if (result.ok && result.workspace) {
        await continuity.setActiveWorkspace(result.workspace.id);
        await loadWorkspace(result.workspace);
      }
    } finally {
      setImporting(false);
      setImportPreview(null);
      setImportJson(null);
    }
  };

  const handleAfterRestore = async () => {
    if (!workspace || !activeThread) return;
    await loadThreadMessages(activeThread.id);
    await refreshOpsPanels(workspace.id);
    await refreshAppState();
  };

  const handleEncryptedExport = () => {
    if (!workspace) {
      setExportMessage("Open a workspace before creating an encrypted backup.");
      return;
    }
    if (appState?.recoveryMode) {
      setExportMessage("Encrypted export is unavailable in recovery mode.");
      return;
    }
    setShowEncryptedExport(true);
  };

  const runEncryptedExportWithPassword = async (password: string) => {
    if (!workspace) return;
    setExporting(true);
    setExportMessage(null);
    try {
      const result = await continuity.exportWorkspaceEncrypted(
        workspace.id,
        password,
      );
      if (!result.ok || !result.json) {
        throw new Error(result.error ?? "Encrypted export could not be completed.");
      }
      const blob = new Blob([result.json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `continuity-encrypted-${workspace.id.slice(0, 8)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setExportMessage("Encrypted backup saved locally.");
      setShowEncryptedExport(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Encrypted export failed.";
      setExportMessage(message);
      if (import.meta.env.DEV) {
        console.error("[continuity] encrypted export failed", err);
      }
      throw err instanceof Error ? err : new Error(message);
    } finally {
      setExporting(false);
    }
  };

  const handleExport = async () => {
    if (!workspace) return;
    setExporting(true);
    setExportMessage(null);
    setDismissedExportMessage(false);
    setTransferUx(startTransfer("export", "Preparing your workspace backup..."));
    try {
      const result = await continuity.exportWorkspace(workspace.id);
      if (!result.ok || !result.json) {
        const warn =
          result.exportWarnings?.length
            ? ` Warnings: ${result.exportWarnings.join("; ")}`
            : "";
        const message = (result.error ?? "Export could not be completed.") + warn;
        setExportMessage(message);
        setTransferUx(failTransfer("export", message));
        return;
      }
      const warnNote =
        result.exportWarnings && result.exportWarnings.length > 0
          ? ` (${result.exportWarnings.length} warning${result.exportWarnings.length > 1 ? "s" : ""})`
          : "";
      const blob = new Blob([result.json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `continuity-export-${workspace.id.slice(0, 8)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      const successMessage = `Workspace export saved${warnNote}.`;
      setExportMessage(successMessage);
      setTransferUx(succeedTransfer("export", successMessage));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Export failed.";
      setExportMessage(message);
      setTransferUx(failTransfer("export", message));
    } finally {
      setExporting(false);
    }
  };

  const providerSendEnabled = chatSendAllowed(appState) && activeInAppChat.ready;
  const provisioningView = useMemo(
    () =>
      resolveProvisioningReadiness({
        embeddedPhase: embeddedAiConsumerStatus?.phase ?? null,
        canReply: Boolean(appState?.defaultAiCanReply ?? appState?.providerReady),
        defaultAiRouteStatus: appState?.defaultAiRouteStatus,
        defaultAiConsumerMessage: appState?.defaultAiConsumerMessage,
        offline: embeddedAiConsumerStatus?.offline,
      }),
    [appState, embeddedAiConsumerStatus?.phase, embeddedAiConsumerStatus?.offline],
  );
  const providerPresentation = resolveProviderStatusPresentation({
    providerReady: Boolean(appState?.providerReady),
    providerReadinessStatus: appState?.providerReadinessStatus ?? "not_configured",
    model: activeInAppChat.model,
    consumerStatusMessage: provisioningView.consumerMessage,
    provisioningState:
      provisioningView.state === "DOWNLOADING" ||
      provisioningView.state === "STARTING" ||
      provisioningView.state === "VERIFYING"
        ? provisioningView.state
        : provisioningView.state === "PREPARING"
          ? "PREPARING"
          : null,
  });
  const recoveryPresentation = resolveRecoveryPresentation(appState);
  const providerBadge = providerPresentation.label;
  const workspaceSubtitle = resolveWorkspaceSubtitle({
    providerReady: Boolean(appState?.providerReady),
    providerSetupRequired: Boolean(appState?.providerSetupRequired),
    recoveryMode: Boolean(appState?.recoveryMode),
  });
  const wizardStep = Math.min(onboardingState?.wizardStep ?? 1, 2) as OnboardingWizardStep;

  const assistantPreparationCompleted = Boolean(
    onboardingState?.assistantPreparationCompleted,
  );

  const unifiedAssistantStatus = useMemo(() => {
    try {
      return resolveUnifiedAssistantStatus({
        appState,
        embedded: embeddedAiConsumerStatus,
        workspaceLoaded: Boolean(workspace),
        assistantPreparationCompleted,
        manualModeAccepted: Boolean(onboardingState?.manualModeAccepted),
      });
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("[continuity] resolveUnifiedAssistantStatus failed", error);
      }
      return {
        canReply: Boolean(appState?.defaultAiCanReply),
        canEnterChat: true,
        showPreparationScreen: false,
        preparation: null,
        headerMessage: "Polaris is preparing",
        bannerMessage: null,
        actionLabel: null,
      };
    }
  }, [
    appState,
    embeddedAiConsumerStatus,
    workspace,
    assistantPreparationCompleted,
    onboardingState?.manualModeAccepted,
  ]);

  const preparationUi = unifiedAssistantStatus.preparation;

  const preparationChecklist = useMemo(
    () =>
      preparationUi
        ? buildOllamaPreparationChecklist({
            workspaceLoaded: Boolean(workspace),
            preparation: preparationUi,
            embeddedPhase: embeddedAiConsumerStatus?.phase ?? null,
            baseUrl: embeddedAiConsumerStatus?.baseUrl ?? null,
          })
        : [],
    [preparationUi, workspace, embeddedAiConsumerStatus?.phase],
  );

  const preparationAssistantName =
    workspace?.assistantName?.trim() || workspace?.name?.trim() || "Polaris";

  const showOnboardingWelcome =
    Boolean(workspace && onboardingState && shouldShowFirstRunWelcome(onboardingState)) &&
    !appState?.recoveryMode &&
    !loading;

  const showPreparationScreen = Boolean(
    !showOnboardingWelcome &&
    unifiedAssistantStatus.showPreparationScreen &&
    preparationUi &&
    !continuity.isE2eReadyAssistant?.()
  );

  const consumerStatusMessage = useMemo(() => {
    const resolved = resolveConsumerStatusMessage({
      unified: unifiedAssistantStatus,
      appState,
      embedded: embeddedAiConsumerStatus,
      provisioningConsumerMessage: provisioningView.consumerMessage,
    });
    if (import.meta.env.DEV) {
      console.log("consumerStatusMessage debug", { scope: "App", consumerStatusMessage: resolved });
    }
    return resolved;
  }, [
    unifiedAssistantStatus,
    appState,
    embeddedAiConsumerStatus,
    provisioningView.consumerMessage,
  ]);

  const persistWizard = useCallback(
    (patch: Partial<OnboardingState>) => {
      if (!workspace) return;
      const next = saveWizardProgress(window.localStorage, workspace.id, {
        wizardStep: patch.wizardStep ?? wizardStep,
        selectedChoice: patch.selectedChoice ?? null,
        connectionTestPassed: patch.connectionTestPassed ?? false,
        preferredProvider: patch.preferredProvider ?? "ollama",
      });
      setOnboardingState(next);
    },
    [workspace, wizardStep],
  );

  const finishOnboarding = useCallback(() => {
    if (!workspace) return;
    const next = completeOnboardingWithProvider(
      window.localStorage,
      workspace.id,
      "ollama",
      Boolean(appState?.providerReady),
    );
    setOnboardingState({ ...next, onboardingCompleted: true, wizardStep: 2 });
    setShowProjectTools(false);
    setRuntimePresence("Ready to chat");
    window.setTimeout(() => setRuntimePresence(null), 4000);

    void (async () => {
      const threadList = await reloadThreads(workspace.id);
      const active = threadList.find((t) => !t.archivedAt && !t.deletedAt);
      if (!active) {
        const thread = await continuity.createThread(workspace.id, "Main");
        await reloadThreads(workspace.id);
        setActiveThread(thread);
        await continuity.setActiveThread(thread.id);
        setMessages([]);
        setMessageTotalCount(0);
        setHasMoreOlderMessages(false);
        setOldestMessageCursor(null);
      }
    })();
  }, [appState?.providerReady, reloadThreads, workspace]);

  const handleOnboardingAdvance = useCallback(() => {
    if (!workspace || wizardStep !== 1) return;
    persistWizard({ wizardStep: 2 });
  }, [persistWizard, wizardStep, workspace]);

  const handleOnboardingBack = useCallback(() => {
    persistWizard({ wizardStep: 1 });
  }, [persistWizard]);

  const handleOnboardingComplete = useCallback(() => {
    if (!workspace) return;
    void (async () => {
      const updated = await continuity.updateAssistantProfile({
        assistantName: assistantNameDraft.trim() || "Assistant",
      });
      setAssistantProfile(updated);
      setAssistantNameDraft(updated.assistantName);
      finishOnboarding();
    })();
  }, [assistantNameDraft, finishOnboarding, workspace]);

  const handleOnboardingDismiss = useCallback(() => {
    finishOnboarding();
  }, [finishOnboarding]);

  const ensureDefaultThread = useCallback(async () => {
    if (!workspace) return;
    const threadList = await reloadThreads(workspace.id);
    const active = threadList.find((t) => !t.archivedAt && !t.deletedAt);
    if (!active) {
      const thread = await continuity.createThread(workspace.id, "Main");
      await reloadThreads(workspace.id);
      setActiveThread(thread);
      await continuity.setActiveThread(thread.id);
      setMessages([]);
      setMessageTotalCount(0);
      setHasMoreOlderMessages(false);
      setOldestMessageCursor(null);
    }
  }, [reloadThreads, workspace]);

  const handlePreparationStartChatting = useCallback(() => {
    if (!workspace) return;
    const next = markAssistantPreparationCompleted(window.localStorage, workspace.id);
    setOnboardingState(next);
    setShowProjectTools(false);
    setRuntimePresence("Ready to chat");
    window.setTimeout(() => setRuntimePresence(null), 4000);
    void ensureDefaultThread();
  }, [ensureDefaultThread, workspace]);

  const handlePreparationContinueWithout = useCallback(() => {
    if (!workspace) return;
    const next = markAssistantPreparationCompleted(window.localStorage, workspace.id, {
      manualMode: true,
    });
    setOnboardingState(next);
    setRuntimePresence("You can chat manually anytime");
    window.setTimeout(() => setRuntimePresence(null), 4000);
    void ensureDefaultThread();
  }, [ensureDefaultThread, workspace]);

  const handlePreparationRetry = useCallback(() => {
    if (!workspace?.id) return;
    if (continuity.restartEmbeddedLocalAi) {
      void continuity.restartEmbeddedLocalAi(workspace.id).then((status) => {
        setEmbeddedAiConsumerStatus(status);
        void refreshAppState();
      });
      return;
    }
    void continuity.prepareEmbeddedLocalAi?.(workspace.id).then((status) => {
      setEmbeddedAiConsumerStatus(status);
      void refreshAppState();
    });
  }, [refreshAppState, workspace?.id]);

  const handlePreparationUseCloud = useCallback(() => {
    setConnectAiModalOpen(true);
  }, []);

  const modelBadge = providerSendEnabled ? activeInAppChat.model ?? null : null;
  const aiStatusLabel = unifiedAssistantStatus.headerMessage;

  const providerPanelProps =
    workspace != null
      ? {
          workspaceId: workspace.id,
          initial: providerConfig,
          initialProviderId: "ollama",
          onSave: handleSaveProvider,
          onTest: handleTestProvider,
          onRemoveKey: handleRemoveProviderKey,
          onOpenUrl: openExternalUrl,
        }
      : null;

  const guidanceCard = resolveGuidanceCard(guidanceState, {
    importedSource: guidanceImportedSource,
    localAiDetected: localAiStatus?.detected ?? null,
    providerReady: providerSendEnabled,
  });
  const activeGuidanceCard = conversationalGuideCard ?? guidanceCard;

  const handleGuideAction = useCallback(
    (action: GuidanceActionId) => {
      setConversationalGuideCard(null);
      if (action === "help") {
        setConversationalGuideCard(
          buildConversationalShellCard({
            message: "help",
            guidanceState,
            localAiDetected: localAiStatus?.detected ?? null,
            workspaceName: workspace?.name ?? null,
          }),
        );
        return;
      }
      if (action === "import_memory") {
        openChatWorkflow("import_memory");
        return;
      }
      if (action === "review_project_memory") {
        openChatWorkflow("review_memory");
        return;
      }
      if (action === "backup_export") {
        openChatWorkflow("backup_export");
        updateGuidance(transitionGuidanceState(guidanceState, "backup_recommended"));
        return;
      }
      if (action === "create_memory_update") {
        openChatWorkflow("create_memory_update");
        return;
      }
      if (action === "set_up_local_ai") {
        setConnectAiModalOpen(true);
        return;
      }
      if (action === "continue_any_ai") {
        openChatWorkflow("continue_any_ai", { requestText: contextPackRequestHint });
      }
    },
    [
      contextPackRequestHint,
      guidanceState,
      localAiStatus?.detected,
      openChatWorkflow,
      updateGuidance,
      workspace?.name,
    ],
  );

  const refreshMemoryDraft = useCallback(async () => {
    if (!workspace) return;
    try {
      const draft = await continuity.previewMemoryCompression({
        workspaceId: workspace.id,
        threadId: activeThread?.id ?? null,
      });
      setMemoryDraft(draft);
    } catch {
      // silently ignore
    }
  }, [continuity, workspace, activeThread?.id]);

  const handleMemoryUpdateApplied = useCallback(async () => {
    setMessagesSinceLastUpdate(0);
    setMemoryUpdateSuggestionVisible(false);
    await refreshMemoryDraft();
  }, [refreshMemoryDraft]);

  // Derive consumer memory state
  const memorySnapshot = useMemo(
    () => buildProjectMemorySnapshot(memoryDraft),
    [memoryDraft],
  );
  const resumeCardData = useMemo(
    () => buildResumeCard(memorySnapshot),
    [memorySnapshot],
  );

  if (loading) {
    const phaseLabel =
      startupPhase === "migrating"
        ? "Applying database migrations..."
        : startupPhase === "loading"
          ? "Loading workspace..."
          : "Starting ContinuityOS...";
    return (
      <div className="app-shell loading">
        <p>{phaseLabel}</p>
        <p className="muted small">Almost there...</p>
      </div>
    );
  }

  return (
    <div className="app-shell" data-testid="app-shell">
      {appState?.recoveryMode && (
        <RecoveryBanner
          message={appState.recoveryMessage ?? "Database unavailable"}
          workspaceId={appState.activeWorkspaceId}
          onExportBackup={
            appState.activeWorkspaceId
              ? () => void handleExport()
              : undefined
          }
          onOpenDiagnostics={() => setShowDiagnostics(true)}
        />
      )}
      {recoveryPresentation.banner && !appState?.recoveryMode && (
        <div
          className={`reliability-banner${appState?.previousSessionCrashed ? " warn" : ""}`}
          role="status"
        >
          <p>{recoveryPresentation.banner}</p>
          <button
            type="button"
            className="secondary small-btn"
            onClick={() => setShowRecoveryDetails(true)}
          >
            Details
          </button>
        </div>
      )}
      {runtimePresence && (
        <div className="runtime-presence" role="status" aria-live="polite">
          {runtimePresence}
        </div>
      )}
      {!appState?.recoveryMode && appState?.reliabilityMessage && !appState.previousSessionCrashed && (
        <div className="reliability-banner" role="status">
          <p>{appState.reliabilityMessage}</p>
        </div>
      )}
      {appState?.downgradeDetected && (
        <div className="reliability-banner warn" role="alert">
          <p>
            This database was created with a newer app version. Update ContinuityOS before
            making changes.
          </p>
        </div>
      )}
      {exportMessage && !dismissedExportMessage && (
        <div className="reliability-banner" role="status">
          <p>{exportMessage}</p>
          <button
            type="button"
            className="secondary small-btn banner-dismiss"
            onClick={() => setDismissedExportMessage(true)}
          >
            Dismiss
          </button>
        </div>
      )}

      <input
        ref={importInputRef}
        data-testid="import-backup-input"
        type="file"
        accept="application/json,.json"
        className="file-input-offscreen"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleImportFile(file);
          e.target.value = "";
        }}
      />
      <input
        ref={encryptedImportInputRef}
        type="file"
        accept="application/json,.json"
        className="file-input-offscreen"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleEncryptedImportFile(file);
          e.target.value = "";
        }}
      />

      {showPreparationScreen && preparationUi && (
        <AssistantPreparationScreen
          status={preparationUi}
          assistantDisplayName={preparationAssistantName}
          checklist={preparationChecklist}
          onRetry={handlePreparationRetry}
          onUseCloudAi={handlePreparationUseCloud}
          onContinueWithoutAi={handlePreparationContinueWithout}
          onStartChatting={handlePreparationStartChatting}
        />
      )}

      {!showPreparationScreen && (
        <>
      <WorkspaceHeader
        workspace={workspace}
        subtitle={workspaceSubtitle}
        ollamaStatusLabel={aiStatusLabel}
        projectToolsOpen={showProjectTools}
        onToggleProjectTools={() => setShowProjectTools((value) => !value)}
      />
      {showOnboardingWelcome && workspace && (
        <OnboardingWizard
          step={wizardStep}
          assistantName={assistantNameDraft}
          onAssistantNameChange={setAssistantNameDraft}
          onAdvance={handleOnboardingAdvance}
          onBack={handleOnboardingBack}
          onComplete={handleOnboardingComplete}
          onDismiss={handleOnboardingDismiss}
        />
      )}
      <TransferStatusBanner
        state={transferUx}
        onDismiss={() => setTransferUx({ phase: "idle" })}
      />
      {!localAiBannerDismissed &&
        unifiedAssistantStatus.bannerMessage &&
        !appState?.recoveryMode &&
        !showOnboardingWelcome && (
          <div className="reliability-banner info local-ai-banner" role="status" data-testid="embedded-ai-preparing-banner">
            <p data-testid="ai-status-banner-message">
              {unifiedAssistantStatus.bannerMessage}
            </p>
            {embeddedAiConsumerStatus?.progressPercent != null &&
              appState?.defaultAiRouteStatus === "downloading" && (
              <p className="muted small" data-testid="embedded-ai-progress">
                {embeddedAiConsumerStatus.detail} � {embeddedAiConsumerStatus.progressPercent}%
              </p>
            )}
            <div className="local-ai-banner-actions">
              <button
                type="button"
                className="secondary small-btn"
                data-testid="connect-ai-banner"
                onClick={() => setConnectAiModalOpen(true)}
              >
                Connect AI
              </button>
              <button
                type="button"
                className="secondary small-btn"
                data-testid="local-ai-banner-dismiss"
                onClick={() => setLocalAiBannerDismissed(true)}
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

      {/* Resume card: shown on workspace open when memory exists, dismissible */}
      {/* Smart memory update suggestion */}
      <MemoryUpdateSuggestion
        visible={memoryUpdateSuggestionVisible && !streaming}
        onPreview={() => {
          setMemoryUpdateSuggestionVisible(false);
          openChatWorkflow("create_memory_update");
        }}
        onDismiss={() => setMemoryUpdateSuggestionVisible(false)}
      />

      <div className={`main-row${showProjectTools ? " with-tools" : " manual-first-layout"}`}>
        <ThreadSidebar
          threads={threads}
          activeThreadId={activeThread?.id ?? null}
          disabled={appState?.recoveryMode ?? false}
          showArchived={showArchivedThreads}
          showDeleted={showDeletedThreads}
          onToggleShowArchived={(value) => {
            setShowArchivedThreads(value);
            if (workspace) void reloadThreads(workspace.id, value, showDeletedThreads);
          }}
          onToggleShowDeleted={(value) => {
            setShowDeletedThreads(value);
            if (workspace) void reloadThreads(workspace.id, showArchivedThreads, value);
          }}
          onSelect={handleSelectThread}
          onCreate={handleCreateThread}
          onRename={handleRenameThread}
          onMoveUp={handleMoveThreadUp}
          onMoveDown={handleMoveThreadDown}
          onArchive={handleArchiveThread}
          onUnarchive={handleUnarchiveThread}
          onDelete={handleDeleteThread}
          onRestore={handleRestoreThread}
        />
        <div className="chat-column" data-testid="chat-column">
        {false && resumeCard && activeThread?.id === resumeCard.threadId && messages.length > 0 && (
          <section className="resume-card" data-testid="polaris-resume-card">
            <div>
              <p className="eyebrow">Welcome back</p>
              <h2>Continue where you left off</h2>
              <p className="muted small">
                Thread: <strong>{resumeCard.threadTitle}</strong> � {resumeCard.messageCount} saved messages
              </p>
              {resumeCard.lastUserMessage && (
                <p className="muted small">
                  Last thing you asked: �{resumeCard.lastUserMessage}�
                </p>
              )}
              {resumeCard.lastAssistantMessage && (
                <p className="muted small">
                  Last Polaris reply: �{resumeCard.lastAssistantMessage}�
                </p>
              )}
            </div>
            <button type="button" className="ghost-button" onClick={() => setResumeCard(null)}>
              Dismiss
            </button>
          </section>
        )}
        <ChatPanel
          thread={activeThread}
          assistantName={assistantProfile?.assistantName ?? assistantNameDraft}
          workspaceId={workspace?.id ?? null}
          workspaceName={workspace?.name ?? null}
          continuitySummary={workspace?.continuitySummary ?? null}
          messages={messages}
          switching={threadSwitching}
          totalCount={messageTotalCount}
          hasMoreOlder={hasMoreOlderMessages}
          loadingOlder={loadingOlderMessages}
          onLoadOlder={() => void handleLoadOlderMessages()}
          providerReady={providerSendEnabled}
          providerSetupRequired={appState?.providerSetupRequired ?? false}
          providerLabel={providerBadge}
          modelBadge={`${modelBadge} | ${memoryRuntimeLabel}`}
          streaming={streaming}
          streamError={streamError}
          manualFallback={manualFallback}
          onSend={handleSendMessage}
          onRestoreSavePoint={handleRestoreSavePoint}
          onBuildContextPack={handleBuildContextPack}
          onSaveManualAssistantResponse={handleSaveManualAssistantResponse}
          onCancelStream={handleCancelStream}
          guidanceCard={activeGuidanceCard}
          hasConversationalGuide={conversationalGuideCard != null}
          chatWorkflow={chatWorkflow}
          chatWorkflowTick={chatWorkflowTick}
          contextPackRequestHint={contextPackRequestHint}
          onGuideAction={handleGuideAction}
          onOpenWorkflow={openChatWorkflow}
          onCloseWorkflow={closeChatWorkflow}
          onOpenProjectTools={openProjectToolsFromChat}
          onApplyContinuityImport={handleApplyWorkflowImport}
          onContextPackCopied={() =>
            updateGuidance(transitionGuidanceState(guidanceState, "context_pack_copied"))
          }
          onManualResponseSaved={() =>
            updateGuidance(transitionGuidanceState(guidanceState, "manual_response_saved"))
          }
          onRefreshLocalAiStatus={() => refreshLocalAiStatus(workspace?.id)}
          onRefreshEmbeddedLocalAiStatus={refreshEmbeddedLocalAiStatus}
          onPreviewMemoryCompression={() =>
            continuity.previewMemoryCompression({
              workspaceId: workspace?.id ?? "",
              threadId: activeThread?.id ?? null,
            })
          }
          onUseLocalAi={handleUseLocalAi}
          onConnectAi={() => setConnectAiModalOpen(true)}
          autosaveStatus={autosaveStatus}
          consumerStatusMessage={consumerStatusMessage}
          disabled={appState?.recoveryMode ?? false}
        />
        </div>
        {showProjectTools && (
          <OpsSidebar
            activeTab={opsTab}
            onTabChange={setOpsTab}
            onClose={() => setShowProjectTools(false)}
            onBackToChat={() => setShowProjectTools(false)}
            appState={appState}
            autosaveStatus={autosaveStatus}
            workspaceHealth={workspaceHealth}
            healthLoading={healthLoading}
            timelineGroups={timelineGroups}
            snapshots={snapshots}
            workspaceId={workspace?.id ?? null}
            threadId={activeThread?.id ?? null}
            recoveryMode={appState?.recoveryMode ?? false}
            exporting={exporting}
            providerPanel={providerPanelProps}
            providerConfig={providerConfig}
            localAiStatus={localAiStatus}
            embeddedAiConsumerStatus={embeddedAiConsumerStatus}
            onOpenRecoveryDetails={() => setShowRecoveryDetails(true)}
            onConnectAi={() => setConnectAiModalOpen(true)}
            onImport={() => importInputRef.current?.click()}
            onImportEncrypted={openEncryptedImportPicker}
            onExport={() => void handleExport()}
            onEncryptedExport={handleEncryptedExport}
            onOpenDiagnostics={() => setShowDiagnostics(true)}
            onCreateSnapshot={handleCreateSnapshot}
            onRestorePreview={continuity.getRestorePreview}
            onRestore={continuity.restoreSnapshot}
            onRestored={handleAfterRestore}
            continuitySummary={workspace?.continuitySummary ?? null}
            onSaveContinuitySummary={handleSaveContinuitySummary}
            onContinuityImported={handleContinuityImported}
            focusTarget={opsFocusTarget}
            focusTick={opsFocusTick}
            memoryDraft={memoryDraft}
            messagesSinceLastUpdate={messagesSinceLastUpdate}
            onCreateMemoryUpdate={() => openChatWorkflow("create_memory_update")}
            onReviewMemory={() => openChatWorkflow("review_memory")}
            workspace={workspace}
            onSaveWorkspaceProfile={handleSaveWorkspaceProfile}
            assistantProfile={assistantProfile}
            onSaveAssistantProfile={handleSaveAssistantProfile}
            onSaveProvider={handleSaveProvider}
            onTestProvider={handleTestProvider}
            onOpenProviderUrl={openExternalUrl}
          />
        )}
      </div>

      <AppFooter appState={appState} />
        </>
      )}

      {showEncryptedExport && workspace && (
        <EncryptedExportDialog
          workspaceName={workspace.name}
          exporting={exporting}
          onClose={() => setShowEncryptedExport(false)}
          onExport={runEncryptedExportWithPassword}
        />
      )}

      {encryptedImport && (
        <EncryptedImportFlow
          json={encryptedImport.json}
          fileName={encryptedImport.fileName}
          onClose={() => setEncryptedImport(null)}
          onPreview={(json, password) =>
            continuity.previewEncryptedImport(json, password)
          }
          onConfirmImport={async (json, password) => {
            setImporting(true);
            try {
              const result = await continuity.importEncryptedWorkspace(
                json,
                password,
              );
              setExportMessage(result.message);
              if (result.ok && result.workspace) {
                await continuity.setActiveWorkspace(result.workspace.id);
                await loadWorkspace(result.workspace);
                setEncryptedImport(null);
              } else if (!result.ok) {
                throw new Error(result.message);
              }
            } catch (err) {
              const message =
                err instanceof Error ? err.message : "Encrypted import failed.";
              setExportMessage(message);
              if (import.meta.env.DEV) {
                console.error("[continuity] encrypted import failed", err);
              }
              throw err instanceof Error ? err : new Error(message);
            } finally {
              setImporting(false);
            }
          }}
        />
      )}

      {importPreview && (
        <ImportPreviewModal
          preview={importPreview}
          importing={importing}
          onConfirm={() => void handleConfirmImport()}
          onClose={() => {
            setImportPreview(null);
            setImportJson(null);
          }}
        />
      )}

      {showDiagnostics && (
        <Suspense fallback={null}>
          <DiagnosticsPanel
            workspaceId={workspace?.id ?? null}
            workspaceIds={workspace ? [workspace.id] : []}
            onboarding={onboardingState}
            appState={appState}
            embeddedAiConsumerStatus={embeddedAiConsumerStatus}
            threads={threads}
            loading={loading}
            onExperienceReset={() => {
              if (workspace) {
                setOnboardingState(freshOnboardingState());
                void loadWorkspace(workspace);
                void refreshAppState();
              }
            }}
            onClose={() => setShowDiagnostics(false)}
          />
        </Suspense>
      )}
      {showContinuityInspector && (
        <Suspense fallback={null}>
          <ContinuityInspectorModal
            open={showContinuityInspector}
            report={continuityInspectorReport}
            onClose={() => setShowContinuityInspector(false)}
          />
        </Suspense>
      )}
      <RecoveryDetailsModal
        open={showRecoveryDetails}
        appState={appState}
        autosaveStatus={autosaveStatus}
        onClose={() => setShowRecoveryDetails(false)}
      />

      <ConnectAiModal
        open={connectAiModalOpen}
        preparing={
          appState?.defaultAiRouteStatus === "preparing" ||
          appState?.defaultAiRouteStatus === "downloading" ||
          appState?.defaultAiRouteStatus === "starting"
        }
        onClose={() => setConnectAiModalOpen(false)}
        onContinuePreparing={() => {
          setConnectAiModalOpen(false);
          if (workspace?.id && continuity.prepareEmbeddedLocalAi) {
            void continuity.prepareEmbeddedLocalAi(workspace.id);
          }
        }}
        onUseCloudAi={() => {
          setConnectAiModalOpen(false);
          setShowProjectTools(true);
          setOpsTab("settings");
        }}
        onContinueWithoutAi={() => setConnectAiModalOpen(false)}
        onOpenAdvanced={() => {
          setConnectAiModalOpen(false);
          setShowProjectTools(true);
          setOpsTab("settings");
          setOpsFocusTarget("local-ai");
          setOpsFocusTick((value) => value + 1);
        }}
      />
    </div>
  );
}



































