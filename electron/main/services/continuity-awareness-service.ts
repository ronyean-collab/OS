import { v4 as uuid } from "uuid";
import type Database from "better-sqlite3";
import type { Message } from "../../../src/shared/types";
import {
  extractOpenQuestions,
  extractProjectDecisions,
  type DecisionRecord,
  type OpenQuestionRecord,
} from "./continuity-intelligence-service";
import {
  extractActiveProjects,
  extractLongTermGoals,
  extractAssistantHistory,
  type ActiveProject,
  type AssistantHistoryEntry,
  type LongTermGoal,
} from "./ai-life-service";
import {
  buildContinuityFeelingBlock,
  buildMemoryStateContextBlock,
  buildRelevantFragmentsContextBlock,
  getMemoryState,
  listRelevantMemoryFragments,
  scoreContinuityReconstruction,
} from "./memory-state-service";
import { assembleProviderContext, estimateTokensPlaceholder } from "./context-assembly";
import { getWorkspaceById } from "./workspace-service";

/** Minimum relevance to surface an item — only highly relevant continuity appears. */
export const RELEVANCE_SURFACE_THRESHOLD = 0.42;

/** Minimum awareness confidence before trimming legacy memory injection. */
export const AWARENESS_TRIM_THRESHOLD = 0.55;

const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "with",
  "by",
  "from",
  "as",
  "is",
  "was",
  "are",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "can",
  "i",
  "me",
  "my",
  "we",
  "our",
  "you",
  "your",
  "it",
  "its",
  "this",
  "that",
  "what",
  "how",
  "when",
  "where",
  "why",
  "who",
  "about",
  "just",
  "also",
  "please",
  "help",
  "need",
  "want",
  "like",
  "get",
  "make",
  "use",
  "using",
]);

/** General-knowledge queries that should not pull unrelated project continuity. */
const GENERAL_KNOWLEDGE_RE =
  /\b(how (?:do|to) (?:i )?(?:cook|bake|make)|recipe for|cook(?:ing)? rice|bake a|weather in|capital of|define (?:the )?|meaning of|translate (?:this )?to|math problem|calculate \d+\s*[\+\-\*\/])\b/i;

const OPERATIONAL_HINT_RE =
  /\b(continuity|provider|project|goal|milestone|ship|launch|build|coach|adapter|workspace|objective|decision|status update|continue the|working on)\b/i;

function isGeneralKnowledgeQuery(message: string): boolean {
  const trimmed = message.trim();
  if (!GENERAL_KNOWLEDGE_RE.test(trimmed)) return false;
  return !OPERATIONAL_HINT_RE.test(trimmed);
}

const MEMORY_SAFETY_INSTRUCTIONS = [
  "Continuity awareness (supporting context only — conversation message history is canonical truth):",
  "Use only the continuity items listed below when they clearly relate to the user's current message.",
  "Do not announce that you remembered, retrieved, or read from a database.",
  "Never fabricate history, continuity, memory, goals, or project details.",
  "If continuity context is missing or uncertain, say so plainly rather than inventing details.",
  "Do not force unrelated goals or projects into the reply.",
].join("\n");

export type ScoredItem<T> = {
  item: T;
  relevanceScore: number;
  awarenessScore: number;
  confidenceScore: number;
};

export type AwarenessConfidenceMetrics = {
  awarenessConfidence: number;
  projectConfidence: number;
  goalConfidence: number;
  continuityConfidence: number;
  memoryConfidence: number;
};

export type ConversationAwarenessResult = {
  awarenessBlock: string | null;
  aiLifeBlock: string | null;
  continuityIntelligenceBlock: string | null;
  relevantGoals: ScoredItem<LongTermGoal>[];
  relevantProjects: ScoredItem<ActiveProject>[];
  relevantContinuity: {
    decisions: ScoredItem<DecisionRecord>[];
    openQuestions: ScoredItem<OpenQuestionRecord>[];
  };
  relevantHistory: ScoredItem<AssistantHistoryEntry>[];
  confidence: AwarenessConfidenceMetrics;
  relevanceScore: number;
  awarenessScore: number;
  confidenceScore: number;
  suppressLegacyMemory: boolean;
  legacyContextChars: number;
  awarenessContextChars: number;
  contextReductionRatio: number;
};

export type AwarenessScaleResult = {
  messageCount: number;
  rebuildSuccess: boolean;
  goalsRelevant: number;
  projectsRelevant: number;
  continuityRelevant: number;
  awarenessConfidence: number;
  durationMs: number;
};

