---
name: volley-recognition-service
description: |
  Integrate the Volley Recognition Service SDK for voice input in VGF games. Covers SDK setup,
  createClientWithBuilder, asrRequestConfig, gameContext, slotMap keyword boosting, audio capture,
  graceful/abnormal stop, migration from Deepgram. Use for voice-powered games, speech-to-text,
  microphone input, transcription integration.
  Triggers: recognition service, recognition sdk, recognition client, voice input, speech to text,
  microphone, transcription, deepgram migration, asrRequestConfig, slotMap, keyword boosting,
  createClientWithBuilder, stopRecording, stopAbnormally, audio capture, pcm
version: 1.0.0
author: VGF Docs Team
category: game-development
tags: [recognition-service, voice, speech-to-text, volley, sdk, microphone]
---

# Volley Recognition Service SDK

## Overview

The Recognition Service replaces direct Deepgram WebSocket integration with a centralised ASR (Automatic Speech Recognition) layer. The SDK package is `@volley/recognition-client-sdk`.

**What the Recognition Service provides:**
- **Provider abstraction** -- Deepgram, Google, AssemblyAI behind a single API
- **Automatic failover** -- Falls back to backup providers on failure
- **Keyword boosting** -- `slotMap` for improved recognition of expected answers
- **Auth** -- No API keys needed in game code
- **Observability** -- Centralised logging, metrics, tracing

**What it replaces:**

| Before (Deepgram direct) | After (Recognition Service) |
|---|---|
| Raw WebSocket to `wss://api.deepgram.com/v1/listen` | SDK client to `wss://recognition-service-{stage}.volley-services.net/ws/v1/recognize` |
| Dev proxy on port 8081 for CORS bypass | SDK handles endpoint resolution via `stage` |
| Server-side Deepgram API key + token grant | No API keys in game code |
| Manual audio format config in URL params | `asrRequestConfig` in SDK builder |
| Parse Deepgram-specific response format | SDK normalises to `TranscriptionResultV1` |

---

## createClientWithBuilder Pattern

The SDK client is created using the builder pattern. **All fields shown below are required for a working integration.**

```typescript
import {
    createClientWithBuilder,
    RecognitionContextTypeV1,
    AudioEncoding,
    SampleRate,
    Language,
} from "@volley/recognition-client-sdk"
import type { IRecognitionClient } from "@volley/recognition-client-sdk"

const audioCtx = new AudioContext()
const stage = import.meta.env.VITE_RECOGNITION_STAGE ?? "dev"
const hintKeywords = (gameState.hintKeywords ?? []) as string[]

const client = createClientWithBuilder((builder) =>
    builder
        .stage(stage)
        .gameId("your-game-id")
        .asrRequestConfig({                              // CRITICAL: Required!
            provider: "deepgram",
            model: "nova-3",
            language: Language.ENGLISH_US,
            sampleRate: audioCtx.sampleRate as SampleRate, // MUST use actual AudioContext rate
            encoding: AudioEncoding.LINEAR16,
            interimResults: true,
            useContext: true,
        })
        .gameContext({
            type: RecognitionContextTypeV1.GAME_CONTEXT,
            gameId: "your-game-id",
            gamePhase: "quiz",
            slotMap: { answer: hintKeywords },
        })
        .onTranscript((result) => {
            if (result.finalTranscript || result.pendingTranscript) {
                setLastTranscript(result.finalTranscript || result.pendingTranscript || "")
            }
            if (!result.finalTranscript) return
            dispatchThunk("PROCESS_TRANSCRIPTION", {
                text: result.finalTranscript,
                confidence: result.finalTranscriptConfidence ?? 0,
                isFinal: result.is_finished,
            })
        })
        .onError((error) => {
            console.error("Recognition SDK error:", error)
            cleanup()  // IMPORTANT: Clean up resources on error!
        })
)

await client.connect()
```

---

## CRITICAL: asrRequestConfig is REQUIRED

Without `.asrRequestConfig(...)` on the builder, the SDK **never sends the `ASRRequest` message** to the server. The server waits for this message before sending `READY_FOR_UPLOADING_RECORDING`. Without READY, all audio is buffered locally and never reaches the server. **You will get zero transcription results.**

