# ContinuityOS Constitution

**Status:** Permanent governing document for product and engineering decisions  
**Authority:** This constitution overrides feature enthusiasm, competitor mimicry, and short-term revenue pressure unless formally amended by project leadership with documented rationale.

**Related:** [PRODUCT-VISION.md](./PRODUCT-VISION.md) · [DEVELOPMENT-GUARDRAILS.md](./DEVELOPMENT-GUARDRAILS.md)

---

## Preamble

ContinuityOS exists to give users a **Personal AI Operating System** where **the conversation never dies**, **conversation history is truth**, and **the user owns their AI life**.

This constitution defines the principles that must not be violated as the product grows.

---

## Article 1 — Conversation Is Truth

### Principle

Raw conversation history is always the canonical source of truth.

### Rationale

Every derived system — memory, summaries, embeddings, continuity state — is an optimization. Optimizations can drift, corrupt, or become stale. Conversations cannot be silently replaced by abstractions without breaking user trust.

### Implications

- Messages are persisted canonically before any derived processing.
- Rebuild paths must exist from conversations → memory → continuity.
- No feature may delete or overwrite conversation truth to "fix" memory.
- Import/export must preserve conversation integrity verifiably.

### Examples

- **Allowed:** Rebuild memory index from full thread history after corruption.
- **Forbidden:** Auto-delete old messages because a summary exists.
- **Allowed:** Compress context for model calls while retaining full history in storage.

---

## Article 2 — Continuity Over Context

### Principle

Continuity — the felt sense that work continues — takes priority over raw context window tricks.

### Rationale

Models change; context limits change. Continuity is a product guarantee. Context assembly is an implementation detail.

### Implications

- Invest in persistence, recovery, snapshots, and narrative coherence.
- Context assembly serves continuity, not the reverse.
- Partial streams and interrupted work must be recoverable.
- Users should feel continuity without understanding context engineering.

### Examples

- **Allowed:** Summarize older turns for model input while full history remains stored.
- **Forbidden:** Ship a "128k context" marketing feature with no persistence story.
- **Allowed:** Project-level continuity summaries derived from threads.

---

## Article 3 — The Assistant Remains

### Principle

The assistant remains the same. The underlying model may change.

### Rationale

Users bond with an assistant, not a model SKU. Provider churn should not reset personality, trust, or relationship.

### Implications

- Define assistant identity separately from provider adapters.
- Personality, tone, and trust rules are stable across providers.
- Provider changes are infrastructure events, not identity reboots.
- See [AI-COMPANION-VISION.md](./AI-COMPANION-VISION.md).

### Examples

- **Allowed:** Swap Ollama → Claude for a task while assistant voice stays consistent.
- **Forbidden:** "Claude mode" and "GPT mode" as different personas with conflicting behavior.
- **Allowed:** Model-specific capability notes ("I'm less confident here") without personality shift.

---

## Article 4 — User Ownership

### Principle

The user owns their AI life. ContinuityOS manages it on their behalf.

### Rationale

Personal AI Operating Systems fail if the vendor holds the life hostage. Ownership is moral and strategic.

### Implications

- Local-first storage by default.
- Full export must always be possible.
- No essential feature permanently requires vendor cloud custody of conversation truth.
- Migrations and upgrades must preserve user data or fail safely.

### Examples

- **Allowed:** Optional encrypted cloud backup vault with user-held keys (future, opt-in).
- **Forbidden:** Sync-only history with no local canonical copy.
- **Allowed:** Encrypted export the user can move to any device.

---

## Article 5 — Provider Independence

### Principle

ContinuityOS must never become provider-specific.

### Rationale

Providers compete and change terms. ContinuityOS neutrality is the moat — we outlive any single model vendor.

### Implications

- No exclusive reliance on one API for core continuity.
- Ollama remains a first-class default path.
- Paid APIs are optional enhancements.
- Architecture uses a provider layer; product UX does not worship one brand.

### Examples

- **Allowed:** Ollama in-app chat + Manual Mode for any external AI.
- **Forbidden:** "Built for OpenAI" positioning or OpenAI-only persistence.
- **Allowed:** Provider-specific adapters hidden from user-facing identity.

---

## Article 6 — Trust Over Cleverness

### Principle

Honesty beats performance theater. No hallucinated certainty.

### Rationale

An assistant that confidently lies destroys continuity — users cannot rely on past "facts" in the thread.