function truncate(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

function uniqueTokens(text: string): Set<string> {
  return new Set(tokenize(text));
}

function extractNameTokens(name: string): string[] {
  const parts = name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[\s_-]+/)
    .filter((part) => part.length >= 3);
  return [...new Set([...parts, name.toLowerCase()])];
}

function overlapScore(messageTokens: Set<string>, targetText: string, boostTerms: string[] = []): number {
  const targetTokens = uniqueTokens(targetText);
  const lowerMessage = [...messageTokens].join(" ");
  const lowerTarget = targetText.toLowerCase();

  if (targetTokens.size === 0) return 0;

  let overlap = 0;
  for (const token of messageTokens) {
    if (targetTokens.has(token)) overlap += 1;
    if (token.length >= 5 && lowerTarget.includes(token)) overlap += 0.5;
  }

  let boost = 0;
  for (const term of boostTerms) {
    const normalized = term.toLowerCase().trim();
    if (normalized.length >= 3 && lowerTarget.includes(normalized)) {
      boost += 0.25;
    }
    if (normalized.length >= 3 && lowerMessage.includes(normalized)) {
      boost += 0.2;
    }
  }

  for (const token of messageTokens) {
    if (token.length >= 5 && lowerTarget.includes(token)) {
      boost += 0.15;
    }
  }

  const base =
    messageTokens.size === 0
      ? 0
      : overlap / Math.max(2, Math.min(messageTokens.size, targetTokens.size));
  return Math.min(1, base + boost);
}

function scoreTriple(
  message: string,
  targetText: string,
  boostTerms: string[] = [],
  recencyBoost = 0,
): { relevanceScore: number; awarenessScore: number; confidenceScore: number } {
  const messageTokens = uniqueTokens(message);
  const lowerMessage = message.toLowerCase();

  for (const term of boostTerms) {
    const nameTokens = extractNameTokens(term);
    for (const token of nameTokens) {
      if (token.length >= 4 && lowerMessage.includes(token)) {
        messageTokens.add(token);
      }
    }
  }

  const relevanceScore = overlapScore(messageTokens, targetText, boostTerms);
  const explicitBoost =
    boostTerms.some((term) => term.length >= 3 && lowerMessage.includes(term.toLowerCase())) ? 0.18 : 0;
  const sharedKeywordBoost =
    [...messageTokens].some((token) => token.length >= 5 && targetText.toLowerCase().includes(token)) ? 0.22 : 0;
  const awarenessScore = Math.min(
    1,
    relevanceScore * 0.72 + explicitBoost + sharedKeywordBoost + recencyBoost,
  );
  const confidenceScore = Math.min(
    1,
    relevanceScore * 0.65 + (explicitBoost > 0 ? 0.2 : 0) + sharedKeywordBoost * 0.5 + recencyBoost * 0.5,
  );
  return {
    relevanceScore: Number(Math.max(relevanceScore, sharedKeywordBoost > 0 ? 0.45 : relevanceScore).toFixed(3)),
    awarenessScore: Number(awarenessScore.toFixed(3)),
    confidenceScore: Number(confidenceScore.toFixed(3)),
  };
}

function extractBoostTerms(message: string, projects: ActiveProject[], goals: LongTermGoal[]): string[] {
  const terms: string[] = [];
  const lower = message.toLowerCase();
  for (const project of projects) {
    if (lower.includes(project.projectName.toLowerCase())) {
      terms.push(project.projectName);
    }
    for (const token of extractNameTokens(project.projectName)) {
      if (lower.includes(token)) terms.push(token);
    }
  }
  for (const goal of goals) {
    const words = goal.goal.split(/\s+/).filter((w) => w.length >= 5);
    for (const word of words) {
      if (lower.includes(word.toLowerCase())) terms.push(word);
    }
  }
  return [...new Set(terms)];
}

function messageMentionsProject(message: string, projectName: string): boolean {
  const lower = message.toLowerCase();
  return extractNameTokens(projectName).some((token) => token.length >= 4 && lower.includes(token));
}

function shouldSurfaceProject(message: string, entry: ScoredItem<ActiveProject>): boolean {
  if (entry.relevanceScore < RELEVANCE_SURFACE_THRESHOLD) return false;
  if (entry.relevanceScore >= 0.72) return true;
  if (messageMentionsProject(message, entry.item.projectName)) return true;
  const objective = entry.item.currentObjective.toLowerCase();
  return [...uniqueTokens(message)].some((token) => token.length >= 6 && objective.includes(token));
}

