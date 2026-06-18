# ContinuityOS Future Architecture Vision

**Status:** Architectural philosophy for long-term development — not an implementation spec  
**Related:** [ARCHITECTURE-OVERVIEW.md](./ARCHITECTURE-OVERVIEW.md) · [CONTINUITY-CONSTITUTION.md](./CONTINUITY-CONSTITUTION.md) · [PRODUCT-VISION.md](./PRODUCT-VISION.md)

---

## Purpose

This document explains **why** ContinuityOS is shaped as layered architecture — so future engineers do not accidentally invert priorities (e.g., memory over conversation, provider over assistant, infrastructure over user).

Current implementation details live in [ARCHITECTURE-OVERVIEW.md](./ARCHITECTURE-OVERVIEW.md). This document defines the **philosophical stack** that implementation must serve.

---

## Architectural thesis

1. **Conversations are truth.**
2. **Continuity is derived** from truth and felt by the user.
3. **Models are replaceable.**
4. **Continuity survives provider changes.**
5. **AI life becomes the user's most valuable asset** — ContinuityOS manages it; the user owns it.

---

## Layer model

```
┌─────────────────────────────────────────────────────────────┐
│  USER LAYER                                                  │
│  Projects · goals · ownership · export · trust expectations  │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│  ASSISTANT LAYER                                             │
│  Identity · voice · trust rules · error behavior             │
│  Same assistant regardless of engine                         │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│  CONVERSATION LAYER                                          │
│  Canonical messages · threads · timeline · source of truth   │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│  CONTINUITY LAYER                                            │
│  Snapshots · recovery · assembly · felt narrative coherence    │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│  MEMORY LAYER                                                │
│  Derived summaries · facts · preferences · rebuildable cache   │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│  KNOWLEDGE LAYER (optional / future)                         │
│  Imports · documents · external refs · attributed facts        │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│  PROVIDER LAYER                                              │
│  Ollama · OpenAI · Claude · Gemini · future adapters         │
│  Replaceable engines — not product identity                  │
└─────────────────────────────────────────────────────────────┘
```

**Dependency rule:** Upper layers may use lower layers. Lower layers must never **overwrite** conversation truth for upper-layer convenience.

---

## User Layer

**What it is:** The human-facing scope of **AI life** — projects, workspaces, export, migration, permissions, trust expectations.

**Philosophy:**

- The user owns AI life; ContinuityOS is the steward
- Organizational nouns: **projects**, **conversations**, **assistant** — not shards, indices, or pipelines
- Export and import are first-class lifecycle events, not admin afterthoughts

**Anti-patterns:** Cloud-only custody, unexportable history, account deletion as only migration path.

---

## Assistant Layer

**What it is:** Stable identity and behavior that wraps all model calls.

**Philosophy:**

- Personality and trust rules live here — not in provider SDK configs
- Provider errors translate to assistant-honest explanations
- Model upgrades improve capability without rebooting relationship

**See:** [AI-COMPANION-VISION.md](./AI-COMPANION-VISION.md)

---

## Conversation Layer

**What it is:** Canonical record of what was said — user and assistant messages, roles, timestamps, provider metadata, raw payloads where needed.

**Philosophy:**

- **Conversation is truth** (Constitution Article 1)
- Nothing in memory, continuity, or knowledge may silently delete conversation truth
- Recovery and replay validate against this layer

**Implementation alignment:** SQLite messages table, timeline events, import/export integrity checks.

---

## Continuity Layer

**What it is:** Systems that make work **feel uninterrupted** across time, crashes, and context limits.

**Includes:**

- Stream recovery and partial persistence
- Snapshots and savepoint integrity
- Context assembly for model calls (bounded by policy, not by amnesia)
- Project-level narrative coherence

**Philosophy:**

- **Continuity over context** (Constitution Article 2)
- Context windows are temporary; continuity is the product promise
- Continuity should be **felt**, not announced (Article 8)

**Key distinction:**

