# ContinuityOS Phase 16 — Consumer Experience Review

Date: 2026-05-28

## Current UX Strengths

- **Local-first reliability** — Conversations persist on device; restart does not repeat onboarding; crash recovery copy is calm rather than alarming.
- **Structured onboarding wizard** — Five clear steps (Welcome → Name → Provider → Optional test → Ready) with skip paths for naming and connection testing.
- **Chat-first shell** — After onboarding the main view is the conversation panel with thread sidebar; Project Tools are optional and no longer auto-open.
- **Consumer welcome copy** — Empty chat state greets users with “Hi, I'm your ContinuityOS assistant” and “What would you like to work on today?” without memory or continuity jargon.
- **Settings simplification** — Assistant and Appearance sections are visible first; workspace health, diagnostics, and telemetry live under a collapsed Advanced section.
- **Guided routines softened** — Welcome guidance is “Need a hand?” with Start typing / Connect AI instead of import/review memory actions on first open.
- **Provider independence preserved** — “Set up later” path lets users chat manually immediately; provider setup remains one click away in Workspace → Providers.
- **Shared copy module** — `consumer-experience-copy.ts` centralizes user-facing strings for chat empty states, thread sidebar, and settings.

## Current UX Weaknesses

- **Dual vocabulary** — Some surfaces still say “ContinuityOS Guide,” “memory import,” and “context pack” in advanced flows (help intent, import workflows, failure guides).
- **Workspace toggle label** — “Workspace” vs “Close panel” is functional but not self-explanatory for new users.
- **Thread management discoverability** — Rename/archive via ⋯ menu is documented in footer hint text but not surfaced in empty states.
- **Provider setup depth** — Cloud provider cards still expose technical setup steps; appropriate for power users but dense if opened accidentally.
- **No in-app “what is ContinuityOS?”** — First-run copy is friendly but does not briefly explain value beyond “calm place to work.”
- **Loading screen** — Generic “Starting ContinuityOS…” / “Almost there…” without progress indication during migrations.
- **Manual chat without provider** — Sending works locally but users may not understand why there is no AI reply until they connect a provider.
- **Backup vs restore point** — Two related concepts (export backup vs snapshot restore) share one panel; labels improved but still require reading.

## Top 10 Friction Points

1. **Onboarding step count** — Five steps (even with skips) is more than the stated goal of Install → Open → Name → Chat; “Set up later” helps but provider step still appears mandatory.
2. **Project Tools naming** — “Workspace” toggle hides Providers, Backups, and Settings; beginners may not find Connect AI from chat empty state alone.
3. **Technical guide bubble** — Typing “help” still surfaces memory/import vocabulary via conversational shell.
4. **Assistant identity split** — Name set in onboarding vs Settings → Assistant can diverge if user skips naming.
5. **Thread auto-creation** — Main thread auto-created on complete is good; additional threads require discovering “+” in sidebar.
6. **Composer disabled states** — When provider setup is required, composer hints are improved but send behavior vs manual save is subtle.
7. **Recovery mode visibility** — Recovery banner is calm but still exposes “recovery” terminology.
8. **Settings Advanced disclosure** — Health/diagnostics hidden correctly, but Activity empty state may feel like something is broken before first chat.
9. **E2E / dev paths** — Diagnostics and Continuity Inspector remain in codebase for developers; must stay out of default consumer paths (currently OK).
10. **Cross-surface copy drift** — Some unit tests and older docs still reference “Manual Mode” and “Enter workspace”; consumer copy updated but legacy strings linger in advanced modules.

## Recommended Improvements (Next UX Pass)

1. **Optional onboarding** — Collapse provider step behind “Connect AI later” on step 1 for a 3-step path: Welcome → Name → Chat.
2. **Rename Workspace toggle** — Use “Tools” or “Settings & backups” with clearer iconography.
3. **Inline Connect AI** — When provider offline, show a single persistent chip in composer footer instead of guide cards.
4. **Conversational shell consumer pass** — Replace “ContinuityOS Guide” with assistant name; strip memory/import from default help responses.
5. **First message templates** — Optional suggested prompts in empty state (“Plan my day,” “Continue a project”) without mentioning continuity systems.
6. **Progress on load** — Show migration/loading step label consistently in footer during startup.
7. **Thread empty CTA** — Prominent “New conversation” in sidebar empty state (copy exists; ensure visual weight).
8. **Unified backup language** — Use “Download a copy” and “Restore from snapshot” consistently; hide encrypted paths under Advanced.
9. **Onboarding analytics-free completion signal** — Brief toast “You're ready” (already partially implemented via runtime presence).
10. **Playwright journey expansion** — Add journey for Connect AI from empty state and for recovery banner dismissal after simulated crash.

## Phase 16 Changes Summary

| Area | Change |
|------|--------|
| Onboarding | “Get started,” “How do you want to chat?,” “You're ready,” “Start chatting”; Ollama + Set up later first |
| Welcome | Chat empty state consumer greeting; no memory/embedding mentions |
| Chat | Conversation-first layout CSS; simplified empty actions |
| Threads | “Conversations” header; friendlier empty copy |
| Settings | Activity first; Advanced `<details>` for health/diagnostics |
| Empty states | Shared consumer copy module |
| Daily driver | Calmer startup subtitle; no auto-open Project Tools after onboarding |
| Tests | Updated unit tests + new `user-journeys.spec.ts` |

## Out of Scope (Honored)

- No new intelligence engines
- No new memory systems
- No new databases
