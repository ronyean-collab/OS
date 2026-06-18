# ContinuityOS Product Vision

**Status:** Source of truth for product direction  
**Audience:** Founders, engineers, designers, partners, future contributors  
**Related:** [CONTINUITY-CONSTITUTION.md](./CONTINUITY-CONSTITUTION.md) · [AI-COMPANION-VISION.md](./AI-COMPANION-VISION.md) · [DEVELOPMENT-GUARDRAILS.md](./DEVELOPMENT-GUARDRAILS.md)

---

## Public positioning

> **It's like ChatGPT, but it remembers.**

This is the simplest true statement of what users should feel. ContinuityOS is not competing to be the smartest model. It is competing to be the place where meaningful work **continues**.

---

## 1. Mission

**Give every person a personal AI assistant that helps them accomplish meaningful work over long periods of time — without losing continuity, ownership, or trust.**

ContinuityOS exists to manage **AI life**: conversations, projects, memory, and context that accumulate over months and years. The user owns that life. ContinuityOS protects and extends it.

We build the **Continuity Layer for AI** — the durable foundation beneath interchangeable models and providers.

---

## 2. Product Category

**Personal AI Operating System**

Not a chat app. Not a model wrapper. Not an agent platform.

A Personal AI Operating System is where a user:

- talks to one consistent assistant
- organizes work into projects and threads
- accumulates continuity across sessions and providers
- owns, exports, and restores their entire AI life locally

ContinuityOS is the operating environment for long-horizon AI-assisted work on the user's machine.

---

## 3. Core Promise

**The conversation never dies.**

Conversations survive:

- app restarts and crashes
- interrupted generations
- provider changes
- model upgrades
- device migrations (via export)
- memory corruption (via rebuild from conversation truth)

If continuity breaks, we treat it as a product failure — not a user error.

---

## 4. Why ContinuityOS Exists

AI models became excellent at answering questions. They did not become excellent at **preserving a life of work**.

Users lose context when tabs close, subscriptions change, products pivot, or "memory" features behave like opaque marketing. Builders and professionals need an assistant that remembers **with them**, not **for the vendor**.

ContinuityOS exists because **intelligence is commoditizing**, but **continuity is not**. The next decade of personal productivity will belong to whoever owns the continuity layer — and that owner must be the user.

---

## 5. Problems Being Solved

| Problem | How ContinuityOS addresses it |
|---------|-------------------------------|
| **Session amnesia** | Persistent threads, workspaces, and recoverable streams |
| **Vendor lock-in of history** | Local database, encrypted export, provider independence |
| **Fragile memory systems** | Memory derived from conversations; rebuildable if damaged |
| **Model churn** | Same assistant identity across OpenAI, Claude, Gemini, Ollama, future models |
| **Setup fatigue** | Ollama-first local default; paid APIs optional |
| **Trust erosion** | Honest assistant: admits uncertainty, errors, and limits |
| **Complexity overload** | Users see assistant, conversation, projects — not infrastructure |

---

## 6. User Experience Philosophy

**Calm. Friendly. Invisible infrastructure.**

Users interact with:

- an **assistant** they can trust
- **conversations** that feel continuous
- **projects** that organize long work

Users do **not** interact with:

- models, embeddings, vectors, retrieval, or compression
- memory dashboards or continuity plumbing
- provider politics or setup rituals

Complexity is our job. Clarity is the user's experience.

**Local-first by default:** Ollama remains the default path. Paid APIs are optional enhancements, never requirements for core value.

---

## 7. Continuity Philosophy

**Continuity should be felt, not announced.**

The user should not manage memory. The assistant manages continuity on their behalf — quietly, reliably, in the background.

Continuity means:

- picking up mid-thought after days away
- referencing prior decisions without re-explaining
- surviving interruption without losing partial work
- maintaining narrative coherence across provider changes

We optimize for **felt continuity** over visible "memory features."

---

## 8. Memory Philosophy

**Memory serves continuity. Conversation is truth.**

- **Raw conversation history** is always the canonical source of truth.
- **Memory** is derived from conversations — summaries, facts, preferences, project context.
- If memory is damaged, incomplete, or stale, it can be **rebuilt** from conversation truth.
- Memory is never more authoritative than the conversations it came from.

