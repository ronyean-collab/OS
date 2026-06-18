# Known Issues

Accepted limitations and tracked gaps as of Phase 11 (Production Readiness). Not every item is a bug — some are intentional scope boundaries.

## Product scope (not bugs)

- **No cloud sync** — workspaces are per-device unless you manually export/import.
- **No in-app cloud chat streaming** — cloud APIs are Manual Mode / context packs only.
- **No agents, collaboration, billing, marketplace, or plugins** — by design for v1.
- **Auto-update foundation only** — channel metadata exists; full auto-update pipeline may be incomplete.

## Platform & packaging

| Issue | Notes |
|-------|-------|
| Windows icon | `build/icon.svg` may need conversion to `.ico` for polished Windows installers |
| File dialog E2E | Playwright cannot fully automate native OS file pickers; backup roundtrip partially stubbed |
| Long soak in CI | 24h–72h endurance runs use fast mode in automation; full wall-clock soak is manual |

## Providers

| Issue | Notes |
|-------|-------|
| Ollama unavailable at first run | User must install/start Ollama or choose Manual Mode |
| Connection test requires running Ollama | Step 3 blocked until Ollama responds on default host |
| Cloud provider keys | Stored locally in secure storage; misconfiguration shows in provider panel only |

## UX & discoverability

| Issue | Notes |
|-------|-------|
| Project tools depth | Backups, providers, and diagnostics live under Project tools — new users may need guidance |
| Thread rename/archive | Limited E2E coverage; manual QA recommended |
| Duplicate diagnostics copy | Consolidated in Phase 11; report if redundant text reappears |

## Performance

| Issue | Notes |
|-------|-------|
| Renderer bundle size | Approaching internal targets; large workspaces may feel slower on low-RAM machines |
| Very large threads | 10k+ message stress tested in simulation; extreme threads may need archival strategy (future) |

## Recovery & data

| Issue | Notes |
|-------|-------|
| Orphan messages | Rare edge case; Diagnostics offers attach-to-recovered-thread repair |
| Downgrade detection | Opening DB with older app version warns; may block unsafe operations |
| Encrypted export password | User must remember export passphrase — no recovery without it |

## Testing gaps

- Live Ollama not required in CI (mocked/stubbed paths)
- Full export → import file dialog flow partially covered via test bridge
- macOS/Linux installer smoke less frequent than Windows in dev

## Reporting new issues

If something is **not** listed here and blocks your workflow, file a report per [BETA-TESTING-GUIDE.md](./BETA-TESTING-GUIDE.md). We will triage into this document or fix in a patch.
