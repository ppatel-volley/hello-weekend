---
name: vgf-state-management
description: |
  VGF state management patterns: reducers, thunks, phases, Store internals, and state versioning.
  Use when writing reducers/thunks, debugging state issues, designing phase transitions, or understanding
  VGF's Redux-inspired server-authoritative state model.
  Triggers: vgf reducer, vgf thunk, game state, phase transition, endIf, onBegin, onEnd, phase runner,
  game runner, store dispatch, state version, state freeze, game ruleset, thunk context,
  phase modification error, reducer not found, engine state machine, dispatch buffer, dispatch buffering,
  async dispatch, dispatchReducer, dispatchInternalReducer, dispatchFromLifecycle, transition depth
version: 2.0.0
author: VGF Docs Team
category: game-development
tags: [vgf, state-management, reducers, thunks, phases, game-state, server-authoritative]
---

# VGF State Management (v4.12.0)

Server-authoritative, Redux-inspired state management for the Volley Games Framework. Now with an engine state machine, dispatch buffering, and async dispatch.

## Core Concepts

| Concept | Pure? | Sync? | Has Context? | Use For |
|---------|-------|-------|--------------|---------|
| **Reducer** | Yes | Yes | No (state + args only) | Deterministic state transforms |
| **Thunk** | No | No | Yes (rich IThunkContext) | Validation, async ops, orchestration |
| **Action** | No | Yes | Yes (limited) | **REMOVED (v4.9.0)** — use reducer + thunk |

**Golden rule:** Reducers for state, thunks for logic, phases for flow.

### Three Dispatch Paths (v4.11.0+)

| Type | Sync/Async | Buffered? | Phase Check? | Who Uses |
|---|---|---|---|---|
| `dispatchReducer` | **Async** (`Promise<void>`) | Yes (when engine not Idle) | Yes | User code, thunks, GameScheduler |
| `dispatchInternalReducer` | **Sync** (`void`) | No | No | Framework only (PhaseRunner) |
| `dispatchFromLifecycle` | **Async** (`Promise<void>`) | No (always inline) | Only in OnBegin | onBegin/onEnd hooks |

## GameRuleset

```typescript
interface GameRuleset<GameState extends BaseGameState> {
    setup: Setup<GameState>                    // Initial state factory
    actions: ActionRecord<GameState>           // REMOVED (v4.9.0) — leave empty {}
    reducers: ReducerRecord<GameState>         // Root-level pure reducers
    thunks: ThunkRecord<GameState>             // Root-level async thunks
    phases: Record<string, Phase<GameState>>   // Phase definitions
    onConnect?: OnConnect<GameState>           // Client connected lifecycle
    onDisconnect?: OnDisconnect<GameState>     // Client disconnected lifecycle
}

interface BaseGameState extends SessionState {
    phase: PhaseName                           // Current phase (MANDATORY)
    previousPhase?: PhaseName                  // Set by framework on transitions
    __vgfStateVersion?: number                 // Auto-incrementing version counter
}
```

**State MUST be JSON-serialisable.** No class instances, functions, Maps, Sets, or circular references.

## Reducers

### Signature

```typescript
type GameReducer<GameState extends BaseGameState, TArgs extends Array<unknown> = never[]> =
    (state: GameState, ...args: TArgs) => GameState
```

### Rules (Violate These and You're Done)

1. **NO side effects** — no console.log, no localStorage, no API calls
2. **NO `Date.now()`** — timestamps MUST come via payload from thunks
3. **NO `Math.random()`** — seed in thunk, pass result
4. **ALWAYS return new object** — VGF calls `Object.freeze()` on state before passing to reducer
5. **Deterministic** — same input → same output, always

### Correct Pattern

```typescript
// Timestamps from thunks via payload
SET_TIMER: (state, timerStartedAt: number, duration: number) => ({
    ...state,
    timerStartedAt,
    timerDuration: duration,
})

// Immutable updates
ADD_PLAYER: (state, player: Player) => ({
    ...state,
    players: [...state.players, player],
})
```

### Anti-Patterns

```typescript
// WRONG: Non-deterministic
SET_TIMESTAMP: (state) => ({ ...state, timestamp: Date.now() })

// WRONG: Mutation (throws TypeError — state is frozen)
ADD_PLAYER: (state, player) => { state.players.push(player); return state }

// WRONG: Silent failure (debug nightmare)
MAKE_MOVE: (state, row, col) => {
    if (state.board[row][col] !== null) return state  // Silent no-op
    // ...
}
```

### Where Validation Goes

**NOT in reducers.** Validation belongs in thunks. A reducer that silently returns unchanged state is a debugging nightmare.

## Thunks

