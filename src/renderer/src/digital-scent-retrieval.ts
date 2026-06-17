import type { MemoryEvent } from "./memory-events";

export type DigitalScentRetrievalInput = {
  query: string;
  memoryEvents: MemoryEvent[];
  maxResults?: number;
};

export type DigitalScentRetrievalResult = {
  event: MemoryEvent;
  score: number;
  matchedSignals: string[];
};

export type DigitalScentRetrievalResponse = {
  query: string;
  isVagueReference: boolean;
  results: DigitalScentRetrievalResult[];
  summary: string;
};

const VAGUE_REFERENCE_PATTERNS = [
  "that issue",
  "that bug",
  "the bug",
  "the freeze",
  "the freeze issue",
  "the streaming bug",
  "the build bug",
  "the thing",
  "that thing",
  "from last night",
  "from earlier",
  "the memory work",
  "the scent idea",
  "the memory retrieval idea",
  "the current phase",
  "what we were doing",
  "where we left off"
];

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "can",
  "do",
  "for",
  "from",
  "how",
  "i",
  "in",
  "is",
  "it",
  "me",
  "my",
  "of",
  "on",
  "or",
  "our",
  "that",
  "the",
  "this",
  "to",
  "was",
  "we",
  "were",
  "what",
  "when",
  "where",
  "with",
  "you"
]);

function normalizeText(value: unknown): string {
  if (typeof value !== "string") return "";

  return value
    .toLowerCase()
    .replace(/[^a-z0-9_.:/\\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: unknown): string[] {
  return normalizeText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

function uniqueList(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function eventSearchText(event: MemoryEvent): string {
  return normalizeText(
    [
      event.type,
      event.summary,
      event.confidence,
      event.emotional_weight,
      event.digital_scent_trace,
      event.next_action,
      ...event.related_files,
      ...event.related_commands,
      ...event.scent_tags,
      ...event.retrieval_phrases
    ].join(" ")
  );
}

export function isVagueScentReference(query: string): boolean {
  const normalized = normalizeText(query);

  if (!normalized) return false;

  if (VAGUE_REFERENCE_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    return true;
  }

  const tokens = tokenize(normalized);
  const hasReferenceWord = ["that", "thing", "issue", "bug", "earlier", "last", "current"].some((word) =>
    normalized.includes(word)
  );

  return hasReferenceWord && tokens.length <= 5;
}

export function scoreMemoryEventForQuery(query: string, event: MemoryEvent): DigitalScentRetrievalResult {
  const normalizedQuery = normalizeText(query);
  const queryTokens = tokenize(normalizedQuery);
  const searchText = eventSearchText(event);
  const matchedSignals: string[] = [];
  let score = 0;

  for (const phrase of event.retrieval_phrases) {
    const normalizedPhrase = normalizeText(phrase);

    if (normalizedPhrase && normalizedQuery.includes(normalizedPhrase)) {
      score += 45;
      matchedSignals.push(`retrieval phrase: ${phrase}`);
    } else if (normalizedPhrase && normalizedPhrase.includes(normalizedQuery) && normalizedQuery.length >= 6) {
      score += 25;
      matchedSignals.push(`partial retrieval phrase: ${phrase}`);
    }
  }

  for (const tag of event.scent_tags) {
    const normalizedTag = normalizeText(tag);

    if (normalizedTag && normalizedQuery.includes(normalizedTag)) {
      score += 30;
      matchedSignals.push(`scent tag: ${tag}`);
    }
  }

  for (const file of event.related_files) {
    const normalizedFile = normalizeText(file);

    if (normalizedFile && normalizedQuery.includes(normalizedFile)) {
      score += 30;
      matchedSignals.push(`file: ${file}`);
    }
  }

  for (const command of event.related_commands) {
    const normalizedCommand = normalizeText(command);

    if (normalizedCommand && normalizedQuery.includes(normalizedCommand)) {
      score += 25;
      matchedSignals.push(`command: ${command}`);
    }
  }

  for (const token of queryTokens) {
    if (searchText.includes(token)) {
      score += 8;
      matchedSignals.push(`keyword: ${token}`);
    }
  }

  if (isVagueScentReference(query)) {
    if (event.type === "blocker" || event.type === "debugging") {
      score += 12;
      matchedSignals.push(`vague reference boost: ${event.type}`);
    }

    if (event.emotional_weight === "high") {
      score += 8;
      matchedSignals.push("emotional weight: high");
    }

    if (event.importance_score >= 70) {
      score += 8;
      matchedSignals.push(`importance: ${event.importance_score}/100`);
    }
  }

  if (event.confidence === "confirmed") {
    score += 6;
    matchedSignals.push("confidence: confirmed");
  } else if (event.confidence === "conflicting" || event.confidence === "stale") {
    score -= 10;
    matchedSignals.push(`confidence penalty: ${event.confidence}`);
  }

  return {
    event,
    score: Math.max(0, score),
    matchedSignals: uniqueList(matchedSignals)
  };
}

export function retrieveMemoryEventsByDigitalScent(
  input: DigitalScentRetrievalInput
): DigitalScentRetrievalResponse {
  const maxResults = Math.max(1, Math.min(10, input.maxResults ?? 5));
  const isVagueReference = isVagueScentReference(input.query);

  const results = input.memoryEvents
    .map((event) => scoreMemoryEventForQuery(input.query, event))
    .filter((result) => result.score > 0)
    .sort((first, second) => {
      if (second.score !== first.score) return second.score - first.score;
      return new Date(second.event.created_at).getTime() - new Date(first.event.created_at).getTime();
    })
    .slice(0, maxResults);

  return {
    query: input.query,
    isVagueReference,
    results,
    summary: buildScentRetrievalSummary(input.query, results, isVagueReference)
  };
}

export function buildScentRetrievalSummary(
  query: string,
  results: DigitalScentRetrievalResult[],
  isVagueReference = isVagueScentReference(query)
): string {
  if (results.length === 0) {
    return isVagueReference
      ? "I could not confidently match that vague reference to a stored memory event yet."
      : "No matching memory events were found.";
  }

  const top = results[0];
  const confidenceText = top.score >= 70 ? "strong" : top.score >= 35 ? "moderate" : "weak";

  return [
    `Memory retrieval found a ${confidenceText} match.`,
    `Matched memory: ${top.event.summary}`,
    `Type: ${top.event.type}`,
    `Confidence: ${top.event.confidence}`,
    `Signals: ${top.matchedSignals.slice(0, 5).join(", ") || "none"}`,
    `Next action: ${top.event.next_action}`
  ].join("\n");
}