| Continuity Layer | Conversation Layer |
|------------------|-------------------|
| Derived experience of ongoing work | Canonical record of what happened |
| Optimized for model input + UX | Optimized for truth + rebuild |
| May summarize for efficiency | Never silently discard truth |

---

## Memory Layer

**What it is:** Derived, rebuildable representations of meaning extracted from conversations.

**Includes:**

- Summaries, extracted facts, preferences, project memory state
- Embeddings or indices **only as implementation detail** — never user-facing primary UX

**Philosophy:**

- **Memory serves continuity** (Constitution Article 9)
- If damaged → rebuild from conversation layer
- Memory never authoritative over contradictory conversation truth

**Rebuild invariant:** Given full conversation truth, memory can be regenerated. If not, architecture is wrong.

---

## Knowledge Layer

**What it is:** Optional structured knowledge beyond chat — imported documents, user files, external references, attributed web facts (future).

**Philosophy:**

- Knowledge supplements conversations; does not replace them
- External facts must be **attributed** and separable from personal history
- Local-first: user-initiated imports and explicit retrieval policies

**Not:** A corporate wiki replacement or autonomous web agent.

---

## Provider Layer

**What it is:** Adapters that call models — Ollama default, optional cloud APIs, Manual Mode bridges.

**Philosophy:**

- **Provider independence** (Constitution Article 5)
- Providers are **engines**, not product soul
- Switching provider must not destroy continuity or assistant identity

**Current product alignment:**

- In-app streaming chat: Ollama (local default)
- External intelligence: Manual Mode and optional keys — user controls egress

**Future:** Additional integrated providers allowed only if assistant layer and conversation truth remain centralized.

---

## Why conversations are truth

- Conversations are ** auditable**, **user-readable**, and **exportable**
- Derived layers optimize; they also **drift**
- Rebuild, legal export, and trust all require an immutable conversational record
- "Smart memory" without truth is a black box — constitutionally unacceptable

---

## Why continuity is derived

Continuity is the **experience** of ongoing work — assembled from truth + memory + policy. It is not a separate competing database of "what happened."

Deriving continuity:

- Allows model/context limits to change without rewriting history
- Enables recovery after corruption by replaying truth
- Keeps one canonical narrative pipeline under assistant control

---

## Why models are replaceable

Models are commodities. Assistant trust and user AI life are not.

Architecture must:

- Isolate provider calls behind adapters
- Keep assistant identity out of provider-specific prompt hacks
- Treat model version bumps as ops events, not product reboots

---

## Why continuity survives provider changes

When OpenAI → Claude → Ollama → "future model":

- **Conversation layer** persists unchanged
- **Continuity layer** reassembles context for new engine
- **Memory layer** rebuilds if provider-specific artifacts invalid
- **Assistant layer** speaks with same values and voice
- **User layer** exports same AI life bundle

**Manual Mode** is the eternal fallback — external intelligence can always be pasted into conversation truth.

---

## Why AI life becomes the most valuable asset

Over years, a user's AI life contains:

- Decisions and rationale
- Drafts and iterations
- Learning journeys
- Trusted assistant relationship

That compound asset is **more valuable than any single model subscription** — and **painful to lose**.

ContinuityOS architecture exists to **preserve, manage, and free that asset**.

---

## Observability (local only)

Diagnostics and health signals observe layer integrity **without cloud telemetry**:

- Migration health → conversation truth storage
- Recovery health → continuity layer
- Runtime health → assembly and streaming

Users see **health outcomes**, not layer diagrams.

---

## Evolution guidelines

When adding features, ask:

1. Which layer does this belong to?
2. Does it respect conversation truth?
3. Does it strengthen felt continuity or memory theater?
4. Does it preserve provider and assistant independence?
5. Can the user still export everything?

If any answer fails, revisit [DEVELOPMENT-GUARDRAILS.md](./DEVELOPMENT-GUARDRAILS.md).

---

## Summary

> **Conversation truth at the bottom. Continuity and memory derived above. One assistant identity above that. User ownership on top. Providers interchangeable at the bottom edge. AI life compounds — and survives.**
