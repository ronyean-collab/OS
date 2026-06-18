# ContinuityOS Development Guardrails

**Status:** Explicit anti-patterns — read before proposing features, UI, partnerships, or business models  
**Authority:** Equal to feature specs; violations require constitution amendment process  
**Related:** [CONTINUITY-CONSTITUTION.md](./CONTINUITY-CONSTITUTION.md) · [PRODUCT-VISION.md](./PRODUCT-VISION.md)

---

## Purpose

ContinuityOS will face pressure to become:

- a ChatGPT clone with extra steps
- an agent platform
- a memory admin console
- a provider marketing vehicle
- a lock-in trap

This document states **what we must never become** — and the **guardrails** that keep development aligned with the vision.

---

## Guardrail 1 — Never provider-specific

**Never become:**

- "The OpenAI app" or "built for Claude"
- A product that only works with one vendor's API for core continuity
- A partner billboard that compromises neutrality

**Guardrails:**

- Ollama remains a first-class default path
- Core continuity works without paid cloud APIs
- Provider branding stays in settings/adapters, not product identity
- No exclusive features tied to a single provider unless constitution amended

**Red flags:** "Only available with GPT-4", OpenAI logo in hero, Claude-only streaming as sole path.

---

## Guardrail 2 — Never agent-first

**Never become:**

- An autonomous agent swarm product
- A tool that takes actions in the background without user visibility
- An "AI that does things while you sleep" engagement machine

**Guardrails:**

- User-initiated conversation remains primary
- Any automation must be explicit, visible, and stoppable
- No hidden tool loops or silent web browsing
- Constitution Articles 6 and 8 (trust + felt continuity) override agent hype

**Red flags:** Agent marketplace, autonomous task queue as hero, "100 tools enabled."

---

## Guardrail 3 — Never memory management software

**Never become:**

- A dashboard where users edit memory fragments as primary UX
- A product that teaches users about embeddings, vectors, or RAG
- A "second brain" admin tool requiring curation labor

**Guardrails:**

- Memory is derived and rebuildable — managed by system, felt by user
- Developer/diagnostic memory views are hidden from default UX
- No memory score gamification or "47 facts stored about you"

**Red flags:** Memory tab as main nav, user-facing vector search UI, "confirm this memory" loops in normal chat.

---

## Guardrail 4 — Never an AI infrastructure dashboard

**Never become:**

- ML ops console for personal users
- Retrieval debugger as product surface
- Compression tier visualizer as selling point

**Guardrails:**

- Hide models, embeddings, retrieval, compression behind assistant layer
- Diagnostics are local support tools — not daily UI
- Marketing speaks to continuity, not pipeline architecture

**Red flags:** Onboarding explaining context windows, hero feature "hybrid RAG", embedding viewer.

---

## Guardrail 5 — Never setup-heavy

**Never become:**

- A product that requires API keys before any value
- A ritual-heavy install that filters out non-technical users
- A local AI tool that assumes expert configuration

**Guardrails:**

- Manual Mode must allow immediate value without keys
- Ollama path optimized for lowest friction reasonable on each OS
- Sensible defaults everywhere; advanced config optional

**Red flags:** "Add API key to continue" on first launch with no Manual Mode, 12-step provider wizard.

---

## Guardrail 6 — Never overly technical

**Never become:**

- A developer tool disguised as consumer product
- Jargon-first copy and UI labels
- Exposing internal service names in user-facing strings

**Guardrails:**

- User nouns: assistant, conversation, project
- Error messages in plain language
- Technical detail in docs/diagnostics, not chat chrome

**Red flags:** "Savepoint integrity failed" as user toast, thread UI showing schema version.

---

## Guardrail 7 — Never manipulative AI

**Never become:**

- Engagement-optimized assistant that guilt trips, flatters endlessly, or fakes intimacy
- Dark patterns that fake urgency or emotional dependency
- Assistant that hallucinates certainty to retain users

**Guardrails:**