### Signature

```typescript
type GameThunk<GameState extends BaseGameState, TArgs extends Array<unknown> = never[]> =
    (ctx: IThunkContext<GameState>, ...args: TArgs) => Promise<void>
```

### IThunkContext API

| Method/Property | Type | Description |
|----------------|------|-------------|
| `logger` | `ILogger` | Structured logging |
| `getState()` | `() => GameState` | Current FROZEN state (reflects latest dispatches) |
| `getMembers()` | `() => SessionMemberRecord` | All session members |
| `getSessionId()` | `() => SessionId` | Current session ID |
| `getClientId()` | `() => ClientId` | Client who triggered the thunk |
| `dispatch` | `GenericReducerDispatcher` | `(name: string, ...args) => Promise<void>` — **async (v4.11.0+)**, goes through GameRunner.dispatchReducer, subject to buffering |
| `dispatchThunk` | `InternalThunkDispatcher` | `(name: string, ...args) => Promise<void>` — async |
| `scheduler` | `IScheduler` | Failover-safe timer scheduling |
| `sessionManager` | `ISessionManager` | Session management (kickClient, etc.) |

### Key Behaviours

- `ctx.dispatch()` is **async (v4.11.0+)** — goes through `GameRunner.dispatchReducer()`, returns `Promise<void>`, subject to dispatch buffering when engine is not Idle
- `ctx.getState()` reflects latest state after prior dispatches have settled
- `ctx.dispatchThunk()` is **async** — child thunk shares same dispatcher
- State broadcast happens ONCE after the thunk completes (not after each internal dispatch)
- During phase transitions, dispatches from thunks are **buffered** and processed after the transition settles (v4.12.0)

### Service Injection Pattern

```typescript
function createMyThunk(services: GameServices) {
    return async (ctx: IThunkContext<MyGameState>, payload: MyPayload) => {
        const result = await services.externalApi.query(payload.id)
        ctx.dispatch("SET_RESULT", result)
    }
}

// In GameRuleset:
thunks: {
    MY_THUNK: createMyThunk(services),
}
```

### Scheduler Usage in Thunks

```typescript
// Schedule a one-shot timer
await ctx.scheduler.upsertTimeout({
    name: "round:timeout",
    delayMs: 30_000,
    mode: "hold",                    // "hold" = shift forward on restart; "catch-up" = fire missed
    dispatch: { kind: "thunk", name: "END_ROUND" },
})

// Cancel a timer
await ctx.scheduler.cancel("round:timeout")
```

**Dev mode:** VGF scheduler is NoOp with MemoryStorage. Use `services.scheduler ?? ctx.scheduler` pattern with a custom DevScheduler.

## Phase System

### Phase Interface

```typescript
interface Phase<GameState extends BaseGameState, TActions = ActionRecord<GameState>> {
    actions: TActions                          // REMOVED (v4.9.0) — leave empty {}
    reducers: ReducerRecord<GameState>         // Phase-specific (scoped)
    thunks: ThunkRecord<GameState>             // Phase-specific (scoped)
    onBegin?: OnBegin<GameState>               // Lifecycle: entering phase (can return void — v4.11.0+)
    onEnd?: OnEnd<GameState>                   // Lifecycle: leaving phase (can return void — v4.11.0+)
    endIf?: EndIf<GameState>                   // Auto-transition predicate
    next: Next<GameState>                      // Target phase (string or function)
}
```

### Lifecycle Hook Signatures (v4.11.0+)

```typescript
type OnBegin<GameState> = (ctx: IOnBeginContext<GameState>) =>
    GameState | void | Promise<GameState | void>

type OnEnd<GameState> = (ctx: IOnEndContext<GameState>) =>
    GameState | void | Promise<GameState | void>
```

When `void` is returned, the framework skips the `internal:APPLY_STATE_UPDATE` reducer entirely.

### Phase Lifecycle (v4.12.0 — Engine State Machine)

1. **`onBegin(ctx)`** fires when phase starts (engine state: `OnBegin`)
2. Phase is **active** — phase-specific + root reducers/thunks available (engine state: `Idle`)
3. **`endIf(ctx)`** checked after EVERY non-internal reducer dispatch
4. When `endIf()` → `true`:
   - Engine state → `OnEnd`: run `onEnd()` (dispatches via `dispatchFromLifecycle` do NOT trigger endIf)
   - Engine state → `Swapping`: dispatch `internal:SET_PHASE`
   - Engine state → `OnBegin`: run `onBegin()` of next phase (dispatches via `dispatchFromLifecycle` DO trigger endIf — cascading)
   - Engine state → `Draining`: process buffered dispatches
   - Engine state → `Idle`