function mapScored<T>(
  items: T[],
  message: string,
  textSelector: (item: T) => string,
  boostTerms: string[],
): ScoredItem<T>[] {
  return items
    .map((item) => {
      const scores = scoreTriple(message, textSelector(item), boostTerms);
      return { item, ...scores };
    })
    .filter((entry) => entry.relevanceScore >= RELEVANCE_SURFACE_THRESHOLD)
    .sort((a, b) => b.relevanceScore - a.relevanceScore);
}

export function determineRelevantContinuity(
  db: Database.Database,
  workspaceId: string,
  threadId: string,
  currentMessage: string,
  projects: ActiveProject[],
  goals: LongTermGoal[],
): ConversationAwarenessResult["relevantContinuity"] {
  if (isGeneralKnowledgeQuery(currentMessage)) {
    return { decisions: [], openQuestions: [] };
  }

  const boostTerms = extractBoostTerms(currentMessage, projects, goals);
  const decisions = extractProjectDecisions(db, workspaceId, threadId);
  const openQuestions = extractOpenQuestions(db, workspaceId, threadId);

  return {
    decisions: mapScored(
      decisions,
      currentMessage,
      (d) => `${d.title} ${d.description}`,
      boostTerms,
    ).slice(0, 4),
    openQuestions: mapScored(
      openQuestions.filter((q) => q.status === "open"),
      currentMessage,
      (q) => q.question,
      boostTerms,
    ).slice(0, 3),
  };
}

export function determineRelevantProjects(
  db: Database.Database,
  workspaceId: string,
  threadId: string,
  currentMessage: string,
  goals: LongTermGoal[],
): ScoredItem<ActiveProject>[] {
  if (isGeneralKnowledgeQuery(currentMessage)) {
    return [];
  }

  const projects = extractActiveProjects(db, workspaceId, threadId).filter(
    (p) => p.status === "active" || p.status === "paused",
  );
  const boostTerms = extractBoostTerms(currentMessage, projects, goals);
  return projects
    .map((project) => {
      const scores = scoreTriple(
        currentMessage,
        `${project.projectName} ${project.currentObjective}`,
        boostTerms,
      );
      return { item: project, ...scores };
    })
    .filter((entry) => shouldSurfaceProject(currentMessage, entry))
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, 5);
}

export function determineRelevantGoals(
  db: Database.Database,
  workspaceId: string,
  threadId: string,
  currentMessage: string,
): ScoredItem<LongTermGoal>[] {
  if (isGeneralKnowledgeQuery(currentMessage)) {
    return [];
  }

  const goals = extractLongTermGoals(db, workspaceId, threadId).filter(
    (g) => g.status === "active" || g.status === "paused",
  );
  const projects = extractActiveProjects(db, workspaceId, threadId);
  const boostTerms = extractBoostTerms(currentMessage, projects, goals);
  return mapScored(goals, currentMessage, (g) => g.goal, boostTerms).slice(0, 4);
}

export function determineRelevantHistory(
  db: Database.Database,
  workspaceId: string,
  currentMessage: string,
  projects: ScoredItem<ActiveProject>[],
  goals: ScoredItem<LongTermGoal>[],
): ScoredItem<AssistantHistoryEntry>[] {
  if (isGeneralKnowledgeQuery(currentMessage)) {
    return [];
  }

  const history = extractAssistantHistory(db, workspaceId);
  const boostTerms = [
    ...projects.map((p) => p.item.projectName),
    ...goals.flatMap((g) => tokenize(g.item.goal).slice(0, 2)),
  ];
  return mapScored(
    history,
    currentMessage,
    (h) => `${h.eventTitle} ${h.eventDescription}`,
    boostTerms,
  ).slice(0, 2);
}

