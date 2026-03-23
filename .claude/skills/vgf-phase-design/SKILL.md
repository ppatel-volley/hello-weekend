---
name: vgf-phase-design
description: |
  Design and implement VGF phase systems: phase definitions, transitions, lifecycle hooks, endIf conditions,
  cascading transitions, and real-world phase patterns. Use when designing game flow, debugging phase transitions,
  implementing endIf/next/onBegin/onEnd, or understanding the PhaseRunner.
  Triggers: vgf phase, phase design, endIf, onBegin, onEnd, phase transition, phase runner, game flow,
  state machine, game phase, lobby phase, game over phase, cascading transition, phase modification,
  engine state machine, dispatch buffering, transition depth, cascade depth, WoF pattern, dispatchFromLifecycle
version: 2.0.0
author: VGF Docs Team
category: game-development
tags: [vgf, phases, state-machine, game-flow, transitions, lifecycle]
---

# VGF Phase Design (v4.12.0)

Design game flow with VGF's phase system — a structured state machine for game stages. Now integrated with the engine state machine, dispatch buffering, and cascade depth limiting.

## Phase Interface

```typescript
interface Phase<GameState extends BaseGameState, TActions = ActionRecord<GameState>> {
    actions: TActions                    // REMOVED (v4.9.0) — leave empty {}
    reducers: ReducerRecord<GameState>   // Phase-scoped reducers
    thunks: ThunkRecord<GameState>       // Phase-scoped thunks
    onBegin?: OnBegin<GameState>         // Fires when entering phase (can return void — v4.11.0+)
    onEnd?: OnEnd<GameState>             // Fires when leaving phase (can return void — v4.11.0+)
    endIf?: EndIf<GameState>             // Auto-transition predicate
    next: Next<GameState>                // Target phase (string or function)
}
```

## Phase Lifecycle (v4.12.0 — Engine State Machine)

1. **`onBegin(ctx)`** — Receives `IOnBeginContext` with reducer/thunk dispatchers, `getState()`. Returns `GameState | void | Promise<GameState | void>` (void support added v4.11.0). CANNOT modify `state.phase` or `state.previousPhase`. Engine state: `OnBegin`. Dispatches via `dispatchFromLifecycle` DO trigger endIf (cascading).

2. **Phase active** — Phase-specific + root reducers/thunks are available. Engine state: `Idle`.

3. **`endIf(ctx)`** — Checked after EVERY non-internal reducer dispatch. Returns boolean.

4. **When `endIf` → true:**
   - Engine state → `OnEnd`: `onEnd(ctx)` fires for outgoing phase. Dispatches via `dispatchFromLifecycle` do NOT trigger endIf (onEnd is a finaliser).
   - Engine state → `Swapping`: `internal:SET_PHASE` dispatched (via `dispatchInternalReducer` — synchronous)
   - Engine state → `OnBegin`: `onBegin(ctx)` fires for incoming phase. Dispatches via `dispatchFromLifecycle` DO trigger endIf (cascading).
   - Engine state → `Draining`: buffered dispatches processed sequentially
   - Engine state → `Idle`

5. **Cascading** — If new phase's `endIf` is immediately true, PhaseRunner loops (max depth 10 — `TransitionDepthTracker`).

6. **Dispatch buffering (v4.12.0)** — Any `dispatchReducer` calls arriving during non-Idle engine states are queued in the `DispatchBuffer` and processed during the drain phase. Max 100 drain iterations (throws `DrainOverflowError`).

## Common Phase Patterns

### Lobby → Playing → GameOver (Standard)

```typescript
const phases = {
    lobby: {
        actions: {}, reducers: {}, thunks: {},
        endIf: (ctx) => ctx.session.state.allPlayersReady,
        next: "playing",
    },
    playing: {
        actions: {}, reducers: {}, thunks: {},
        endIf: (ctx) => ctx.session.state.gameComplete,
        next: "gameOver",
        onBegin: async (ctx) => {
            // Load questions, start timers
            // v4.11.0+: can return void — no need to return state
        },
    },
    gameOver: {
        actions: {}, reducers: {}, thunks: {},
        endIf: undefined,        // Terminal — thunks handle transitions
        next: "playing",         // Default for endPhase() calls
    },
}
```

### Dynamic Next (Branching)

```typescript
lobby: {
    endIf: (ctx) => ctx.session.state.controllerConnected,
    next: (ctx) => {
        if (ctx.session.state.isFtue) return "playing"     // Skip selection
        return "categorySelect"                              // Normal flow
    },
}
```

### Optional Phase (Cascade Skip)

```typescript
// If category is already set, endIf is immediately true → cascades to next
categorySelect: {
    endIf: (ctx) => ctx.session.state.category !== null,
    next: "difficultySelect",
},
```

### Terminal Phase (Manual Transitions)