5. **Cascading:** If new phase's `endIf` is immediately true, loop continues (max depth 10 — `TransitionDepthTracker`)
6. **Dispatch buffering:** Any `dispatchReducer` calls arriving during non-Idle states are queued and processed during drain

### Phase Resolution (Name Lookup)

When dispatching `"SET_SCORE"` during `"playing"` phase:
1. Exact match: `"SET_SCORE"`
2. Phase-prefixed: `"playing:SET_SCORE"`
3. Root-prefixed: `"root:SET_SCORE"`
4. Not found → `ReducerNotFoundError`

Root reducers/thunks available in ALL phases. Phase reducers/thunks scoped to their phase only.

### Phase Modification Protection

User reducers and lifecycle hooks CANNOT modify `state.phase` or `state.previousPhase`. Only framework internal reducers (`internal:SET_PHASE`, `internal:APPLY_STATE_UPDATE`, `internal:FORCE_UPDATE`) can touch these fields.

Violation throws `PhaseModificationError`.

### Phase Naming Constraints

| Constraint | Reason |
|------------|--------|
| Cannot be `root` | Reserved for root-level reducer/thunk prefix |
| Cannot be `internal` | Reserved for framework internal reducers |
| Cannot contain colons | Colons are the namespace delimiter |

## Store Internals

### What the Store Does

1. Loads session from `IStorage`
2. Resolves handler name (direct → phase-prefixed → root-prefixed)
3. Executes reducer/thunk with appropriate context
4. Persists updated state to storage
5. Notifies state listeners

**Note:** The Store's `dispatchReducer()` is **synchronous** (`void`). The `GameRunner` wraps it to add engine state checking, buffering, phase validation, transition checks, and draining — making the external `dispatchReducer()` **async** (`Promise<void>`).

Phase evaluation (`PhaseRunner.checkAndTransitionIfNeeded()`) and state broadcasting are handled by `GameRunner`, NOT the Store.

### State Freezing

Store calls `Object.freeze()` before passing to reducers/thunks:
- Accidental mutation throws `TypeError` in strict mode
- `getState()` returns immutable snapshot
- You MUST spread and create new objects

### State Versioning

`__vgfStateVersion` auto-increments on every mutation. Used for debugging and change detection, not conflict resolution.

## Engine State Machine (v4.12.0)

The `EngineStateManager` tracks per-session engine state through five states:

| State | Value | Meaning |
|---|---|---|
| **Idle** | `"IDLE"` | Ready for dispatches. Normal operation. |
| **OnEnd** | `"ON_END"` | Running `onEnd` lifecycle hook. External dispatches BUFFERED. |
| **Swapping** | `"SWAPPING"` | Executing `internal:SET_PHASE`. External dispatches BUFFERED. |
| **OnBegin** | `"ON_BEGIN"` | Running `onBegin` lifecycle hook. External dispatches BUFFERED. |
| **Draining** | `"DRAINING"` | Processing buffered dispatches after transition. |

**Buffering rule:** Engine is `Idle` → dispatch executes immediately. Engine is NOT `Idle` → dispatch goes into the `DispatchBuffer`.

### DispatchBuffer

Queues `dispatchReducer` calls per-session when the engine is not Idle. After transition completes, `drainBuffer()` processes each item sequentially (apply reducer, validate phase fields, check transitions). Max 100 drain iterations — exceeding throws `DrainOverflowError`.

### TransitionDepthTracker (v4.10.0+)

Limits cascading phase transitions to a maximum depth of 10 (configurable). Throws `TransitionDepthExceededError` when exceeded. When depth returns to 0, engine state is set to `Draining`.

## New Error Types (v4.10.0–v4.12.0)

| Error | Cause |
|-------|-------|
| `TransitionDepthExceededError` | Phase cascade exceeds max depth (default 10) |
| `DrainOverflowError` | Buffer drain exceeds max iterations (default 100) |
| `InvalidInternalReducerError` | Non-whitelisted reducer passed to `dispatchInternalReducer` |
| `CouldNotDetermineNextPhaseError` | `next` returns undefined/null |

## Decision Flowchart

| Need | Use |
|------|-----|
| Simple state transform, no async | **Reducer** |
| Needs validation or conditional logic | **Thunk** (validate, then dispatch reducer) |
| Needs async (API call, timer, DB) | **Thunk** |
| Multiple state changes in sequence | **Thunk** (dispatch multiple reducers) |
| Compose other thunks | **Thunk** (`ctx.dispatchThunk()`) |

## Reference

- [State Management Deep Dive](docs/framework-analysis/03-state-management.md)
- [Phase System](docs/framework-analysis/05-phase-system.md)
