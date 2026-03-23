---
name: vgf-game-dev
description: |
  Build multiplayer real-time games with the Volley Games Framework (VGF). Covers server-authoritative architecture,
  GameRuleset design, two-device model (Display TV + Controller phone), project scaffolding, and deployment patterns.
  Use when building new VGF games, scaffolding projects, setting up VGFServer/WGFServer, or wiring Display/Controller clients.
  Triggers: vgf, volley games framework, vgf game, multiplayer game, party game, game server, game client,
  display controller, two device, vgf server, wgf server, game ruleset, vgf provider, engine state machine,
  dispatch buffering, WGFServer, VGFServer
version: 2.0.0
author: VGF Docs Team
category: game-development
tags: [vgf, multiplayer, typescript, socket.io, react, game-framework, server-authoritative]
---

# VGF Game Development

Build multiplayer, real-time games with the Volley Games Framework — a server-authoritative TypeScript framework.

## Framework Overview

**VGF v4.12.0** is an opinionated framework for building multiplayer real-time games. Server-authoritative, Redux-inspired state management, phase-based game flow, and an engine state machine that prevents race conditions during phase transitions.

**Key v4.12.0 features:** Engine state machine (EngineStateManager), dispatch buffering (DispatchBuffer), cascade depth limiting (TransitionDepthTracker), async `dispatchReducer`, and lifecycle hooks that can return void. Actions were **removed in v4.9.0** — use reducers and thunks exclusively.

### Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Language | TypeScript (ES Modules) | 5.8+ |
| Runtime | Node.js | 22+ |
| Transport | Socket.IO | 4.8.1 |
| HTTP | Express | 4.21.2 |
| Persistence | ioredis (Redis) | 5.6.0 |
| Client UI | React | 19.0.0 |
| Testing | Vitest | 3.1+ |
| Validation | Zod | 3.23+ |
| Bundling | Tsup | 8.5+ |
| Package Manager | pnpm | 10.6.2 |

### Package Exports

| Export | Purpose |
|---|---|
| `@volley/vgf/server` | VGFServer, WGFServer, storage, transport, persistence, schedulers, game runner |
| `@volley/vgf/client` | PartyTimeClient, WGFClient, VGFProvider, React hooks, transport |
| `@volley/vgf/types` | GameRuleset, phases, reducers, thunks, session types, contexts |
| `@volley/vgf/util` | Utility functions |

## The Two-Device Model

Every VGF game follows this architecture:

| Component | Role | Port |
|-----------|------|------|
| **Display** (TV) | Renders game: puzzles, timer, scores | 3000 |
| **Controller** (Phone) | Player input: mic, buttons, text | 5173 |
| **Server** | Authoritative game state, all game logic | 8080 (VGFServer) / 8090 (WGFServer dev) |

Clients never trust each other. The server is always right.

## Building a Game: The Seven Steps

### Step 1: Define Game State

```typescript
// Broadcast state (sent to all clients)
interface MyGameState extends BaseGameState {
    phase: "lobby" | "playing" | "gameOver"
    // ... game-specific fields
}

// Server-only state (NEVER sent to clients — anti-cheat)
interface ServerOnlyState {
    answers: string[]
    // ... secret fields
}
// Stored in Map<sessionId, ServerOnlyState> on server
```

**Critical:** `BaseGameState` requires `phase`, optional `previousPhase` and `__vgfStateVersion`. State MUST be JSON-serialisable.

### Step 2: Write Reducers

Pure, synchronous, deterministic. `(state, ...args) => newState`. State is `Object.freeze()`-d before being passed to the reducer.

```typescript
const reducers = {
    SET_SCORE: (state: MyGameState, playerId: string, score: number) => ({
        ...state,
        scores: { ...state.scores, [playerId]: score },
    }),
}
```

**Rules:**
- NO `Date.now()` — timestamps come via payload from thunks
- NO `Math.random()` — seed in thunk, pass result
- NO side effects — no console.log, no API calls
- ALWAYS return new object — state is `Object.freeze()`-d
- NO validation — that belongs in thunks

### Step 3: Write Thunks

Async operations with rich context. `(ctx: IThunkContext, ...args) => Promise<void>`

```typescript
const thunks = {
    PLAY_TURN: async (ctx, row: number, col: number) => {
        // Validation HERE
        if (ctx.getState().currentPlayer !== ctx.getClientId()) return

        ctx.dispatch("MAKE_MARK", row, col, ctx.getClientId())

        if (checkWinner(ctx.getState().board)) {
            ctx.dispatch("SET_WINNER", ctx.getClientId())
        }
    },
}
```

**ThunkContext API:** `logger`, `getState()`, `getMembers()`, `getSessionId()`, `getClientId()`, `dispatch()` (async — goes through GameRunner.dispatchReducer, subject to buffering), `dispatchThunk()`, `scheduler`, `sessionManager`

**Service injection pattern** (closures):
```typescript
function createMyThunk(services: GameServices) {
    return async (ctx: ThunkContext, payload: MyPayload) => {
        const result = await services.externalApi.query(...)
        ctx.dispatch("SET_RESULT", result)
    }
}
```

### Step 4: Define Phases

```typescript
const phases = {
    lobby: {
        actions: {}, reducers: {}, thunks: {},  // actions REMOVED (v4.9.0) — leave empty
        endIf: (ctx) => ctx.session.state.playerReady,
        next: "playing",
    },
    playing: {
        actions: {}, reducers: {}, thunks: {},
        endIf: (ctx) => ctx.session.state.gameComplete,
        next: "gameOver",
        onBegin: async (ctx) => {
            // v4.11.0+: can return void (no state return required)
            // Dispatches here use dispatchFromLifecycle (inline, never buffered)
        },
    },
    gameOver: {
        actions: {}, reducers: {}, thunks: {},
        endIf: undefined,  // Terminal — use thunks to transition
        next: "playing",
    },
}
```

