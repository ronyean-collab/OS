# AI Life Engine

ContinuityOS Phase 14 introduces the **AI Life Engine** — operational continuity across long-term goals, active projects, completed work, recurring interests, and assistant relationship history.

## What AI Life Is

AI Life tracks **explicit, user-stated operational context**:

- Long-term goals the user declared
- Active and completed projects
- Recurring operational interests (topics the user keeps working on)
- Assistant capability milestones and relationship timeline
- Current priorities derived from conversation truth

AI Life builds on **Continuity Intelligence** (decisions, open questions, milestones) and canonical **conversation history**.

## What AI Life Is Not

AI Life is **not** psychological profiling. It does **not**:

- Infer personality traits
- Infer mental health
- Infer political beliefs
- Infer hidden user characteristics
- Create user scores for judgment or ranking
- Build profiling systems

Sentences matching profiling patterns (e.g. "you seem", "personality", "mental health") are **blocked** from extraction.

AI Life is **operational continuity** — what the user is building, pursuing, and completing — not who they are psychologically.

## Architecture

```
messages (canonical truth)
    │
    ├── continuity-intelligence-service
    │       decisions · open questions · timeline
    │
    └── ai-life-service
            ├── extractLongTermGoals()
            ├── extractActiveProjects()
            ├── extractCompletedProjects()
            ├── extractRecurringInterests()
            ├── extractAssistantHistory()
            ├── generateAiLifeSnapshot()
            └── calculateAiLifeHealth()
```

### Service

`electron/main/services/ai-life-service.ts`

| API | Role |
|-----|------|
| `analyzeAiLife()` | Full workspace AI Life pass |
| `generateAiLifeSummary()` | Alias for snapshot generation |
| `generateAiLifeSnapshot()` | Human + AI portable AI Life snapshot |
| `extractLongTermGoals()` | Explicit goals with status and confidence |
| `extractActiveProjects()` | Active/paused project records |
| `extractCompletedProjects()` | Achievement records |
| `extractRecurringInterests()` | Repeated operational topics (2+ mentions) |
| `extractAssistantHistory()` | Assistant relationship timeline |
| `calculateAiLifeHealth()` | Internal health dimensions |
| `rebuildAiLifeFromHistory()` | Rebuild from messages + continuity records |
| `buildAiLifeExport()` | Export bundle for backup/handoff |

### Schema (v16)

| Table | Purpose |
|-------|---------|
| `ai_life_goals` | Long-term goals: goal, status, confidence, lastReferenced |
| `ai_life_projects` | Active projects: name, objective, status, continuityConfidence |
| `ai_life_achievements` | Completed/shipped project achievements |
| `ai_life_assistant_history` | Assistant Created, renames, capability milestones |
| `ai_life_interests` | Recurring operational interests |
| `ai_life_snapshots` | AI Life snapshot JSON + markdown |
| `ai_life_health_metrics` | Internal-only health time series |

## Long-Term Goals

Detected only from **explicit** user language:

- "my goal is", "goal:", "objective is", "working toward", "plan to build", "want to launch"
- Workspace continuity summary
- Memory state project goals

Each goal stores:

- `goal` text
- `status`: active · paused · completed · archived
- `confidenceScore`
- `lastReferencedAt`

## Active Projects

Project records include:

- `projectName`
- `currentObjective`
- `lastActivityAt`
- `continuityConfidence`
- `status`: active · paused · completed · archived

Sources: workspace name/summary, "working on", "building", "developing", initiative language.

## Completed Projects

Achievement records from:

- "completed", "shipped", "finished", "released", "archived"
- Continuity intelligence decision milestones

## Assistant History

Timeline entries such as:

- Assistant Created (from assistant profile)
- Identity Layer Added
- Provider Independence Added
- Continuity Intelligence Added
- User Renamed Assistant (from explicit messages)

Derived from decisions, timeline events, and profile metadata — not inferred traits.

## AI Life Snapshot

Sections:

- Current Goals
- Active Projects
- Completed Projects
- Recent Progress
- Open Questions (from continuity intelligence)
- Assistant History
- Current Priorities

Stored as JSON + markdown in `ai_life_snapshots`.

## How It Rebuilds

1. **Canonical truth**: `messages` table
2. **Continuity layer**: `rebuildIntelligenceFromHistory()` (decisions, questions, timeline)
3. **AI Life layer**: `rebuildAiLifeFromHistory()` (clears AI Life tables, re-extracts all operational records)

Import path:

1. Restore messages
2. Import continuity intelligence bundle if present (or rebuild)
3. Import AI Life bundle if present (or rebuild)

Export format **v4** includes `aiLife` alongside `continuityIntelligence`.

## Why AI Life Differs From Memory

| Memory Storage | AI Life |
|----------------|---------|
| Stores fragments and rolling lists | Tracks **goals, projects, and life initiatives** |
| Retrieval for context assembly | Operational state across time |
| Compression tiers | Active vs completed project lifecycle |
| Accumulates text | Structures long-horizon work |

Memory supports recall. AI Life supports **ongoing operational awareness**.

## Why AI Life Differs From Profiling

| Profiling | AI Life |
|-----------|---------|
| Infers hidden traits | Uses **explicit user statements only** |
| Scores the user | Scores **extraction confidence**, not the person |
| Psychological models | Project and goal models |
| Judgment | Neutral operational record-keeping |

## Health Metrics (internal only)

| Metric | Meaning |
|--------|---------|
| `aiLifeCoverage` | Goals + projects + achievements vs conversation volume |
| `goalCoverage` | Active goals vs total goals |
| `projectCoverage` | Active projects vs total project records |
| `rebuildConfidence` | From continuity intelligence reconstruction |
| `assistantHistoryCoverage` | History entries vs expected milestones |

Not exposed in normal UI.

## Testing

| Test file | Coverage |
|-----------|----------|
| `tests/ai-life-service.test.ts` | Analysis, snapshot, health, interests, profiling block |
| `tests/goal-detection.test.ts` | Goal extraction + rebuild |
| `tests/project-tracking.test.ts` | Active + completed projects |
| `tests/assistant-history.test.ts` | Assistant timeline |
| `tests/ai-life-rebuild.test.ts` | Loss simulation + 10k/50k/100k scale |

Run:

```bash
npm test
npm run build
npm run test:e2e
```
