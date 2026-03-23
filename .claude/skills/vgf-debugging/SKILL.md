---
name: vgf-debugging
description: |
  Debug VGF games: common errors, state issues, connection problems, phase transition failures, and
  dev mode troubleshooting. Use when encountering VGF errors, diagnosing state sync issues, fixing
  connection problems, or troubleshooting the dev environment.
  Triggers: vgf error, vgf debug, session not found, dispatch timeout, phase modification error,
  reducer not found, invalid action, stale state, vgf port, eaddrinuse, dev-test session,
  vgf connection, vgf disconnect, state version, deepgram proxy, vgf troubleshoot,
  transition depth exceeded, drain overflow, dispatch buffering, engine state, invalid internal reducer
version: 2.0.0
author: VGF Docs Team
category: game-development
tags: [vgf, debugging, troubleshooting, errors, devtools, game-development]
---

# VGF Debugging Guide (v4.12.0)

Common errors, diagnostic techniques, and solutions for VGF game development. Covers new error types from v4.10.0–v4.12.0 including engine state machine, dispatch buffering, and cascade depth limiting.

## Error Reference

### Server Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `InvalidActionError` | Reducer/thunk/action name not found for current phase | Check spelling, verify it's registered in GameRuleset, check phase scoping |
| `InvalidMessageError` | Message failed Zod schema validation | Check wire format: `{ type, reducer/thunk: { type, payload: { args? } } }` |
| `PhaseModificationError` | User code modified `state.phase` or `state.previousPhase` | NEVER modify phase in reducers or lifecycle hooks. Use GameRunner.setPhase() or endIf/next |
| `PhaseNameNotStringError` | Phase is not a string value | Check your setup() function returns a string phase |
| `SessionNotFoundError` | Session doesn't exist in storage | Ensure session created before connect. Dev mode: pre-create with ID `"dev-test"` |
| `SessionAlreadyExistsError` | Duplicate session creation | Check for double POST /api/session calls |
| `TransitionDepthExceededError` | Phase cascade exceeds max depth (default 10) | Your phase graph has an infinite loop — check endIf conditions and ensure transitions terminate. Added v4.10.0 |
| `DrainOverflowError` | Dispatch buffer drain exceeds max iterations (default 100) | Too many buffered dispatches during phase transitions. Check for dispatches that trigger cascading transitions during drain. Added v4.12.0 |
| `InvalidInternalReducerError` | Non-whitelisted reducer passed to `dispatchInternalReducer` | Only `internal:SET_PHASE`, `internal:APPLY_STATE_UPDATE`, `internal:FORCE_UPDATE` are allowed. Added v4.11.0 |
| `CouldNotDetermineNextPhaseError` | `next` function returned undefined/null | Check your phase's `next` function — it must return a valid phase name string |
| `WebSocketHandshakeError` | Invalid handshake params | Check query params: sessionId, userId, clientType |
| `SessionPreloadFailedError` | Session load from Redis fails | Redis connectivity issue or session expired |

### Client Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `DispatchTimeoutError` | Server didn't ACK within 10s (default) | Check server is running, check network, increase timeout if needed |
| `ActionFailedError` | Server returned `{ status: "error" }` | Check server logs for the underlying error |
| `ServerError` | Generic server error | Check server logs |

### ErrorCode Values

| Code | Meaning |
|------|---------|
| `STALE_STATE` | State version mismatch |
| `INVALID_ACTION` | Unknown action/reducer/thunk for current phase |
| `UNKNOWN_ERROR` | Catch-all server error |
| `INVALID_MESSAGE` | Failed schema validation |

## Common Issues

### "Session not found" on Connect

**Problem:** Client connects but server can't find the session.

**Causes:**
1. Session wasn't created before client tried to connect
2. Server restarted (MemoryStorage is volatile — sessions lost)
3. Wrong sessionId in query params

**Fix:**
- Dev mode: `dev.ts` must pre-create session: `storage.createSession({ sessionId: "dev-test", members: {}, state: game.setup() })`
- If server restarted (tsx watch), refresh the browser — `dev.ts` re-creates the session on startup
- Check URL params: `?sessionId=dev-test&userId=display-dev`

### `EADDRINUSE` on Port 8080 or 8081

