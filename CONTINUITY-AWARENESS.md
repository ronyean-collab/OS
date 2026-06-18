# Continuity-Aware Conversation Engine

ContinuityOS Phase 15 introduces the **Continuity-Aware Conversation Engine** — a relevance layer that decides what continuity to surface in each reply, and what to leave out.

## Purpose

The assistant now has access to:

- Conversation history (canonical truth)
- Continuity intelligence (decisions, open questions, milestones)
- AI Life intelligence (goals, projects, achievements)
- Project intelligence (timeline, operational state)

Phase 15 teaches the assistant **when and how** to use that information naturally — helpful and aware, not creepy or database-like.

## What This Is Not

The awareness engine does **not**:

- Infer personality or psychological traits
- Force memory references into every reply
- Dump full continuity state into every prompt
- Replace conversation history as truth

## Architecture

```
Current user message + recent thread
        │
        ▼
continuity-awareness-service
        ├── determineRelevantContinuity()
        ├── determineRelevantProjects()
        ├── determineRelevantGoals()
        ├── determineRelevantHistory()
        ├── calculateAwarenessConfidence()
        └── buildConversationAwarenessContext()
        │
        ▼
context-assembly (stream runtime)
        ├── Awareness Context      ← injected first
        ├── AI Life awareness
        ├── Continuity intelligence
        ├── Memory (trimmed when irrelevant)
        └── Recent thread messages
```

### Service

`electron/main/services/continuity-awareness-service.ts`

| API | Role |
|-----|------|
| `determineRelevantContinuity()` | Score decisions and open questions for current message |
| `determineRelevantProjects()` | Active/paused projects matching current topic |
| `determineRelevantGoals()` | Long-term goals matching current topic |
| `determineRelevantHistory()` | Assistant relationship notes when relevant |
| `buildConversationAwarenessContext()` | Full awareness bundle for provider context |
| `calculateAwarenessConfidence()` | Internal confidence dimensions |
| `runAwarenessScaleSimulation()` | 10k/50k/100k scale verification |
| `generateAwarenessEfficiencyReport()` | Prompt size comparison report |

## Relevance Engine

Inputs:

- Current message
- Recent thread context
- Continuity intelligence records
- AI Life goals and projects
- Memory reconstruction confidence

Outputs per item:

- `relevanceScore` — token/term overlap with current message
- `awarenessScore` — weighted surfacing score
- `confidenceScore` — extraction confidence for internal metrics

Only items above `RELEVANCE_SURFACE_THRESHOLD` (0.42) are surfaced.

### Filtering Examples

| User message | Behavior |
|--------------|----------|
| "How do I cook rice?" | Suppress unrelated ContinuityOS/CS2Coach continuity |
| "Continue the provider work." | Surface provider decisions, milestones, open questions |
| "Status on ContinuityOS goals?" | Surface ContinuityOS goals and active projects only |

General-knowledge patterns (`how to cook`, `recipe`, `capital of`, etc.) trigger off-topic mode.

## Confidence Model (internal only)

| Metric | Meaning |
|--------|---------|
| `awarenessConfidence` | Overall relevance of surfaced continuity |
| `projectConfidence` | Active project match quality |
| `goalConfidence` | Goal match quality |
| `continuityConfidence` | Decision/question match quality |
| `memoryConfidence` | From continuity reconstruction score |

When `awarenessConfidence >= 0.55` and no relevant items exist, legacy memory blocks are suppressed to reduce bloat.

## Context Reduction

Legacy context injected full memory state, fragments, and feeling blocks on every message.

Awareness context injects only scored, relevant items plus safety instructions.

Measured in `awareness-efficiency-report.md`:

- Legacy context character count
- Awareness context character count
- Reduction ratio
- Whether legacy memory was suppressed

Goal: smaller prompts, more relevant prompts, same accuracy on project-relevant messages.

## Conversation Safety

Every awareness block includes:

- Conversation history is canonical truth
- Never fabricate history, continuity, memory, or goals
- Do not announce database retrieval or memory
- Do not force unrelated goals into replies
- If uncertain, say so plainly

## Integration

`stream-runtime.ts` calls `buildConversationAwarenessContext()` before `assembleProviderContext()`.

When `suppressLegacyMemory` is true, memory state, fragments, and feeling blocks are omitted from the provider prefix.

## Testing

| Test file | Coverage |
|-----------|----------|
| `tests/continuity-awareness.test.ts` | Service, filtering, scale 10k/50k/100k |
| `tests/project-awareness.test.ts` | Project prioritization |
| `tests/goal-awareness.test.ts` | Goal surfacing rules |
| `tests/relevance-selection.test.ts` | Threshold and scoring |
| `tests/context-reduction.test.ts` | Prompt reduction + efficiency report |

Run:

```bash
npm test
npm run build
npm run test:e2e
```