---

## CRITICAL: sampleRate MUST be audioCtx.sampleRate

`AudioContext` defaults to the system's native sample rate (usually 44100 or 48000 Hz). You **must** pass `audioCtx.sampleRate` to `asrRequestConfig`, NOT a hardcoded value. Mismatched rates cause garbled transcription.

```typescript
// WRONG:
sampleRate: SampleRate.RATE_16000

// CORRECT:
sampleRate: audioCtx.sampleRate as SampleRate
```

---

## gameContext: Required Fields

The `GameContextV1` type requires `type`, `gameId`, and `gamePhase` -- not just `slotMap`:

```typescript
// WRONG:
.gameContext({ slotMap: { answer: keywords } })

// CORRECT:
.gameContext({
    type: RecognitionContextTypeV1.GAME_CONTEXT,
    gameId: "your-game-id",
    gamePhase: "quiz",
    slotMap: { answer: keywords },
})
```

The `slotMap` field enables keyword boosting. Pass the current answer plus homophones so the ASR provider is more likely to recognise them.

---

## Audio Capture Pipeline

The full audio pipeline: `getUserMedia` -> `AudioContext` -> `ScriptProcessorNode` -> Float32 to Int16 -> `sendAudio`.

```typescript
const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
const audioCtx = new AudioContext()
const source = audioCtx.createMediaStreamSource(stream)
const scriptNode = audioCtx.createScriptProcessor(4096, 1, 1)

source.connect(scriptNode)
scriptNode.connect(audioCtx.destination)

scriptNode.onaudioprocess = (e) => {
    if (!client.isConnected()) return
    const float32 = e.inputBuffer.getChannelData(0)
    const int16 = new Int16Array(float32.length)
    for (let i = 0; i < float32.length; i++) {
        const s = Math.max(-1, Math.min(1, float32[i]))
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
    }
    client.sendAudio(int16.buffer)
}
```

---

## onTranscript Callback

The `onTranscript` callback receives `TranscriptionResultV1`:

```typescript
interface TranscriptionResultV1 {
    type: "Transcription"
    audioUtteranceId: string
    finalTranscript: string           // Confirmed text (will not change)
    pendingTranscript?: string        // Text being recognised (may change)
    finalTranscriptConfidence?: number // 0-1 confidence score
    is_finished: boolean              // True on final message
    voiceStart?: number
    voiceDuration?: number
    voiceEnd?: number
}
```

- Use `pendingTranscript` for real-time UI updates while the user speaks
- Only dispatch game logic on `finalTranscript`
- `is_finished` is true on the very last message from the server

---

## onError Callback -- MUST Clean Up Resources

The `onError` callback **must** tear down AudioContext, MediaStream, and the SDK client. Without cleanup, an error leaves the UI stuck in "Listening..." state with leaked resources.

```typescript
.onError((error) => {
    console.error("Recognition SDK error:", error)
    // Stop all audio tracks
    stream.getTracks().forEach((t) => t.stop())
    // Close audio context
    audioCtx.close()
    // Abnormal stop on the client
    client.stopAbnormally()
    // Reset UI state
    setIsRecording(false)
})
```

---

## stopRecording (Graceful) vs stopAbnormally (Immediate)

- **Normal release** (user lifts finger/releases button): `await client.stopRecording()` -- waits for the server to send the final transcript before closing
- **Error/unmount**: `client.stopAbnormally()` -- immediate cleanup, no waiting

Using `stopAbnormally()` for normal release **will drop the final transcript**.

### Client Lifecycle

```
INITIAL -> connect() -> CONNECTING -> CONNECTED -> [server sends READY] -> READY
                                                                            |
                                         stopRecording() -> STOPPING -> STOPPED
                                         stopAbnormally() -> STOPPED (immediate)
```

---

## Keyword Boosting: hintKeywords State Field

### Add to shared game state

```typescript
// packages/shared/src/types.ts
interface YourGameState {
    // ... existing fields ...
    hintKeywords: string[]
}

// packages/shared/src/state.ts (initial state)
hintKeywords: []
```

### SET_HINT_KEYWORDS Reducer

