# ContinuityOS Desktop (v1 foundation)

Local-first AI continuity workspace — Electron + React + Vite + SQLite.

## Milestone 1 + AI runtime

Persistent AI chat workspace with OpenAI streaming:

- Real OpenAI SDK (`gpt-4o-mini` default)
- Token streaming via main process → preload → renderer
- Cancel generation, partial response preserved
- Recent-message context assembly (no vector DB)

## Milestone 1 foundation

Persistent AI chat workspace with:

- Workspaces and threads in SQLite
- Messages (normalized fields + raw provider JSON)
- Timeline events and snapshot placeholders
- OS secure storage for API keys (not in SQLite)
- Supabase client foundation (auth placeholder, sync queue tables)
- Recovery-safe path when SQLite fails

## Quick start

```bash
cd continuity-os-desktop
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Test / verify

```bash
npm test              # Vitest: schema + persistence services
npm run test:verify   # File presence check (no Electron required)
```

Tests cover: migrations, workspace/thread/message persistence, timeline events, restart simulation, secure ref (not plaintext keys in SQLite).

## Architecture

| Layer | Path |
|-------|------|
| Electron main | `electron/main/` |
| Preload bridge | `electron/preload/` |
| IPC handlers | `electron/main/ipc/` |
| SQLite + migrations | `electron/main/database/` |
| Services | `electron/main/services/` |
| Provider adapters | `electron/main/providers/` |
| Secure storage | `electron/main/secure-storage/` |
| Supabase foundation | `electron/main/supabase/` |
| React UI | `src/renderer/src/` |
| Shared types | `src/shared/` |

## Security

- Renderer has no Node integration; uses `window.continuity` preload API only.
- API keys stored via Electron `safeStorage` in `userData/secure-secrets/`.
- `provider_configs.secure_key_ref` points to secure storage — never plaintext keys in SQLite.

## License

Private — ContinuityOS.
