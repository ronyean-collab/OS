# Changelog

All notable changes to ContinuityOS Desktop are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) where applicable.

## [0.1.0-beta] — 2026-05-29

### Added

- Daily-driver local telemetry (`daily-driver-metrics.json` in userData)
- Workspace profile (rename, description, health in Settings)
- Playwright file-transfer E2E (export, import, encrypted, wrong password)
- Full soak matrix (24h / 48h / 72h) with CPU and health tracking
- Lazy-loaded Diagnostics and Continuity Inspector chunks
- Release packaging prep (`electron-builder.yml`, `build/icon.svg`)
- `RELEASE-NOTES.md` for beta channel

### Changed

- Renderer bundle split (app + vendor + inspector chunks)
- App footer shows release channel badge
- Diagnostics panel clarifies no secrets in output

## [0.1.0-dev] — Unreleased

### Added

- Electron desktop foundation (local-first workspace shell)
- SQLite persistence with migrations and recovery-safe startup
- OpenAI streaming runtime with partial content persistence
- Stream recovery (interrupted responses preserved on crash)
- Snapshot history with checkpoint payloads
- Atomic checkpoint restore with pre-restore recovery copy
- Workspace export/import foundation with ID remapping
- Replay validation and replay sequence checks
- Reliability audit log (append-only, local-only)
- Thread sidebar, timeline panel, and operational UX
- Centralized app version tracking (`src/shared/app-version.ts`)
- Diagnostics panel with copy-to-clipboard (no secrets)
- Version metadata on snapshots, exports, timeline events, and audit entries

### Changed

- Schema v3: optional version columns on timeline events

### Security

- API keys remain in secure storage only — never in diagnostics output