```typescript
SET_HINT_KEYWORDS: ((state, payload: { keywords: string[] }) => ({
    ...state,
    hintKeywords: payload.keywords,
})) as Reducer<{ keywords: string[] }>,
```

### Clear in RESET_GAME

```typescript
RESET_GAME: ((state) => ({
    ...state,
    // ... existing reset fields ...
    hintKeywords: [],
})) as Reducer<void>,
```

### Dispatch for every question

```typescript
// First question (setupPlayingPhase):
dispatch("SET_HINT_KEYWORDS", { keywords: [first.answer, ...first.homophones] })

// Subsequent questions (advanceToNextQuestion):
ctx.dispatch("SET_HINT_KEYWORDS", { keywords: [nextQuestion.answer, ...nextQuestion.homophones] })
```

**Gotcha:** You must dispatch for the FIRST question too, not just subsequent ones.

---

## Recognition Service Endpoints

| Stage | WebSocket URL |
|-------|--------------|
| local | `ws://localhost:3101/ws/v1/recognize` |
| dev | `wss://recognition-service-dev.volley-services.net/ws/v1/recognize` |
| staging | `wss://recognition-service-staging.volley-services.net/ws/v1/recognize` |
| production | `wss://recognition-service.volley-services.net/ws/v1/recognize` |

### VPN Requirement

The recognition service endpoints at `*.volley-services.net` are behind the Volley VPN. Without VPN, WebSocket connections fail silently. Always connect to VPN before testing voice input in dev/staging.

---

## Text Input Fallback for Dev Without VPN

When developing without VPN access, provide a text input fallback so developers can still test game logic:

```typescript
// If VPN is not available, show a text input instead of mic button
const hasVPN = import.meta.env.VITE_HAS_VPN !== "false"

{hasVPN ? (
    <MicButton onPress={startRecording} onRelease={stopRecording} />
) : (
    <TextInput
        onSubmit={(text) => {
            dispatchThunk("PROCESS_TRANSCRIPTION", {
                text,
                confidence: 1.0,
                isFinal: true,
            })
        }}
    />
)}
```

---

## ASR Config (Recognition Service Repo)

Before using the SDK, you must create an ASR config in the `recognition-service` repo:

**Path:** `apps/recognition-service/config/asr-configs/{game-id}.yaml`

```yaml
gameId: your-game-id
version: 1.0.0

configs:
  primary:
    provider: deepgram
    model: nova-3
    language: en-US
    sampleRate: 48000
    encoding: LINEAR16
    interimResults: true       # false for song-quiz style (only final answer)
    useContext: true            # Enable keyword boosting via slotMap
    priority: high
    finalTranscriptStability: balanced   # balanced (500ms) or conservative (1000ms)

  backup:
    provider: google
    model: latest_short
    language: en-US
    sampleRate: 48000
    encoding: LINEAR16
    interimResults: true
    useContext: true
    priority: high
    finalTranscriptStability: balanced

defaultConfig: primary

fallbacks:
  - backup
```

Also update `config-manifest.json` to include your new YAML file.

---

## Environment Configuration

```bash
# .env.example
# Recognition Service stage (dev | staging | production)
VITE_RECOGNITION_STAGE=dev
```

Remove all Deepgram environment variables (`DEEPGRAM_API_KEY`, etc.).

---

## Migration Checklist (Deepgram -> Recognition Service)

### Server-side removal
- [ ] Remove `deepgramTokenExpiry` from `ServerOnlyState`
- [ ] Remove `DEEPGRAM_TOKEN_TTL_SECONDS` from constants
- [ ] Remove Deepgram proxy from `dev.ts` (ws import, WebSocketServer, dgProxy, proxy logging)
- [ ] Remove `deepgram: { ... }` from services object in `dev.ts` and `index.ts`
- [ ] Remove `/api/deepgram-token` endpoint from `dev.ts` and `index.ts`
- [ ] Remove `deepgram` property from `GameServices` interface
- [ ] Remove `deepgramTokenExpiry: 0` from session init
- [ ] Replace `GET_DEEPGRAM_TOKEN` thunk with deprecated stub

### Shared types
- [ ] Add `hintKeywords: string[]` to game state type
- [ ] Add `hintKeywords: []` to initial state