```typescript
gameOver: {
    endIf: undefined,    // Never auto-transitions
    next: "playing",     // Default target for endPhase()
    onBegin: async (ctx) => {
        // Start autoplay countdown
        await ctx.scheduler.upsertTimeout({
            name: "AUTOPLAY",
            delayMs: 15000,
            mode: "hold",
            dispatch: { kind: "thunk", name: "RESTART_GAME" },
        })
        // v4.11.0+: return void — no state return needed
    },
}
```

## Phase-Scoped vs Root Reducers

| Scope | Available When | Registration |
|-------|---------------|--------------|
| **Root** reducers/thunks | ALL phases | `GameRuleset.reducers` / `.thunks` |
| **Phase** reducers/thunks | Only that phase | `phase.reducers` / `.thunks` |

Resolution order: exact → `{phase}:{name}` → `root:{name}`

**Tip:** For games where most logic applies across phases, put everything at root level and use phases purely for flow control (endIf/next/onBegin/onEnd with empty reducers/thunks).

## Phase Naming Constraints

Cannot use: `root`, `internal`, or names containing colons (`:`).

## Phase Modification Protection

Only internal framework reducers can modify `state.phase` and `state.previousPhase`:
- `internal:SET_PHASE`
- `internal:APPLY_STATE_UPDATE`
- `internal:FORCE_UPDATE`

User code (reducers, onBegin, onEnd) that modifies these fields → `PhaseModificationError`.

## PhaseRunner Internals (v4.12.0)

**`checkAndTransitionIfNeeded(ctx)`** — Called after every non-internal reducer dispatch:

1. Increment `TransitionDepthTracker` (throws `TransitionDepthExceededError` if > max depth 10)
2. Get current session and phase; look up `endIf`
3. Run `endIf` — if false or undefined, return early
4. Resolve `next` phase name (throws `CouldNotDetermineNextPhaseError` if undefined)
5. Set engine state → `OnEnd`: run `onEnd` hook (dispatches skip endIf)
6. Set engine state → `Swapping`: dispatch `internal:SET_PHASE` via `dispatchInternalReducer` (sync)
7. Set engine state → `OnBegin`: run `onBegin` hook (dispatches trigger endIf — cascading)
8. Recursive call to `checkAndTransitionIfNeeded` (skip-logic: handles endIf already true for new phase)
9. In `finally` block: decrement depth; if depth reaches 0, set engine state to `Draining`

The `dispatchFromLifecycle` path is used by lifecycle hooks — always inline (never buffered), validates phase fields. During `OnBegin` it cascades; during `OnEnd` it skips endIf (onEnd is a finaliser).

## Real-World: Emoji Game Phases (emoji-multiplatform, VGF ^4.10.0, WGFServer, port 8090)

```
[*] → lobby → categorySelect → difficultySelect → playing → gameOver → (loop)
         └──────── (FTUE shortcut) ──────────────→ playing
```

Uses the **WoF (Wheel of Fortune) pattern**: all phases use `hasNextPhase()` check + `CLEAR_NEXT_PHASE` in onBegin. Transitions driven by thunks setting `nextPhase`.

| Phase | endIf | next | onBegin |
|-------|-------|------|---------|
| lobby | `controllerConnected \|\| remoteMode \|\| hasNextPhase` | Dynamic (FTUE → playing, hasNextPhase → nextPhase, else categorySelect) | CLEAR_NEXT_PHASE |
| categorySelect | `category !== null \|\| hasNextPhase` | Dynamic (hasNextPhase → nextPhase, else `"difficultySelect"`) | CLEAR_NEXT_PHASE |
| difficultySelect | `difficulty !== null \|\| hasNextPhase` | Dynamic (hasNextPhase → nextPhase, else `"playing"`) | CLEAR_NEXT_PHASE |
| playing | `quizSubState === "QUIZ_OVER" \|\| hasNextPhase` | Dynamic (hasNextPhase → nextPhase, else `"gameOver"`) | CLEAR_NEXT_PHASE, load questions |
| gameOver | `hasNextPhase` (thunk-driven only) | Dynamic (hasNextPhase → nextPhase, else `"playing"`) | CLEAR_NEXT_PHASE, autoplay countdown |

## Best Practices

1. **Single responsibility** — One game stage per phase
2. **Never touch `state.phase`** — Use endIf/next; only `internal:SET_PHASE` can modify phase fields (throws `PhaseModificationError` otherwise)
3. **Keep lifecycle hooks fast** — No network calls in onBegin/onEnd if possible
4. **Root reducers for cross-phase logic** — Don't duplicate across phases
5. **Guard against infinite cascades** — `TransitionDepthTracker` catches at depth 10, but design your graph to terminate
6. **Clear stale transition state in onBegin** — Reset flags like `nextPhase` in `onBegin` to prevent stale values re-triggering transitions (see WoF pattern)
7. **Lifecycle hooks can return void (v4.11.0+)** — No need to return state if you don't modify it
8. **Understand dispatch buffering (v4.12.0)** — Dispatches during transitions are queued, not dropped. They will execute after the transition completes

## Reference

- [Phase System Deep Dive](docs/framework-analysis/05-phase-system.md)
- [Building a Game: Step 4](docs/framework-analysis/07-building-a-game.md)