export function calculateAwarenessConfidence(input: {
  relevantGoals: ScoredItem<LongTermGoal>[];
  relevantProjects: ScoredItem<ActiveProject>[];
  relevantContinuity: ConversationAwarenessResult["relevantContinuity"];
  relevantHistory: ScoredItem<AssistantHistoryEntry>[];
  memoryConfidence: number;
  generalKnowledgeQuery: boolean;
}): AwarenessConfidenceMetrics {
  const avg = (values: number[]) =>
    values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;

  const goalConfidence = input.generalKnowledgeQuery
    ? 0.9
    : avg(input.relevantGoals.map((g) => g.confidenceScore));
  const projectConfidence = input.generalKnowledgeQuery
    ? 0.9
    : avg(input.relevantProjects.map((p) => p.confidenceScore));
  const continuityConfidence = input.generalKnowledgeQuery
    ? 0.92
    : avg([
        ...input.relevantContinuity.decisions.map((d) => d.confidenceScore),
        ...input.relevantContinuity.openQuestions.map((q) => q.confidenceScore),
      ]);
  const memoryConfidence = input.memoryConfidence;
  const awarenessConfidence = Number(
    Math.min(
      0.99,
      goalConfidence * 0.22 +
        projectConfidence * 0.28 +
        continuityConfidence * 0.28 +
        memoryConfidence * 0.22,
    ).toFixed(3),
  );

  return {
    awarenessConfidence,
    projectConfidence: Number(projectConfidence.toFixed(3)),
    goalConfidence: Number(goalConfidence.toFixed(3)),
    continuityConfidence: Number(continuityConfidence.toFixed(3)),
    memoryConfidence: Number(memoryConfidence.toFixed(3)),
  };
}

function buildAiLifeBlock(relevantGoals: ScoredItem<LongTermGoal>[], relevantProjects: ScoredItem<ActiveProject>[]): string | null {
  const lines: string[] = [];
  if (relevantGoals.length) {
    lines.push("Relevant long-term goals:");
    for (const entry of relevantGoals) {
      lines.push(`- ${truncate(entry.item.goal, 160)}`);
    }
  }
  if (relevantProjects.length) {
    lines.push("Relevant active projects:");
    for (const entry of relevantProjects) {
      lines.push(
        `- ${truncate(entry.item.projectName, 80)}: ${truncate(entry.item.currentObjective, 140)}`,
      );
    }
  }
  return lines.length ? lines.join("\n") : null;
}

function buildContinuityIntelligenceBlock(
  relevantContinuity: ConversationAwarenessResult["relevantContinuity"],
): string | null {
  const lines: string[] = [];
  if (relevantContinuity.decisions.length) {
    lines.push("Relevant project decisions:");
    for (const entry of relevantContinuity.decisions) {
      lines.push(`- ${truncate(entry.item.title, 100)}: ${truncate(entry.item.description, 160)}`);
    }
  }
  if (relevantContinuity.openQuestions.length) {
    lines.push("Relevant open questions:");
    for (const entry of relevantContinuity.openQuestions) {
      lines.push(`- ${truncate(entry.item.question, 180)}`);
    }
  }
  return lines.length ? lines.join("\n") : null;
}

function buildAwarenessBlock(input: {
  aiLifeBlock: string | null;
  continuityIntelligenceBlock: string | null;
  relevantHistory: ScoredItem<AssistantHistoryEntry>[];
  generalKnowledgeQuery: boolean;
}): string | null {
  const sections: string[] = [MEMORY_SAFETY_INSTRUCTIONS];

  if (input.generalKnowledgeQuery) {
    sections.push(
      "The current message appears to be a general topic unrelated to stored projects. Do not reference unrelated project continuity.",
    );
    return sections.join("\n\n");
  }

  if (input.aiLifeBlock) sections.push(input.aiLifeBlock);
  if (input.continuityIntelligenceBlock) sections.push(input.continuityIntelligenceBlock);
  if (input.relevantHistory.length) {
    sections.push(
      "Relevant assistant relationship notes:",
      ...input.relevantHistory.map(
        (h) => `- ${truncate(h.item.eventTitle, 80)}: ${truncate(h.item.eventDescription, 120)}`,
      ),
    );
  }

  if (sections.length === 1) {
    sections.push("No highly relevant continuity items for this message — rely on conversation history.");
  }

  return sections.join("\n\n");
}

function measureLegacyContextChars(input: {
  workspaceName: string;
  continuitySummary: string | null;
  memoryStateBlock: string | null;
  relevantFragmentsBlock: string | null;
  continuityFeelingBlock: string | null;
  messages: Message[];
}): number {
  const legacy = assembleProviderContext({
    workspaceName: input.workspaceName,
    continuitySummary: input.continuitySummary,
    memoryStateBlock: input.memoryStateBlock,
    relevantFragmentsBlock: input.relevantFragmentsBlock,
    continuityFeelingBlock: input.continuityFeelingBlock,
    messages: input.messages,
  });
  return legacy.messages.reduce((sum, m) => sum + m.content.length, 0);
}