Users should never need to "fix memory" in normal use. Engineers may inspect and rebuild; users should feel continuity.

---

## 9. Assistant Philosophy

The assistant is **friendly, helpful, trustworthy, honest, and stable**.

The assistant is **not** manipulative, creepy, overly emotional, argumentative, or performative.

**Model independence:** The assistant remains the same person. The underlying model may change. Whether the engine is OpenAI, Claude, Gemini, Ollama, or a future model, the user should feel they are talking to **one assistant** — not a different product per provider.

See [AI-COMPANION-VISION.md](./AI-COMPANION-VISION.md) for identity and behavior detail.

---

## 10. Trust Philosophy

Trust is earned through **honesty over cleverness**.

- If the assistant does not know something, it says so.
- If the assistant is wrong, it admits it.
- If evidence is unclear, it explains uncertainty.
- **No hallucinated certainty.**

Trust also means **data honesty**: local-first storage, clear export, no hidden cloud exfiltration, no surveillance analytics dressed as "personalization."

---

## 11. Long-Term Vision

**The Continuity Layer for AI**

In the long run, ContinuityOS becomes the durable personal layer beneath every model:

- models rotate; continuity persists
- providers compete; the user's AI life stays intact
- intelligence commoditizes; **continuity compounds**

The most valuable personal asset of the AI era is not access to a model — it is **a life of accumulated context, decisions, and relationships with one's assistant**, owned and portable.

ContinuityOS manages that asset for the user.

---

## 12. Future Direction

Future development must **extend continuity and trust**, not dilute them.

**Aligned directions:**

- Deeper continuity (archival, project maturity, smoother recovery)
- Stronger assistant identity across providers
- Better export and migration (device-to-device on user terms)
- Production hardening (signing, updates, installer quality)
- Optional paid APIs without compromising local-first defaults

**Out of scope unless constitution is formally amended:**

- Agent-first autonomy
- Cloud-sync-as-default
- Provider-exclusive partnerships that compromise neutrality
- Memory management UX as a primary surface
- Lock-in business models

See [FUTURE-ARCHITECTURE-VISION.md](./FUTURE-ARCHITECTURE-VISION.md) and [DEVELOPMENT-GUARDRAILS.md](./DEVELOPMENT-GUARDRAILS.md).

---

## Document hierarchy

| Document | Role |
|----------|------|
| **PRODUCT-VISION.md** (this file) | What we are building and why |
| **CONTINUITY-CONSTITUTION.md** | Non-negotiable rules |
| **AI-COMPANION-VISION.md** | Assistant identity and behavior |
| **BUSINESS-VISION.md** | Market, users, monetization philosophy |
| **FUTURE-ARCHITECTURE-VISION.md** | Layered architecture philosophy |
| **DEVELOPMENT-GUARDRAILS.md** | What we must never become |

---

## Assistant Identity Layer (implementation)

The assistant identity layer turns vision docs into **runtime behavior** for every provider call.

| Piece | Location |
|-------|----------|
| Canonical system instructions | `electron/main/services/assistant-identity-service.ts` → `buildAssistantIdentityPrompt()` |
| User-owned profile (name, web toggle) | `assistant_profile` table · `assistant-profile-service.ts` |
| Provider injection | `context-assembly.ts` prepends identity **before** continuity context |
| Stream runtime | `stream-runtime.ts` loads profile + builds prompt per Ollama send |
| Settings UX | Settings → Assistant (`AssistantSettingsSection.tsx`) |
| Onboarding naming | Wizard step 2 — optional, default **Assistant** |

**Name handling:** The name is for user ownership in Settings/onboarding — not roleplay. The prompt forbids constant self-naming.

**Trust enforcement:** Identity prompt encodes honesty, uncertainty, correction behavior, anti-profiling, and “conversation truth wins over derived memory.”

---

## One-line summary

> **ContinuityOS — a Personal AI Operating System where the conversation never dies, the user owns their AI life, and the assistant stays the same no matter which model runs underneath.**