**Problem:** Port already in use from a previous server process.

**Fix:**
```bash
# Find and kill the process
lsof -i :8080 | grep LISTEN
kill -9 <PID>

# Or kill all node processes (nuclear option)
pkill -f "tsx watch"
```

Port 8081 is the Deepgram proxy WebSocket server — it's separate from the main VGF server.

### Reducer Not Found (Works in One Phase, Fails in Another)

**Problem:** Reducer dispatch works in one phase but throws `InvalidActionError` in another.

**Cause:** Phase-scoped reducers are only available in their phase. Root reducers are always available.

**Diagnostic:**
1. Check where the reducer is registered — root `GameRuleset.reducers` or `phase.reducers`?
2. Phase-scoped → registered as `{phase}:{name}` internally
3. Root → registered as `root:{name}` internally

**Fix:** Move the reducer to root level if it should work across all phases.

### State Not Updating on Client

**Problem:** Dispatch succeeds (Promise resolves) but client UI doesn't update.

**Diagnostic:**
1. Check server logs — was the reducer actually called?
2. Check if reducer returns a NEW object (mutation detection requires reference change)
3. Check `useStateSyncSelector` — is the selector extracting the right path?
4. Socket.IO `onAny` workaround — STATE_UPDATE events can be missed in some configurations

**Fix for Socket.IO miss:**
```typescript
socket.onAny((eventName, ...args) => {
    if (eventName === "message" && args[0]?.type === "STATE_UPDATE") {
        handleStateUpdate(args[0])
    }
})
```

### Phase Not Transitioning

**Problem:** `endIf` condition is true but phase doesn't change.

**Diagnostic:**
1. `endIf` is only checked after **non-internal reducer dispatches** — thunks don't trigger it directly (but reducers dispatched WITHIN thunks DO)
2. Is the endIf function checking the right field?
3. Is the reducer actually modifying the field that endIf checks?
4. **v4.12.0:** Check if the dispatch is being **buffered** — if the engine is not in Idle state (mid-transition), the dispatch is queued and endIf won't be checked until drain
5. Check for cascading transition infinite loops (caught at depth 10 by `TransitionDepthTracker`)

**Fix:** Add logging in endIf to verify it's being called and what it sees:
```typescript
endIf: (ctx) => {
    const result = ctx.session.state.gameComplete
    console.log("endIf check:", result)
    return result
},
```

### TransitionDepthExceededError (Infinite Phase Cascade)

**Problem:** Server throws `TransitionDepthExceededError` — phase transition depth exceeded maximum of 10.

**Cause:** Your phase graph has a cycle where `endIf` is immediately true for each phase in the loop. Before v4.10.0, this would OOM crash the server.

**Diagnostic:**
1. Map out which phase transitions are triggering — which phase's endIf returns true immediately upon entry?
2. Check for stale state from closures in `next` functions (common bug)
3. Check if boolean flags are not being reset in `onBegin` (e.g., `restarting = true` from previous round)

**Fix:** Reset transition flags in `onBegin`, not `onEnd`. Use the WoF pattern: clear `nextPhase` in every phase's `onBegin`. Derive `next` from current state, never from closures.

### DrainOverflowError (Buffer Drain Exceeded)

**Problem:** Server throws `DrainOverflowError` — drain buffer exceeded 100 iterations.

**Cause:** Too many dispatches were buffered during a phase transition, and processing them creates a cascade of more dispatches/transitions.

**Diagnostic:**
1. Check what dispatches are being buffered — are external dispatches arriving rapidly during transitions?
2. Check if drain processing triggers further transitions that buffer more dispatches

**Fix:** Reduce the rate of external dispatches during transitions. Ensure phase transitions settle quickly.

### Dispatches "Lost" During Phase Transitions (v4.12.0)

**Problem:** Dispatches sent during a phase transition seem to disappear or arrive late.

**Cause:** This is actually **correct v4.12.0 behaviour** — dispatches arriving while the engine is not Idle are buffered and processed after the transition completes.

**Diagnostic:**
1. Check if the dispatch was sent during a transition (engine state OnEnd/Swapping/OnBegin)
2. The dispatch WILL execute — but only after the transition settles and drain runs