**Phase lifecycle (v4.12.0):** `onBegin()` → active (reducers/thunks available) → `endIf()` checked after every reducer dispatch → `next()` → `onEnd()` → `internal:SET_PHASE` → `onBegin()` of next phase

**Engine state during transitions:** Idle → OnEnd → Swapping → OnBegin → Draining → Idle. Dispatches arriving during non-Idle states are **buffered** and processed after the transition completes.

**Lifecycle hooks (v4.11.0+):** `onBegin` and `onEnd` can return `void` or `Promise<void>` — no longer required to return state. When void is returned, the framework skips `internal:APPLY_STATE_UPDATE`.

**Cascade depth limiting (v4.10.0+):** `TransitionDepthTracker` limits cascading transitions to 10 by default. Exceeding this throws `TransitionDepthExceededError`.

**Phase naming constraints:** Cannot be `root` or `internal`, cannot contain colons.

### Step 5: Create GameRuleset

```typescript
export function createGameRuleset(services: GameServices): GameRuleset<MyGameState> {
    return {
        setup: createInitialState,
        actions: {},               // REMOVED (v4.9.0) — leave empty
        reducers: globalReducers,
        thunks: { ...globalThunks, ...phaseThunks },
        phases: createPhases(services),
        onConnect: createOnConnect(services),
        onDisconnect: createOnDisconnect(services),
    }
}
```

### Step 6: Set Up Server

**New architecture (WGFServer — recommended for new games):**

```typescript
import { WGFServer, MemoryStorage } from "@volley/vgf/server"

const storage = new MemoryStorage()
const server = new WGFServer({
    port: 8090, app, httpServer, storage, logger,
    game: createGameRuleset(services),
})
server.start()
```

WGFServer uses `GameRunner` with the full engine state machine (EngineStateManager, DispatchBuffer, PhaseRunner with TransitionDepthTracker). `dispatchReducer` returns `Promise<void>`.

**Legacy architecture (VGFServer):**

```typescript
import { VGFServer, SocketIOTransport, MemoryStorage, HTTPMethod } from "@volley/vgf/server"

const storage = new MemoryStorage()
const transport = new SocketIOTransport({ httpServer, storage, logger, socketOptions: { cors: { origin: true } } })

const server = new VGFServer({
    port: 8080, app, httpServer, transport, storage, logger,
    game: createGameRuleset(services),
})

server.registerRoute({ path: "/healthz", method: HTTPMethod.GET, handler: healthz })
server.start()
```

**Dev mode:** Pre-create a session with ID `"dev-test"` via `storage.createSession()`. VGF's scheduler is NoOp with MemoryStorage — use a custom DevScheduler (setTimeout-based) injected via `services.scheduler`.

### Step 7: Set Up Clients

```typescript
import { VGFProvider, createSocketIOClientTransport, ClientType } from "@volley/vgf/client"

const transport = createSocketIOClientTransport({
    url: "http://localhost:8080",
    query: { sessionId, userId, clientType: ClientType.Display },
    socketOptions: { transports: ["polling", "websocket"], upgrade: true },
})

<VGFProvider transport={transport}>{children}</VGFProvider>
```

**Hooks (16 total):** `useStateSync()`, `useStateSyncSelector(fn)`, `useDispatch()`, `useDispatchThunk()`, `useDispatchAction()` (legacy), `usePhase()`, `useSessionMembers()`, `useSessionMember()`, `useConnectionStatus()`, `useSessionId()`, `useClientId()`, `useTransport()`, `useLogger()`, `useVGFClient()`, `useEvents()`, `useClientActions()`

## Key Patterns

### Timer Sync
Server stores timestamps (`timerStartedAt`, `timerDuration`, `timerPausedAt`). Client interpolates locally via `requestAnimationFrame`. NO tick broadcasts.

### Anti-Cheat
Answers/secrets in server-only state (Map). Client never sees correct answer until server reveals it.

### Fire-and-Forget Persistence
MemoryStorage (fast, in-process) → async RedisPersistence (durable, background). Game loop never blocks on I/O.

### Phase-Scoped Resolution
Root reducers/thunks available in ALL phases. Phase reducers/thunks scoped to their phase. Resolution: exact → `{phase}:{name}` → `root:{name}`.

### Dispatch Buffering (v4.12.0)
During phase transitions (engine state is not Idle), incoming `dispatchReducer` calls are queued in the `DispatchBuffer`. After the transition completes, buffered dispatches are drained sequentially. Max 100 drain iterations (throws `DrainOverflowError` if exceeded).

### Scheduler Cleanup (v4.9.2+)
`IScheduler.dispose()` clears all timers to prevent memory leaks. Called automatically during `GameRunner.deleteSession()` cleanup.

## Project Structure

```
my-game/
├── apps/
│   ├── server/src/           # VGFServer + Express
│   │   ├── ruleset.ts        # GameRuleset factory
│   │   ├── reducers.ts       # All reducers
│   │   ├── thunks.ts         # All thunks
│   │   ├── phases.ts         # Phase definitions
│   │   └── dev.ts            # Dev server entry
│   ├── display/src/          # TV app (React + Vite)
│   └── controller/src/       # Phone app (React + Vite)
├── packages/shared/src/      # Shared types, constants
├── pnpm-workspace.yaml
└── package.json
```

## Reference

- [Framework Analysis: Overview](docs/framework-analysis/01-framework-overview.md)
- [Framework Analysis: Architecture](docs/framework-analysis/02-architecture-deep-dive.md)
- [Framework Analysis: Building a Game](docs/framework-analysis/07-building-a-game.md)