### Implications

- Uncertainty must be expressible and encouraged when appropriate.
- Errors must be correctable and admitted.
- Avoid manipulative urgency, fake empathy, or engagement bait.
- Diagnostics and product copy must not overclaim capabilities.

### Examples

- **Allowed:** "I'm not sure — here's what we discussed before."
- **Forbidden:** Inventing citations or past decisions not in conversation truth.
- **Allowed:** Correcting a prior assistant message when user provides evidence.

---

## Article 7 — Simplicity Over Complexity

### Principle

Hide complexity. Users interact with assistant, conversation, and projects — not infrastructure.

### Rationale

Personal AI Operating Systems fail when they feel like ML ops tools. Our user is a human doing work, not a pipeline engineer.

### Implications

- No user-facing memory dashboards as a primary experience.
- No required understanding of embeddings, vectors, or retrieval.
- Setup fatigue must be minimized; Ollama-first defaults preserved.
- Advanced tools may exist for power users but must not define the product.

### Examples

- **Allowed:** Internal continuity inspector for developers (hidden from default UX).
- **Forbidden:** Onboarding that teaches vector databases.
- **Allowed:** "Project" and "conversation" as the primary organizational nouns.

---

## Article 8 — Continuity Should Be Felt

### Principle

Continuity should be felt, not announced.

### Rationale

Announcing memory ("I remembered you like…") feels creepy and performative. Felt continuity feels like a good colleague.

### Implications

- Avoid memory theater and surveillance vibes.
- Reference past work naturally when relevant.
- Do not require users to manage memory entries for normal use.
- The assistant manages continuity; the user manages goals.

### Examples

- **Allowed:** "Last week you decided to ship Manual Mode first — want to continue that plan?"
- **Forbidden:** "My memory system has stored 47 facts about you!"
- **Allowed:** Silent rebuild of derived memory after detected corruption.

---

## Article 9 — Memory Serves Continuity

### Principle

Memory is derived from conversations. If memory is damaged, it can be rebuilt.

### Rationale

Memory is a cache of meaning, not a second truth. Caches can be invalidated; truth cannot.

### Implications

- Memory pipelines must be idempotent and rebuildable.
- Memory loss is recoverable; conversation loss is not acceptable.
- Memory must never override contradictory conversation truth without explicit user resolution.
- Compression and summarization are reversible in effect (via rebuild), not destructive.

### Examples

- **Allowed:** Nightly memory derivation job from new messages.
- **Forbidden:** Editing user messages to match memory summaries.
- **Allowed:** Integrity scan that triggers memory rebuild from threads.

---

## Article 10 — Exportability And Freedom

### Principle

The user can export everything. Lock-in is unacceptable.

### Rationale

Freedom to leave is the proof that the user truly owns their AI life. Exportability also enables backup, migration, and trust.

### Implications

- Export formats must be documented and stable over time.
- Import preview and rollback protect against bad migrations.
- Core features cannot be held hostage behind proprietary cloud-only storage.
- Business model must not depend on trapping user data.

### Examples

- **Allowed:** Encrypted full-workspace export with user passphrase.
- **Forbidden:** "Delete account and lose all history" as the only migration path.
- **Allowed:** Future portable "AI life bundle" standard (ambition, not yet implemented).

---

## Amendment process

Amending this constitution requires:

1. Written proposal stating which article changes and why.
2. Explicit acknowledgment of user trust, ownership, or continuity impact.
3. Update to [DEVELOPMENT-GUARDRAILS.md](./DEVELOPMENT-GUARDRAILS.md) if new failure modes are identified.
4. Team sign-off before implementation begins.

**Default stance:** When in doubt, choose conversation truth, user ownership, and felt continuity.

---

## Quick reference

| # | Article | One line |
|---|---------|----------|
| 1 | Conversation Is Truth | Messages are canonical |
| 2 | Continuity Over Context | Felt continuity beats window size |
| 3 | The Assistant Remains | Same assistant, any model |
| 4 | User Ownership | User owns AI life |
| 5 | Provider Independence | Never provider-specific |
| 6 | Trust Over Cleverness | Honest, not performative |
| 7 | Simplicity Over Complexity | Hide infrastructure |
| 8 | Continuity Should Be Felt | No memory theater |
| 9 | Memory Serves Continuity | Memory rebuilds from truth |
| 10 | Exportability And Freedom | Export everything |