export function buildConversationAwarenessContext(
  db: Database.Database,
  input: {
    workspaceId: string;
    threadId: string;
    currentMessage: string;
    recentMessages: Message[];
    workspaceName?: string;
    continuitySummary?: string | null;
  },
): ConversationAwarenessResult {
  const generalKnowledgeQuery = isGeneralKnowledgeQuery(input.currentMessage);
  const goals = determineRelevantGoals(db, input.workspaceId, input.threadId, input.currentMessage);
  const allGoals = extractLongTermGoals(db, input.workspaceId, input.threadId);
  const allProjects = extractActiveProjects(db, input.workspaceId, input.threadId);
  const projects = determineRelevantProjects(
    db,
    input.workspaceId,
    input.threadId,
    input.currentMessage,
    allGoals,
  );
  const relevantContinuity = determineRelevantContinuity(
    db,
    input.workspaceId,
    input.threadId,
    input.currentMessage,
    allProjects,
    allGoals,
  );
  const relevantHistory = determineRelevantHistory(
    db,
    input.workspaceId,
    input.currentMessage,
    projects,
    goals,
  );

  const memoryState = getMemoryState(db, input.workspaceId, input.threadId);
  const fragments = listRelevantMemoryFragments(db, {
    workspaceId: input.workspaceId,
    threadId: input.threadId,
    query: input.currentMessage,
  });
  const reconstruction = scoreContinuityReconstruction(db, {
    workspaceId: input.workspaceId,
    threadId: input.threadId,
    query: input.currentMessage,
  });
  const feelingBlock = buildContinuityFeelingBlock({ state: memoryState, fragments });
  const memoryStateBlock = buildMemoryStateContextBlock(memoryState);
  const relevantFragmentsBlock = buildRelevantFragmentsContextBlock(fragments);
  const ws = getWorkspaceById(db, input.workspaceId);
  const workspaceName = input.workspaceName ?? ws?.name ?? "Workspace";
  const continuitySummary = input.continuitySummary ?? ws?.continuitySummary ?? null;

  const confidence = calculateAwarenessConfidence({
    relevantGoals: goals,
    relevantProjects: projects,
    relevantContinuity,
    relevantHistory,
    memoryConfidence: reconstruction.continuityConfidenceScore,
    generalKnowledgeQuery,
  });

  const aiLifeBlock = buildAiLifeBlock(goals, projects);
  const continuityIntelligenceBlock = buildContinuityIntelligenceBlock(relevantContinuity);
  const awarenessBlock = buildAwarenessBlock({
    aiLifeBlock,
    continuityIntelligenceBlock,
    relevantHistory,
    generalKnowledgeQuery,
  });

  const legacyContextChars = measureLegacyContextChars({
    workspaceName,
    continuitySummary,
    memoryStateBlock,
    relevantFragmentsBlock,
    continuityFeelingBlock: feelingBlock,
    messages: input.recentMessages,
  });

  const awarenessOnly = assembleProviderContext({
    workspaceName,
    awarenessContextBlock: awarenessBlock,
    aiLifeAwarenessBlock: aiLifeBlock,
    continuityIntelligenceBlock,
    messages: input.recentMessages,
  });
  const awarenessContextChars = awarenessOnly.messages.reduce((sum, m) => sum + m.content.length, 0);
  const contextReductionRatio =
    legacyContextChars > 0
      ? Number(((legacyContextChars - awarenessContextChars) / legacyContextChars).toFixed(3))
      : 0;

  const suppressLegacyMemory =
    generalKnowledgeQuery ||
    (confidence.awarenessConfidence >= AWARENESS_TRIM_THRESHOLD &&
      !aiLifeBlock &&
      !continuityIntelligenceBlock);

  const topRelevance = Math.max(
    0,
    ...goals.map((g) => g.relevanceScore),
    ...projects.map((p) => p.relevanceScore),
    ...relevantContinuity.decisions.map((d) => d.relevanceScore),
    ...relevantContinuity.openQuestions.map((q) => q.relevanceScore),
  );

  return {
    awarenessBlock,
    aiLifeBlock,
    continuityIntelligenceBlock,
    relevantGoals: goals,
    relevantProjects: projects,
    relevantContinuity,
    relevantHistory,
    confidence,
    relevanceScore: Number(topRelevance.toFixed(3)),
    awarenessScore: confidence.awarenessConfidence,
    confidenceScore: confidence.awarenessConfidence,
    suppressLegacyMemory,
    legacyContextChars,
    awarenessContextChars,
    contextReductionRatio,
  };
}

