# Continuity Intelligence

ContinuityOS Phase 13 introduces **Continuity Intelligence** — the layer that identifies what matters, what changed, what was decided, and what remains unresolved.

This is not memory storage. Memory stores information. Continuity Intelligence **understands significance**.

## Purpose

Transform ContinuityOS from:

> AI chat with memory

into:

> **The Continuity Layer for AI**

Continuity Intelligence answers:

- What matters in this workspace?
- What changed recently?
- What decisions were made?
- What questions remain open?
- What is stable vs at risk?

**Conversation history remains the source of truth.** All intelligence outputs are rebuildable from canonical messages.

## Architecture

```
messages (canonical truth)
    │
    ├── memory-state-service (derived fragments + rolling state)
    │
    └── continuity-intelligence-service
            ├── extractContinuitySignals()
            ├── extractProjectDecisions()
            ├── extractOpenQuestions()
            ├── generateProjectTimeline()
            ├── generateContinuitySnapshot()
            ├── calculateContinuityScore()
            └── calculateContinuityHealthMetrics()
```

### Service

`electron/main/services/continuity-intelligence-service.ts`

Core APIs:

| API | Role |
|-----|------|
| `analyzeConversation()` | Full per-thread intelligence pass |
| `generateContinuitySnapshot()` | Human + AI portable workspace snapshot |
| `extractProjectDecisions()` | Structured decision records |
| `extractOpenQuestions()` | Open question records with status |
| `extractContinuitySignals()` | Raw significance signals from messages |
| `calculateContinuityScore()` | Workspace continuity score |
| `calculateContinuityHealthMetrics()` | Internal health dimensions |
| `generateProjectTimeline()` | Chronological continuity events |
| `rebuildIntelligenceFromHistory()` | Rebuild all intelligence from messages |
| `buildContinuityIntelligenceExport()` | Export bundle for backup/handoff |

### Schema (v15)

| Table | Purpose |
|-------|---------|
| `continuity_decision_records` | Structured decisions with scores |
| `continuity_open_question_records` | Open questions with status + last discussed |
| `continuity_intelligence_snapshots` | Workspace snapshot JSON + markdown |
| `continuity_health_metrics` | Internal-only health time series |
| `memory_fragments.continuity_score` | Per-fragment continuity significance |
| `memory_fragments.project_score` | Per-fragment project relevance |
| `memory_fragments.confidence_score` | Extraction confidence |

## Scoring

Every continuity item receives four scores (0–1):

| Score | Meaning |
|-------|---------|
| `importanceScore` | How much this item matters overall |
| `continuityScore` | How much it affects continuity reconstruction |
| `projectScore` | How much it affects project direction |
| `confidenceScore` | Confidence in the extraction |

Importance tiers: `low` · `medium` · `high` · `very_high` · `critical`

Examples:

| Item | Importance |
|------|------------|
| User likes pizza | low |
| Project architecture changed | high |
| Authentication strategy changed | very high |
| Major product decision | critical |

Scoring heuristics live in `scoreContinuityItem()`. Scores are stored on decision/open-question records and memory fragments.

## Decision Extraction

Decision records are extracted automatically from conversation patterns:

- "decided", "we will", "adopted", "implemented", "declared"
- Milestones and architectural changes

Each record includes:

- `title` / `description`
- `decidedAt` (YYYY-MM from source message)
- Source message reference
- Full score set

Records deduplicate by content. Rebuild: `rebuildIntelligenceFromHistory()`.

## Open Question Extraction

Open questions are detected from:

- Explicit questions (`?`)
- TBD / TODO / unresolved / pending language
- Unresolved work and risk statements

Each record tracks:

- `status`: `open` · `resolved` · `deferred`
- `confidenceScore`
- `lastDiscussedAt`

## Timeline Generation

`generateProjectTimeline()` produces chronological events:

1. Project Created (workspace `created_at`)
2. Extracted decisions / milestones
3. Existing `timeline_events` audit entries

Timeline is reconstructable after intelligence tables are cleared — messages remain canonical.

## Continuity Snapshots

`generateContinuitySnapshot()` produces a workspace snapshot:

- Current Objective
- Recent Decisions
- Open Questions
- Known Stable State
- Current Risks
- Important Preferences
- Recent Progress

Output formats:

- Structured JSON (stored in `continuity_intelligence_snapshots`)
- Markdown (human readable + AI portable)

## Rebuild Strategy

1. **Canonical truth**: `messages` table
2. **Derived memory**: `rebuildDerivedMemoryFromCanonical()` (memory-state-service)
3. **Derived intelligence**: `rebuildIntelligenceFromHistory()` (clears intelligence tables, reprocesses all threads)

Simulated failure modes:

- Memory fragment loss
- Intelligence record loss
- Partial corruption

Recovery validates that conversation history alone restores decisions, open questions, and continuity score within tolerance.

## Health Metrics (internal only)

| Metric | Meaning |
|--------|---------|
| `continuityCoverage` | Message/history coverage |
| `continuityConfidence` | Overall continuity score |
| `rebuildConfidence` | Reconstruction health from memory-state |
| `projectAwareness` | High-project-score decision density |
| `decisionCoverage` | Decisions vs conversation volume |
| `openQuestionCoverage` | Open question tracking ratio |

Not exposed in normal UI.

## Export Integration

Workspace export format **v3** includes optional `continuityIntelligence`:

- Decisions
- Open questions
- Latest snapshot
- Timeline
- Health metrics

Import path:

1. Restore messages (canonical)
2. Import intelligence bundle if present
3. Otherwise `rebuildIntelligenceFromHistory()`

Encrypted backups inherit the same payload via workspace export.

## Why This Differs From Memory Storage

| Memory Storage | Continuity Intelligence |
|----------------|-------------------------|
| Stores fragments | Identifies **significance** |
| Rolling state lists | Structured decisions + questions |
| Compression tiers | Timeline + snapshots |
| Retrieval for context | Scoring + health + rebuild validation |
| Accumulates text | Understands what changed and what remains |

Memory supports continuity. Intelligence **interprets** it.

## Testing

| Test file | Coverage |
|-----------|----------|
| `tests/continuity-intelligence.test.ts` | Scoring, signals, analysis, health |
| `tests/decision-extraction.test.ts` | Decision records + dedup + rebuild |
| `tests/project-timeline.test.ts` | Timeline ordering + reconstruction |
| `tests/continuity-snapshot.test.ts` | Snapshots + export v3 |
| `tests/continuity-rebuild.test.ts` | Loss simulation + 10k/50k/100k scale |

Run:

```bash
npm test
npm run build
npm run test:e2e
```