**Fix:** This is by design. If you need a dispatch to execute inline during a lifecycle hook, use `dispatchFromLifecycle` (available in onBegin/onEnd contexts). If you need to fire-and-forget, `void` the `dispatchReducer` Promise.

### Timers Not Firing (Dev Mode)

**Problem:** Scheduled timers never execute locally.

**Cause:** VGF's built-in scheduler is a `NoOpScheduler` with `MemoryStorage`. It logs errors but doesn't fire.

**Fix:** Implement a DevScheduler (setTimeout-based) and inject via `services.scheduler`:
```typescript
const devScheduler = new DevScheduler()
services.scheduler = devScheduler

// In thunks, use: services.scheduler ?? ctx.scheduler
```

### State Mutation TypeError

**Problem:** `TypeError: Cannot assign to read only property` in a reducer.

**Cause:** VGF calls `Object.freeze()` on state before passing to reducers. Direct mutation throws.

**Fix:** Always return new objects with spread:
```typescript
// WRONG
state.score += 10
return state

// RIGHT
return { ...state, score: state.score + 10 }

// WRONG (nested mutation)
state.players[0].score = 10
return state

// RIGHT (nested immutable update)
return {
    ...state,
    players: state.players.map((p, i) =>
        i === 0 ? { ...p, score: 10 } : p
    ),
}
```

## Diagnostic Tools

### State Version Tracking

Every state update includes `__vgfStateVersion`. Log it to trace state changes:
```typescript
const state = useStateSync()
useEffect(() => {
    console.log("State version:", state.__vgfStateVersion, "Phase:", state.phase)
}, [state.__vgfStateVersion])
```

### Event History

Configure `IEventHistory` for server-side observability:
- `LoggingEventHistory` — logs all reducer/thunk dispatches
- `FileEventHistory` — writes to disk for replay
- `MetricEventHistory` — Datadog metrics
- `AggregatingEventHistory` — combine multiple

### Dev Mode URLs

| App | URL |
|-----|-----|
| Display | `http://localhost:3000/?sessionId=dev-test&userId=display-dev` |
| Controller | `http://localhost:5173/?sessionId=dev-test&volley_account=controller-dev` |
| Server (VGFServer legacy) | `http://localhost:8080` |
| Server (WGFServer new) | `http://localhost:8090` |
| Deepgram Proxy | `ws://localhost:8081` |

**Open Display first, then Controller.** Controller connection triggers game state initialisation.

**emoji-multiplatform** uses WGFServer on port 8090.

### Port Configuration

| Port | App | Strict |
|------|-----|--------|
| 3000 | Display (Vite) | `strictPort: true` — errors on conflict |
| 5173 | Controller (Vite) | `strictPort: true` — errors on conflict |
| 8080 | VGF Server (legacy) | PORT env var |
| 8090 | WGF Server (new — emoji-multiplatform dev) | PORT env var |
| 8081 | Deepgram Proxy | DG_PROXY_PORT env var |

If a port is taken, apps ERROR OUT (no silent port increment). Kill the old process first.

## Testing VGF Games

### Test Framework

Vitest. No describe blocks. Use `test()` not `it()`. Inline setup (no beforeEach/afterEach).

### Testing Reducers

Reducers are pure functions — test directly:
```typescript
test("should increment score by points value", () => {
    const state = createInitialState()
    const result = reducers.UPDATE_SCORE(state, { points: 100 })
    expect(result.score).toBe(100)
    expect(result.lastAnswerScore).toBe(100)
})
```

### Testing Thunks

Mock the ThunkContext:
```typescript
test("should reject move when not player's turn", async () => {
    const dispatches: string[] = []
    const ctx = {
        getState: () => ({ ...initialState, currentPlayer: "other-player" }),
        getClientId: () => "test-player",
        dispatch: (name: string, ...args: unknown[]) => dispatches.push(name),
        // ... other mocks
    }
    await thunks.PLAY_TURN(ctx, 0, 0)
    expect(dispatches).toContain("SET_ERROR")
})
```

## Reference

- [Client-Server Communication](docs/framework-analysis/04-client-server-communication.md)
- [Architecture Deep Dive](docs/framework-analysis/02-architecture-deep-dive.md)
- [Building a Game](docs/framework-analysis/07-building-a-game.md)
