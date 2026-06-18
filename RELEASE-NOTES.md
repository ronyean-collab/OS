# ContinuityOS 0.1.0 — Daily Driver Beta (Phase 11 Validated)

**Release channel:** beta  
**Build:** local-dev / CI  
**Validation date:** 2026-05-30  
**Schema version:** 14

## What this release is

ContinuityOS is a **local-first** conversational workspace built for **continuity** — your threads, messages, and recovery paths stay on your device until you choose to export.

The **assistant is the product**; the model is the engine. Phase 10.5 added the **Assistant Identity Layer**; Phase 11 validated it end-to-end.

## Highlights

- **Assistant Identity Layer** — same principles across Ollama, OpenAI adapter paths, and Manual Mode context
- Five-step onboarding with optional assistant naming (default **Assistant**)
- Settings → Assistant: name + web access policy toggle
- Workspace profile, providers center, backups, encrypted export/import
- Recovery mode with calm messaging and diagnostics (no secrets in exports)
- Local-only daily-driver telemetry (counts only, no content)
- **340** Vitest tests + **20** Playwright E2E paths — all passing Phase 11 validation

## Phase 11 validation summary

| Area | Result |
|------|--------|
| Unit tests (`npm test`) | 340/340 PASS |
| Build (`npm run build`) | PASS |
| E2E (`npm run test:e2e`) | 20/20 PASS |
| Soak matrix (24h/48h/72h fast) | 0 failed cycles |
| Continuity 10k/50k sim | PASS |
| Assistant identity + profile | PASS |
| File transfer E2E | 8/8 PASS |

## Getting started

1. Install [Ollama](https://ollama.com) (optional — Manual Mode works without it)
2. Use **Node 24+** (recommended; validation also run on Node 22)
3. Run `npm run dev` or install the packaged build when available
4. Complete onboarding → name assistant (optional) → enter workspace
5. Export a backup from **Project tools → Backups** before major changes

## Known limitations

- In-app chat is **Ollama-only**; cloud providers use Manual Mode with same identity in context packs
- `webEnabled` is policy foundation only — no live web search stack yet
- Full **wall-clock** 24h–72h soak should be run on your machine for production confidence
- No auto-update in this release
- Installer packaging prepared (`electron-builder.yml`) but not shipped from CI yet

## Security

- API keys stored in OS secure storage, never in SQLite or exports
- Diagnostics and exports scanned in tests for secret leakage
- Assistant prompt forbids exposing vectors/embeddings/retrieval to users

## Support

Report issues with diagnostics export (no secrets included) and steps to reproduce.

See also: `DAILY-DRIVER-SCORECARD.md`, `continuity-health-report.md`, `task-feedback-log.txt`
