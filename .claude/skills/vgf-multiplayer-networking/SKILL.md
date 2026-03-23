---
name: vgf-multiplayer-networking
description: |
  VGF client-server communication, Socket.IO transport, message protocol, ACK system, connection lifecycle,
  session management, and storage architecture. Use when debugging connection issues, implementing custom
  transport middleware, handling reconnection, or understanding VGF's networking layer.
  Triggers: vgf socket, socket.io, vgf connection, vgf transport, state update, message protocol,
  vgf session, session member, client type, display controller, vgf reconnect, dispatch timeout,
  vgf middleware, connection registry, memory storage, redis persistence, vgf broadcast, ack system
version: 2.0.0
author: VGF Docs Team
category: game-development
tags: [vgf, socket.io, networking, multiplayer, websocket, transport, session-management]
---

# VGF Multiplayer Networking (v4.12.0)

Client-server communication, session management, and storage for the Volley Games Framework. Now with two server architectures (VGFServer legacy, WGFServer new), async dispatch, and engine state machine integration.

## Message Protocol

VGF uses a typed message protocol over Socket.IO with exactly **two** event names:

- **Client → Server:** `"message"` (reducer or thunk — actions REMOVED in v4.9.0)
- **Server → Client:** `"message"` (STATE_UPDATE or ERROR), `"connect"` (Socket.IO native)

### MessageType Enum

```typescript
enum MessageType {
    ACTION = "ACTION",              // REMOVED (v4.9.0) — MessageHandler drops these with a warning
    REDUCER = "REDUCER",            // Pure synchronous state update
    THUNK = "THUNK",                // Async operation
    STATE_UPDATE = "STATE_UPDATE",  // Server → Client state broadcast
    ERROR = "ERROR",                // Server → Client error
}
```

### Wire Formats

**Reducer dispatch (Client → Server):**
```json
{
    "type": "REDUCER",
    "reducer": {
        "type": "SET_SCORE",
        "payload": { "args": ["player-123", 42] }
    }
}
```

**Thunk dispatch (Client → Server):**
```json
{
    "type": "THUNK",
    "thunk": {
        "type": "PLAY_TURN",
        "payload": { "args": [2, 1] }
    }
}
```

**State update (Server → All Clients):**
```json
{
    "type": "STATE_UPDATE",
    "session": {
        "sessionId": "abc-123",
        "members": { ... },
        "state": { "phase": "playing", ... }
    }
}
```

**Note:** `payload` is REQUIRED in reducer/action messages (not optional). `args` within payload is optional.

## ACK System

Every dispatch returns a Promise with configurable timeout (default 10 seconds).

```typescript
type IEventAck =
    | { status: "success"; message?: string }
    | { status: "error"; error: string }
```

| Scenario | Error Type | Result |
|----------|-----------|--------|
| Server processes OK | — | Promise resolves |
| Reducer/thunk not found | `ActionFailedError` | ACK `{ status: "error" }` |
| Invalid message | `ActionFailedError` | ACK `{ status: "error" }` |
| Server timeout | `DispatchTimeoutError` | Client-side timeout fires |

## Two Server Architectures (v4.12.0)

| | `VGFServer` (Legacy) | `WGFServer` (New) |
|---|---|---|
| **Orchestrator** | `StateSyncManager` | `GameRunner` |
| **WebSocket** | `PartyTimeServer` + `SocketIOTransport` | `WebSocketServer` (direct Socket.IO) |
| **Phase Transitions** | `PhaseRunner` (legacy) | `PhaseRunner` + `EngineStateManager` + `DispatchBuffer` |
| **Dispatch** | Synchronous | Async (`Promise<void>`) |
| **State Machine** | None | `EngineStateManager` (5 states: Idle/OnEnd/Swapping/OnBegin/Draining) |
| **Session Cleanup** | Manual | `onSessionExpired` callback + `dispose()` |

**New games should use `WGFServer`.** The emoji-multiplatform reference implementation uses WGFServer on port 8090.

## Connection Lifecycle

### New Connection

1. Client calls `transport.connect()` with query: `sessionId`, `userId`, `clientType`, optional `sessionMemberStateJson`
2. **ClientType values:** `"DISPLAY"`, `"CONTROLLER"`, `"ORCHESTRATOR"`
3. Server auth middleware validates params (Zod), loads session from storage
4. Custom middleware runs (capacity, auth, rate limiting)
5. `SocketIOTransport` adds member (or updates existing for reconnection)
6. Socket joins Socket.IO room for the session
7. `PartyTimeServer` registers message/disconnect handlers
8. `StateSyncSessionHandlers.onConnect()` broadcasts full state to ALL clients
9. `game.onConnect()` lifecycle hook fires

### Reconnection

VGF tracks members by **userId**, not connectionId. When same userId reconnects:
- `connectionId` updated to new socket ID
- `ConnectionState` set to `Connected`
- Full state re-broadcast (no replay needed)
- `onConnect` fires again (detect reconnection by checking member state)

### Disconnection

Member record **stays** in session with `ConnectionState.Disconnected`. Member is NOT removed.

## State Broadcasting

**Full state, every time.** No deltas, no diffs. Entire `Session<GameState>` goes to every connected member.

Why:
- No state divergence — every client has canonical state
- No delta accumulation bugs
- Trivial reconnection — just send current state
- Simple debugging — inspect any message for full picture

For party/quiz/turn-based games (typically a few KB), overhead is negligible.

## Session Management

### Session Interface

```typescript
interface Session<GameState = BaseGameState> {
    sessionId: SessionId
    members: SessionMemberRecord          // Map of members
    state: GameState
}

interface SessionMember {
    sessionMemberId: SessionMemberId
    connectionId: ConnectionId
    connectionState: "Connected" | "Disconnected"
    isReady: boolean
    state: SessionMemberState
    clientType: "Display" | "Controller"   // or "Orchestrator"
}
```