- Follow [AI-COMPANION-VISION.md](./AI-COMPANION-VISION.md) trust model
- No notification spam for "your assistant missed you"
- Honest uncertainty required where appropriate

**Red flags:** "I'm worried about you", fake relationship milestones, undisclosed upsell in assistant voice.

---

## Guardrail 8 — Never a lock-in platform

**Never become:**

- Cloud-only history with weak export
- Export that omits conversation truth or requires enterprise tier
- Formats that deliberately block migration

**Guardrails:**

- Export everything — constitution Article 10
- Import preview + rollback
- Documented portable formats over time
- Business model must not depend on trapped data

**Red flags:** "Export limited to last 30 days", encrypted blob with no spec, account deletion only off-ramp.

---

## Guardrail 9 — Never cloud-sync-by-default

**Never become:**

- Surveillance sync product where local is second-class
- Silent upload of conversations for "convenience"
- Telemetry dressed as personalization

**Guardrails:**

- Local-first default
- Optional cloud only with explicit opt-in and user-held keys (future)
- Diagnostics local-only unless user exports

**Red flags:** Mandatory account, background upload, "sign in to save."

---

## Guardrail 10 — Never collaboration-first (v1 scope)

**Never become:**

- Slack-for-AI team product before personal continuity is excellent
- Real-time multi-user editing as core thesis

**Guardrails:**

- Personal AI Operating System first
- Team features only if aligned with export/ownership constitution
- No scope creep into enterprise collab without vision amendment

**Red flags:** Shared workspaces as v1 hero, permissions matrix before solo export works.

---

## Guardrail 11 — Never billing-before-trust

**Never become:**

- Paywall on recovery, export, or core continuity
- Predatory tiers that cripple free users' ownership

**Guardrails:**

- See [BUSINESS-VISION.md](./BUSINESS-VISION.md) monetization philosophy
- Free tier genuinely useful
- Paid = power + support, not fundamental survival of conversations

**Red flags:** "Upgrade to restore backup", export paywall.

---

## Guardrail 12 — Never feature drift without vision review

**Never become:**

- Whatever competitors ship this quarter
- A bundle of trendy AI features with no continuity spine

**Guardrails:**

- New features must map to a constitution article and architecture layer
- [PRODUCT-VISION.md](./PRODUCT-VISION.md) and this file reviewed in major PRs
- "No contradictions" check across vision docs (Phase 7 standard)

**Red flags:** PRD with no continuity story, "users asked for agents" without guardrail review.

---

## Pre-ship checklist

Before shipping a major feature, confirm:

| Question | Required answer |
|----------|-----------------|
| Does it preserve conversation truth? | Yes |
| Does it strengthen felt continuity? | Yes |
| Does it hide complexity from default UX? | Yes |
| Is the assistant still one identity? | Yes |
| Can the user still export everything? | Yes |
| Is Ollama / Manual Mode path still viable? | Yes |
| Does it avoid all 12 guardrails above? | Yes |
| Does it use `buildAssistantIdentityPrompt()` for model calls (not ad-hoc persona)? | Yes |

If any answer is **No**, stop or amend constitution with full documentation.

---

## Assistant Identity Layer guardrails

- **Do not** add provider-specific system prompts that override `assistant-identity-service.ts`.
- **Do not** inject personality per model (“GPT mode”, “Claude mode”).
- **Do not** skip identity prompt in new provider adapters.
- **Do not** expose memory machinery in user-facing copy while identity prompt forbids it.
- **Do** extend identity service when trust rules change — version `assistant_identity_version` in profile.

---

## Escalation

When product, business, or engineering disagree:

1. Default to [CONTINUITY-CONSTITUTION.md](./CONTINUITY-CONSTITUTION.md)
2. If constitution is insufficient, amend it — do not silently bypass
3. Update this guardrails doc with new failure modes discovered

---

## Summary

> **ContinuityOS is a Personal AI Operating System — not a provider billboard, agent circus, memory lab, or lock-in trap. Build so the conversation never dies, the user owns their AI life, and the assistant stays trustworthy when models and vendors change.**
