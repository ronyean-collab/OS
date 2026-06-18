# ContinuityOS Desktop

**A local-first workspace where conversations, memory, and continuity persist on your device.**

ContinuityOS is not another chat tab. It is a **continuity layer** for AI work: threads, snapshots, backups, recovery, and context assembly stay on your machine — recoverable after crashes, restarts, and upgrades.

## What is ContinuityOS?

ContinuityOS Desktop is an Electron application that gives you:

- **Persistent workspaces** — threads, messages, and timeline events in SQLite
- **Recoverable streaming** — interrupted generations can be recovered; partial work is not lost silently
- **Local backups & import** — encrypted exports, preview-before-import, rollback on failure
- **Manual Mode** — use any external AI via context packs while continuity stays local
- **In-app chat (Ollama)** — optional local model chat without sending workspace data to the cloud
- **Diagnostics** — local-only health signals (runtime, recovery, provider, startup, migrations)

## Why it exists

Most AI tools optimize for **single-session chat**. ContinuityOS optimizes for **work that spans sessions** — projects, decisions, and context that must survive restarts, provider switches, and human interruption.

## Core philosophy

| Principle | Meaning |
|-----------|---------|
| **Local-first** | Your data lives in your user profile, not a vendor silo |
| **Continuity-first** | Messages are canonical; recovery and snapshots are first-class |
| **Calm UX** | No agent swarms, memory dashboards, or cloud-sync pressure |
| **Honest boundaries** | Cloud providers are Manual Mode; in-app chat is Ollama-only by design |
| **Recoverable by default** | Backups, migrations, and diagnostics support real-world failure |

We intentionally do **not** ship (in v1): agents, cloud sync, collaboration, billing, marketplace, or plugin systems.

## Local-first design

- SQLite database under Electron `userData`
- API keys in OS secure storage (`safeStorage`), referenced — never stored in plaintext in SQLite
- Diagnostics and metrics are **local only** — no cloud telemetry
- Exports are user-initiated; imports are previewed

## Continuity architecture (overview)

```
┌─────────────────────────────────────────────────────────┐
│  Renderer (React) — chat, onboarding, workspace ops     │
└───────────────────────────┬─────────────────────────────┘
                            │ IPC (preload bridge)
┌───────────────────────────▼─────────────────────────────┐
│  Main process — services, providers, stream runtime     │
│  • context-assembly  • snapshots  • backups             │
│  • migrations        • recovery   • diagnostics         │
└───────────────────────────┬─────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────┐
│  SQLite + secure storage + local audit/metrics files      │
└─────────────────────────────────────────────────────────┘
```

See [ARCHITECTURE-OVERVIEW.md](./ARCHITECTURE-OVERVIEW.md) for detail.

## Quick start

```bash
git clone <repo>
cd continuity-os-desktop
npm install
npm run dev
```

On first launch, complete the onboarding wizard: choose **Ollama** for in-app chat or **Manual Mode** to start without a local model.

## Build & release

```bash
npm run build          # compile main + renderer
npm run dist           # packaged installer (electron-builder)
```

See [RELEASE-ENGINEERING-REVIEW.md](./RELEASE-ENGINEERING-REVIEW.md) and [RELEASE-NOTES.md](./RELEASE-NOTES.md).

## Test & verify

```bash
npm test               # Vitest (unit + integration)
npm run test:e2e       # Playwright (requires build)
npm run test:release   # release-oriented test bundle
```

## Documentation index

### Vision foundation (source of truth)

| Document | Purpose |
|----------|---------|
| [PRODUCT-VISION.md](./PRODUCT-VISION.md) | Mission, promise, philosophy |
| [CONTINUITY-CONSTITUTION.md](./CONTINUITY-CONSTITUTION.md) | Non-negotiable governing principles |
| [AI-COMPANION-VISION.md](./AI-COMPANION-VISION.md) | Assistant identity and behavior |
| [BUSINESS-VISION.md](./BUSINESS-VISION.md) | Market, users, monetization philosophy |
| [FUTURE-ARCHITECTURE-VISION.md](./FUTURE-ARCHITECTURE-VISION.md) | Layered architecture philosophy |
| [DEVELOPMENT-GUARDRAILS.md](./DEVELOPMENT-GUARDRAILS.md) | What we must never become |

### Beta & operations

| Document | Purpose |
|----------|---------|
| [BETA-TESTING-GUIDE.md](./BETA-TESTING-GUIDE.md) | Beta tester onboarding |
| [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) | Common fixes |
| [KNOWN-ISSUES.md](./KNOWN-ISSUES.md) | Accepted limitations |
| [PRODUCT-VISION.md](./PRODUCT-VISION.md) | Product direction |
| [WHY-CONTINUITYOS.md](./WHY-CONTINUITYOS.md) | Differentiation |
| [SECURITY-CHECKLIST.md](./SECURITY-CHECKLIST.md) | Security review |
| [docs/MANUAL-QA-CHECKLIST.md](./docs/MANUAL-QA-CHECKLIST.md) | Manual QA |

## Project layout

| Layer | Path |
|-------|------|
| Electron main | `electron/main/` |
| Preload bridge | `electron/preload/` |
| IPC | `electron/main/ipc/` |
| Database | `electron/main/database/` |
| Services | `electron/main/services/` |
| React UI | `src/renderer/src/` |
| Shared types | `src/shared/` |
| E2E tests | `tests/e2e/` |

## License

Private — ContinuityOS.
