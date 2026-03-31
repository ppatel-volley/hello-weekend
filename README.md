# Hello Weekend — VGF Game Starter

A forkable starter template for building multiplayer TV games with the
[Volley Games Framework (VGF)](https://github.com/nicholasgasior/volley).
It implements a simple voice-powered trivia game to demonstrate the full
server + display + controller loop.

## Architecture

VGF uses a **two-device model**:

| App | Port | Role |
|---|---|---|
| `apps/server` | 8090 | Game server (Node + Socket.IO). Owns all game state. |
| `apps/display` | 3000 | TV client (React + Vite). Renders scenes read-only. |
| `apps/controller` | 5174 | Phone client (React + Vite). Sends player input. |
| `packages/shared` | — | Types, constants, and initial state shared by all three. |

### Phase flow

```
lobby ──▶ playing ──▶ gameOver
  ▲                       │
  └───────────────────────┘
```

Phase transitions use the **WoF pattern** — thunks dispatch `SET_NEXT_PHASE`,
each phase's `endIf` checks `hasNextPhase`, and `next` returns the target.
Reducers never modify `state.phase` directly (VGF 4.8+ throws
`PhaseModificationError`).

## Prerequisites

- **Node.js 22+** (uses built-in `process.loadEnvFile`)
- **pnpm 10+**
- Access to the **Volley npm registry** for `@volley/*` packages

## Getting started

```bash
# 1. Install dependencies
pnpm install

# 2. Build the shared package (required before first dev run)
pnpm --filter @hello-weekend/shared build

# 3. Copy the example env file
cp .env.example .env

# 4. Start all three apps (server, display, controller) in parallel
pnpm dev
```

> **Important:** Step 2 compiles the shared TypeScript package to `dist/`. The server, display, and controller all import from `@hello-weekend/shared/dist/`. If you skip this, you'll get `ERR_MODULE_NOT_FOUND` errors. You only need to do this once (or after changing shared types).

Then open:

| URL | What |
|---|---|
| `http://localhost:3000?sessionId=dev-test` | Display (TV) |
| `http://localhost:5174?sessionId=dev-test` | Controller (phone) |
| `http://localhost:8090/health` | Server health check |

The dev server pre-creates a `dev-test` session automatically.

## Scripts

Run from the monorepo root:

| Command | Description |
|---|---|
| `pnpm dev` | Start server, display, and controller in watch mode |
| `pnpm build` | Build all packages |
| `pnpm test` | Run vitest in watch mode across all packages |
| `pnpm test:run` | Run tests once (CI-friendly) |
| `pnpm typecheck` | Type-check all packages |
| `pnpm clean` | Remove all `dist` directories |

## Forking this for your own game

### 1. Rename the game

The game ID lives in one place: `packages/shared/src/constants.ts` → `GAME_ID`.
Change it there and it propagates to both clients and the server.

You will also want to update:

- `name` fields in each `package.json` (e.g. `@hello-weekend/server` →
  `@your-game/server`)
- `pnpm-lock.yaml` — regenerate with `pnpm install` after renaming
- The `@hello-weekend/shared` import alias — find-and-replace across the repo

### 2. Define your state

Edit `packages/shared/src/types.ts` to define your game's state shape.
Update `packages/shared/src/state.ts` to set the initial values.

### 3. Add your game logic

- **Phases** — `apps/server/src/phases.ts` defines the phase graph
- **Reducers** — `apps/server/src/reducers.ts` for pure state transitions
- **Thunks** — `apps/server/src/thunks.ts` for async operations
- **Services** — `apps/server/src/services.ts` for server-only state

### 4. Build your UI

- **Display scenes** — `apps/display/src/components/` (read-only rendering)
- **Controller views** — `apps/controller/src/components/` (player input)

Both apps use `useStateSync()` to read game state and `useDispatchThunk()` to
send actions to the server.

## Project structure

```
hello-weekend/
├── apps/
│   ├── server/          # VGF game server
│   │   └── src/
│   │       ├── dev.ts         # Dev server with auto-session
│   │       ├── ruleset.ts     # GameRuleset entry point
│   │       ├── phases.ts      # Phase definitions + transitions
│   │       ├── reducers.ts    # Pure state reducers
│   │       ├── thunks.ts      # Async game logic
│   │       ├── questions.ts   # Question bank
│   │       └── services.ts    # Server-only state container
│   ├── display/         # TV client (React + Vite)
│   │   └── src/
│   │       ├── components/    # Scene components per phase
│   │       ├── hooks/         # VGF state hooks
│   │       ├── providers/     # VGF + Platform SDK providers
│   │       └── utils/         # Platform detection
│   └── controller/      # Phone client (React + Vite)
│       └── src/
│           ├── components/    # Controller components per phase
│           ├── hooks/         # VGF state hooks
│           ├── providers/     # VGF + Platform SDK providers
│           └── utils/         # URL param helpers
├── packages/
│   └── shared/          # Types, constants, initial state
├── learnings/           # VGF gotchas and pattern docs
└── skills/              # Claude Code workflow skills
```

## Voice input

The controller uses the Volley Recognition Service SDK for speech-to-text.
If the SDK is unavailable (e.g. no VPN), it falls back to a text input field
automatically.

Set `VITE_RECOGNITION_STAGE` in `.env` to control which recognition
environment is used (defaults to `dev`).

## For AI agents: building a game from this template

If you're an AI agent helping someone fork this template to build a game:

1. **Fork/copy the repo** — either via `crucible create` (automates renaming) or manually
2. **Rename all references** — find-and-replace `hello-weekend` → `your-game`, `HelloWeekend` → `YourGame`, `@hello-weekend` → `@your-game`, `Hello Weekend` → `Your Game` across all files
3. **Install deps** — `pnpm install`
4. **Build shared** — `pnpm --filter */shared build` (MUST do this before dev or you'll get import errors)
5. **Run dev** — `pnpm dev` then open `http://localhost:3000?sessionId=dev-test` (display) and `http://localhost:5174?sessionId=dev-test` (controller)
6. **The `?sessionId=dev-test` is required** — without it, the display/controller show "connecting" forever. The dev server auto-creates this session.

### Common mistakes to avoid

- **Don't skip the shared build** — `ERR_MODULE_NOT_FOUND` for `@your-game/shared/dist/index.js` means you didn't run step 4
- **Don't use `localhost` for the server URL in providers** — use `127.0.0.1` (some systems resolve localhost to IPv6 `::1` which Vite doesn't bind to)
- **Don't mutate `state.phase` in reducers** — VGF 4.8+ throws `PhaseModificationError`. Use thunks with `TRANSITION_TO_PHASE`
- **Don't forget `[key: string]: unknown`** on your state interface — VGF requires this index signature
- **Kill stale processes** — if ports 3000/5174/8090 are in use from a previous run, `pnpm dev` will fail. Kill them first: `npx kill-port 3000 5174 8090`

### Using Crucible (optional)

[Crucible](https://github.com/ppatel-volley/crucible) automates the fork + rename process:

```bash
crucible create "Your Game Name"   # clones, renames, generates Dockerfile + CI, pushes to GitHub
crucible dev your-game-name        # builds shared + starts all three processes
crucible agent your-game-name      # AI agent to build your game logic
```

## Key VGF patterns demonstrated

- **WoF phase transitions** — thunk-driven, never direct `state.phase` mutation
- **Server-only state** — answers stored in `GameServices.serverState`, never
  leaked to clients
- **Conditional PlatformProvider** — only loaded on real TV hardware
- **`ensureLocalHubSessionId`** — injects fallback session ID for local dev
- **SocketIOClientTransport** — `query` at top level, `transports: ["polling", "websocket"]`