### Session Lifecycle

1. **Create:** `POST /api/session` → `game.setup()` → initial GameState
2. **Join:** WebSocket connect → member added to session
3. **Play:** Reducers/thunks dispatched → state broadcast
4. **Leave:** WebSocket disconnect → member marked Disconnected (NOT removed)
5. **Rejoin:** Same userId reconnects → member marked Connected
6. **Destroy:** `DELETE /sessions/:id` → session removed

### Client Reducers (Built-in)

| Reducer | Purpose |
|---------|---------|
| `__CLIENT_TOGGLE_READY` | Toggle member's `isReady` flag |
| `__CLIENT_UPDATE_STATE` | Merge partial state into member's state |

These modify `SessionMember` data (not GameState) and bypass `StateSyncManager`.

## Storage Architecture

### Two-Tier Design

1. **MemoryStorage** (NodeCache) — synchronous, in-process, zero-latency game loop
2. **RedisPersistence** — async background durability, fire-and-forget

```
Dispatch → MemoryStorage.update() → Broadcast → void RedisPersistence.save() (async)
```

Game loop NEVER blocks on I/O. Redis for durability and cross-server recovery, not performance.

### MemoryStorage (IStorage)

Synchronous operations: `createSession`, `getSessionById`, `updateSessionState`, `deleteSessionById`, `addSessionMember`, `removeSessionMember`, etc.

Async: `loadSession(sessionId)` — loads from persistence into memory on demand.

### RedisPersistence (IPersistence)

- `session-state:{sessionId}` — JSON game state (string key)
- `session-members:{sessionId}` — Hash of member data
- Default TTL: 7 days (604,800 seconds), reset on access
- Errors swallowed (logged, never thrown) — persistence failures don't disrupt gameplay

## Transport Abstraction

```typescript
interface ITransport {
    onConnection(callback): void
    broadcastToSession(sessionId, message): void
    emitToConnection(connectionId, message): void
    disposeByConnectionId(id, reason): boolean
    disposeByClientId(id, reason): number
    disposeBySessionId(id, reason): number
}
```

### DisconnectionReason Enum

`UNKNOWN`, `CLIENT_DISCONNECTED`, `SERVER_DISCONNECTED`, `KICKED`, `SESSION_ENDED`, `DUPLICATE_CONNECTION`, `IDLE_TIMEOUT`

### Transport Middleware

`SocketIOClientTransport` supports middleware pipelines:
- `useIncoming(eventName, fn)` — process incoming messages
- `useOutgoing(eventName, fn)` — process outgoing messages

## Error Types

| Error | Location | Cause |
|-------|----------|-------|
| `InvalidActionError` | server | Unknown action/reducer/thunk name |
| `ActionFailedError` | client | Server returned error ACK |
| `DispatchTimeoutError` | client | Server didn't ACK within timeout |
| `InvalidMessageError` | server | Malformed message (failed Zod validation) |
| `ServerError` | client | Generic server error |
| `PhaseModificationError` | game-runner | Illegal phase/previousPhase mutation |
| `SessionNotFoundError` | server | Session doesn't exist |
| `PhaseNameNotStringError` | server | Phase is not a string |
| `TransitionDepthExceededError` | phase-runner | Phase cascade exceeds max depth (default 10) — v4.10.0+ |
| `DrainOverflowError` | dispatch-buffer | Buffer drain exceeds max iterations (default 100) — v4.12.0+ |
| `InvalidInternalReducerError` | game-runner | Non-whitelisted reducer passed to `dispatchInternalReducer` — v4.11.0+ |
| `CouldNotDetermineNextPhaseError` | phase-runner | `next` returns undefined/null |
| `WebSocketHandshakeError` | web-socket-server | Invalid handshake params |
| `SessionPreloadFailedError` | storage | Session load from Redis fails |

### ErrorCode Enum

```typescript
enum ErrorCode {
    STALE_STATE = "STALE_STATE",
    INVALID_ACTION = "INVALID_ACTION",
    UNKNOWN_ERROR = "UNKNOWN_ERROR",
    INVALID_MESSAGE = "INVALID_MESSAGE",
}
```

## Scheduler System

| Implementation | Use |
|---------------|-----|
| `NoOpScheduler` | Dev mode (logs errors as warning) |
| `GameScheduler` | Production (Redis-backed via `IRuntimeSchedulerStore`) |
| `SessionScheduler` | Legacy VGFServer production |

### Scheduler API

```typescript
interface IScheduler {
    upsertTimeout(opts): Promise<void>    // One-shot timer
    upsertInterval(opts): Promise<void>   // Repeating timer
    cancel(name): Promise<void>
    pause(name) / resume(name): Promise<void>
    pauseAll() / resumeAll(): Promise<void>
    recover(): Promise<void>              // Restore after restart
    dispose(): Promise<void>              // Clear all timers, prevent memory leaks (v4.9.2+)
}
```

**Note:** `GameScheduler` dispatches through `GameRunner.dispatchReducer()` and `dispatchThunk()` — meaning scheduler-fired dispatches go through the full engine state machine, buffering and all (v4.12.0).

Recovery modes:
- **`hold`** — shift timers forward by downtime duration
- **`catch-up`** — fire missed timers immediately

## Reference

- [Client-Server Communication](docs/framework-analysis/04-client-server-communication.md)
- [Session Management](docs/framework-analysis/06-session-management.md)
- [Architecture Deep Dive](docs/framework-analysis/02-architecture-deep-dive.md)