### Server-side additions
- [ ] Add `SET_HINT_KEYWORDS` reducer
- [ ] Add `hintKeywords: []` to `RESET_GAME` reducer
- [ ] Dispatch `SET_HINT_KEYWORDS` for first question
- [ ] Dispatch `SET_HINT_KEYWORDS` for subsequent questions

### Client-side
- [ ] Install `@volley/recognition-client-sdk` in client packages
- [ ] Replace raw WebSocket with `createClientWithBuilder`
- [ ] Use `audioCtx.sampleRate` (not hardcoded) in `asrRequestConfig`
- [ ] Include `type`, `gameId`, `gamePhase` in `gameContext`
- [ ] Implement `onError` callback with full cleanup
- [ ] Use `stopRecording()` for normal release, `stopAbnormally()` for errors/unmount

### Environment
- [ ] Update `.env.example` (remove `DEEPGRAM_API_KEY`, add `VITE_RECOGNITION_STAGE`)
- [ ] Remove `DEEPGRAM_API_KEY` from all env files

### Tests
- [ ] Remove `deepgram: { createTemporaryToken: vi.fn() }` from mock services
- [ ] Remove `deepgramTokenExpiry: 0` from test state objects
- [ ] Add `SET_HINT_KEYWORDS` reducer tests
- [ ] Add hintKeywords dispatch tests in quiz loop
- [ ] Add SDK mock for client tests

### Verification
- [ ] `pnpm typecheck` passes
- [ ] `pnpm build` passes
- [ ] `pnpm test -- --run` passes
- [ ] Manual smoke test with mic input on VPN

---

## Testing Patterns

### Mock SDK Client

```typescript
const mockClient = {
    connect: vi.fn().mockResolvedValue(undefined),
    sendAudio: vi.fn(),
    stopRecording: vi.fn().mockResolvedValue(undefined),
    stopAbnormally: vi.fn(),
    isConnected: vi.fn().mockReturnValue(true),
}

vi.mock("@volley/recognition-client-sdk", () => ({
    createClientWithBuilder: vi.fn((configure: any) => {
        const builder = {
            stage: vi.fn().mockReturnThis(),
            gameId: vi.fn().mockReturnThis(),
            gameContext: vi.fn().mockReturnThis(),
            asrRequestConfig: vi.fn().mockReturnThis(),
            onTranscript: vi.fn().mockReturnThis(),
            onError: vi.fn().mockReturnThis(),
            onConnected: vi.fn().mockReturnThis(),
            onDisconnected: vi.fn().mockReturnThis(),
        }
        configure(builder)
        ;(mockClient as any)._onTranscript = builder.onTranscript.mock.calls[0]?.[0]
        return mockClient
    }),
    RecognitionContextTypeV1: { GAME_CONTEXT: "GameContext" },
    AudioEncoding: { LINEAR16: 1 },
    SampleRate: { RATE_16000: 16000 },
    Language: { ENGLISH_US: "en-US" },
}))
```

### Triggering a mock transcript in tests

```typescript
// Simulate the SDK receiving a final transcript
const onTranscript = (mockClient as any)._onTranscript
onTranscript({
    type: "Transcription",
    audioUtteranceId: "test-123",
    finalTranscript: "hello world",
    finalTranscriptConfidence: 0.95,
    is_finished: true,
})
```

### Unit tests to add

1. `SET_HINT_KEYWORDS` reducer -- sets and replaces keywords
2. `RESET_GAME` clears `hintKeywords` -- regression test
3. First question dispatches `SET_HINT_KEYWORDS` -- in `setupPlayingPhase`
4. Subsequent questions dispatch `SET_HINT_KEYWORDS` -- in `advanceToNextQuestion`
5. SDK client created on mic press -- mock `createClientWithBuilder`
6. `stopRecording` called on normal release -- graceful stop
7. `PROCESS_TRANSCRIPTION` dispatched on transcript -- via `onTranscript` callback
8. Empty transcripts not dispatched -- guard against empty `finalTranscript`

---

## Index Signature Gotcha

If your game state has `[key: string]: unknown` (VGF compatibility), accessing typed properties returns `unknown`. Cast explicitly:

```typescript
const hintKeywords = (gameState.hintKeywords ?? []) as string[]
```
