# Project Configuration — Hello Weekend

> Project-specific configuration for the AI Agent Guidelines.
> Referenced by [`AGENTS.md`](./AGENTS.md).

---

## Project Commands

```bash
# Run all tests
pnpm test -- --run

# Run specific package tests
pnpm --filter @hello-weekend/shared test
pnpm --filter @hello-weekend/server test
pnpm --filter @hello-weekend/display test
pnpm --filter @hello-weekend/controller test

# Type checking
pnpm typecheck

# Production build
pnpm build

# Development mode (starts all 3 apps in parallel)
pnpm dev
```

---

## Test Locations

| Path | Purpose |
|------|---------|
| `packages/shared/src/__tests__/` | Shared types and utilities |
| `apps/server/src/__tests__/` | Server reducers, thunks, phases |
| `apps/display/src/__tests__/` | Display components and hooks |
| `apps/controller/src/__tests__/` | Controller components and hooks |

---

## Dev Mode

```bash
pnpm dev
```

| App | URL | Port |
|-----|-----|------|
| Display | http://127.0.0.1:3000?sessionId=dev-test | 3000 |
| Controller | http://127.0.0.1:5174?sessionId=dev-test | 5174 |
| Server (WGFServer) | http://127.0.0.1:8090 | 8090 |

**Open Display first, then Controller.** Controller dispatches `START_GAME` thunk to begin.

**Dev session:** Server pre-creates `dev-test` session on startup with setInterval re-creation every 2s.

---

## Architecture

- **Framework:** VGF (Volley Games Framework) v4.10.0+, using **WGFServer** (NOT VGFServer)
- **Platform SDK:** v7.46.0 — MaybePlatformProvider, ensureLocalHubSessionId, useDeviceInfo
- **Recognition Service:** @volley/recognition-client-sdk — voice input with text fallback
- **State pattern:** WoF (Wheel of Fortune) — nextPhase field + CLEAR_NEXT_PHASE in every onBegin
- **Phase transitions:** NEVER modify `state.phase` directly. Use `TRANSITION_TO_PHASE` thunk → `SET_NEXT_PHASE` reducer

---

## Keyword Triggers & Task Categories

| Category | Keywords | Learnings |
|----------|----------|-----------|
| VGF Framework | vgf, wgf, reducer, thunk, phase, dispatch | 009, 010, 014-020, 047, 049 |
| Phase Transitions | phase, endIf, onBegin, nextPhase, cascade | 015, 016, 019, 047 |
| Socket.IO / Transport | socket, transport, connection, reconnect | 014, 018 |
| Dev Mode | dev server, session, port, EADDRINUSE | 017, 020 |
| Testing | test, vitest, mock | 001, 002, 003, 005 |
| React Patterns | useRef, useMemo, closure, error boundary | 006, 007 |
| Recognition Service | voice, microphone, transcription, recognition | See BUILDING_TV_GAMES.md |
| Platform SDK | platform, device, VWR, hub session | See BUILDING_TV_GAMES.md |

---

## Critical Gotchas (from BUILDING_TV_GAMES.md)

1. **Use WGFServer, not VGFServer** — WGFServer requires explicit Socket.IO instance + schedulerStore
2. **WGFServer does NOT call onConnect/onDisconnect** — use client-initiated thunks instead
3. **Never modify `state.phase` directly** — throws PhaseModificationError. Use nextPhase pattern
4. **No React StrictMode** — kills VGF Socket.IO transport
5. **Use 127.0.0.1, not localhost** — VPN can intercept localhost DNS
6. **State starts as `{}`** — guard with `"phase" in state` before rendering
7. **`query` not inside `socketOptions`** — clobbers VGF internal params
8. **`useDeviceInfo()` returns methods** — call `.getDeviceId()`, don't destructure
9. **Recognition Service `asrRequestConfig` is REQUIRED** — without it, zero transcripts
10. **Sample rate must be `audioCtx.sampleRate`** — never hardcode 16000

---

## Commit Guidelines

Use conventional commits. Keep the subject line under 72 chars, imperative mood.

---

## Dependencies

- **Prefer existing dependencies** over adding new ones
- **Never update dependencies unless asked**
- **Always commit lockfile changes** — `pnpm-lock.yaml` must stay in sync

---

## Learnings System

Current count: **18 documented learnings**

See [`learnings/INDEX.md`](./learnings/INDEX.md) for the complete categorised list.

### When to Add a Learning

- You make a mistake that could have been prevented
- You discover a non-obvious gotcha in the codebase
- You find a pattern that repeatedly causes issues
- The user points out an error in your approach

### Learning Document Format

File naming: `001-topic.md`, `002-topic.md`, etc.

Each learning should include:
- **Title**: Learning XXX: [Title]
- **Date/Category/Severity** (Critical/High/Medium/Low)
- **The Mistake**: What went wrong
- **Why This Is Wrong**: Explanation
- **The Correct Process**: Step-by-step correct approach
- **Red Flags to Watch For**: Warning signs
- **Prevention**: How to avoid this in the future