export function generateAwarenessEfficiencyReport(
  samples: Array<{
    label: string;
    legacyContextChars: number;
    awarenessContextChars: number;
    contextReductionRatio: number;
    suppressLegacyMemory: boolean;
  }>,
): string {
  const lines: string[] = [
    "# Awareness Efficiency Report",
    "",
    "ContinuityOS Phase 15 — prompt size comparison between legacy continuity injection and awareness-filtered context.",
    "",
    "## Summary",
    "",
    "| Scenario | Legacy chars | Awareness chars | Reduction | Legacy memory suppressed |",
    "|----------|-------------:|----------------:|----------:|:------------------------:|",
  ];

  for (const sample of samples) {
    lines.push(
      `| ${sample.label} | ${sample.legacyContextChars} | ${sample.awarenessContextChars} | ${(sample.contextReductionRatio * 100).toFixed(1)}% | ${sample.suppressLegacyMemory ? "yes" : "no"} |`,
    );
  }

  const avgReduction =
    samples.length > 0
      ? samples.reduce((sum, s) => sum + s.contextReductionRatio, 0) / samples.length
      : 0;

  lines.push(
    "",
    `Average context reduction: **${(avgReduction * 100).toFixed(1)}%**`,
    "",
    "## Method",
    "",
    "- Legacy context includes full memory state, relevant fragments, and continuity feeling blocks.",
    "- Awareness context injects only scored goals, projects, decisions, and open questions above the relevance threshold.",
    "- General-knowledge queries suppress unrelated project continuity.",
    "- Conversation message history is unchanged — only system prefix size is reduced.",
    "",
    "## Goal",
    "",
    "Reduce irrelevant continuity injection without reducing accuracy on project-relevant messages.",
  );

  return lines.join("\n");
}

export function runAwarenessScaleSimulation(
  db: Database.Database,
  input: { workspaceId: string; threadId: string; messageCount: number; label: string },
): AwarenessScaleResult {
  const start = Date.now();

  const insert = db.prepare(
    `INSERT INTO messages (id, thread_id, role, content, message_status, created_at)
     VALUES (?, ?, 'user', ?, 'completed', ?)`,
  );
  const insertBatch = db.transaction((batchStart: number, batchEnd: number) => {
    for (let i = batchStart; i < batchEnd; i += 1) {
      const content =
        i % 17 === 0
          ? `Continue the provider work on ${input.label}Provider — unresolved provider decisions remain.`
          : i % 19 === 0
            ? `My goal is to build ${input.label}ContinuityOS with long-term operational continuity.`
            : i % 23 === 0
              ? `Working on ${input.label}Project${i % 50} — major initiative.`
              : i % 31 === 0
                ? `How do I cook rice? Unrelated general question ${i}.`
                : `${input.label} message ${i}: awareness scale simulation payload.`;
      insert.run(uuid(), input.threadId, content, new Date(Date.now() + i * 1000).toISOString());
    }
  });
  for (let batchStart = 0; batchStart < input.messageCount; batchStart += 1000) {
    insertBatch(batchStart, Math.min(input.messageCount, batchStart + 1000));
  }

  const probeMessages = [
    "Continue the provider work.",
    "How do I cook rice?",
    `Status update on ${input.label}ContinuityOS goals and projects.`,
  ];

  let goalsRelevant = 0;
  let projectsRelevant = 0;
  let continuityRelevant = 0;
  let awarenessConfidence = 0;

  for (const probe of probeMessages) {
    const result = buildConversationAwarenessContext(db, {
      workspaceId: input.workspaceId,
      threadId: input.threadId,
      currentMessage: probe,
      recentMessages: [],
    });
    goalsRelevant = Math.max(goalsRelevant, result.relevantGoals.length);
    projectsRelevant = Math.max(projectsRelevant, result.relevantProjects.length);
    continuityRelevant = Math.max(
      continuityRelevant,
      result.relevantContinuity.decisions.length + result.relevantContinuity.openQuestions.length,
    );
    awarenessConfidence = Math.max(awarenessConfidence, result.confidence.awarenessConfidence);
  }

  return {
    messageCount: input.messageCount,
    rebuildSuccess: goalsRelevant > 0 || projectsRelevant > 0,
    goalsRelevant,
    projectsRelevant,
    continuityRelevant,
    awarenessConfidence,
    durationMs: Date.now() - start,
  };
}

export function estimateAwarenessTokens(block: string | null): number {
  if (!block?.trim()) return 0;
  return estimateTokensPlaceholder([{ role: "system", content: block }]);
}
