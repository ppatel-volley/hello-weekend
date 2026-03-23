---
name: volley-platform-sdk
description: |
  Integrate the Volley Platform SDK for TV game development. Covers PlatformProvider, MaybePlatformProvider,
  ensureLocalHubSessionId, useDeviceInfo, useKeyDown, D-pad navigation, VWR testing, stage configuration,
  and platform detection. Use for TV apps on Fire TV, Samsung Tizen, LG webOS.
  Triggers: platform sdk, platform provider, maybe platform provider, volley platform, tv game,
  fire tv, samsung tizen, lg webos, d-pad, useKeyDown, useDeviceInfo, hub session id,
  vwr, vwr-s3-cli, device testing, screensaver prevention, stage configuration,
  ensureLocalHubSessionId, volley_hub_session_id, platform detection
version: 1.0.0
author: VGF Docs Team
category: game-development
tags: [platform-sdk, tv, fire-tv, samsung, lg, volley, d-pad, vwr]
---

# Volley Platform SDK

The `@volley/platform-sdk` provides auth, analytics, device identity, input handling, lifecycle hooks, and native bridge integration for Volley TV and mobile games. It is **required** for all production Volley apps.

## Package Exports

```typescript
// React hooks and providers (for UI code)
import { PlatformProvider, useKeyDown, useKeyUp, useMicrophone } from "@volley/platform-sdk/react"

// Utility functions (for non-React code)
import { getPlatform, Platform } from "@volley/platform-sdk/lib"
```

---

## PlatformProvider Setup

```typescript
<PlatformProvider
    options={{
        gameId: "your-game-id",          // Registered game identifier
        appVersion: "1.0.0",             // Semantic version
        stage: "staging",                // "local" | "test" | "dev" | "staging" | "production"
        screensaverPrevention: {
            autoStart: true,             // Prevent TV screensaver during gameplay
        },
        // Only needed for stage "local" or "test":
        // platformApiUrl: "http://localhost:...",
    }}
>
    {children}
</PlatformProvider>
```

**Controller apps** (phone) can use `PlatformProvider` unconditionally -- no `MaybePlatformProvider` needed because controllers never run inside the TV shell and `volley_hub_session_id` is not required.

**Display apps** (TV) need one of two patterns:
1. `ensureLocalHubSessionId()` + unconditional `PlatformProvider` (preferred)
2. `MaybePlatformProvider` conditional wrapper (fallback if auth server is unreachable)

---

## MaybePlatformProvider Pattern

For display apps that run on both web (dev) and TV (production). Skips the SDK entirely on non-TV platforms to avoid the `volley_hub_session_id` crash.

```typescript
import type { ReactNode } from "react"
import { detectPlatform, isTV } from "./utils/detectPlatform"

function MaybePlatformProvider({ children }: { children: ReactNode }) {
    if (!isTV(detectPlatform())) return <>{children}</>

    // NOTE: require() is intentional -- synchronous conditional load.
    // Do NOT refactor to dynamic import() -- it changes rendering semantics.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PlatformProvider } = require("@volley/platform-sdk/react")

    return (
        <PlatformProvider
            options={{
                gameId: "your-game-id",
                appVersion: "1.0.0",
                stage: "staging",
                screensaverPrevention: { autoStart: true },
            }}
        >
            {children}
        </PlatformProvider>
    )
}
```

---

## ensureLocalHubSessionId()

This function injects a fallback `volley_hub_session_id` URL parameter in local/dev/staging so that `PlatformProvider` can initialise without a real TV shell session. **Call it at module level, before React renders.**

```typescript
// packages/shared/src/ensureLocalHubSessionId.ts
export function ensureLocalHubSessionId(stage: string): void {
    if (stage !== "local" && stage !== "dev" && stage !== "staging") return

    const win = globalThis as unknown as {
        location?: { href: string }
        history?: { replaceState: (data: unknown, unused: string, url: string) => void }
    }
    if (!win.location) return

    const url = new URL(win.location.href)
    if (!url.searchParams.has("volley_hub_session_id")) {
        url.searchParams.set("volley_hub_session_id", "local-dev-hub-session")
        win.history?.replaceState({}, "", url.toString())
    }
}
```

**Usage in main.tsx (before `createRoot`):**

```typescript
import { ensureLocalHubSessionId, ENVIRONMENT } from "@your-game/shared"

ensureLocalHubSessionId(ENVIRONMENT)

const root = document.getElementById("root")
if (!root) throw new Error("Root element not found")
createRoot(root).render(<App />)  // No <StrictMode> wrapper!
```

**When to use:** Prefer `ensureLocalHubSessionId()` + unconditional `PlatformProvider` over `MaybePlatformProvider`. Use `MaybePlatformProvider` only if `PlatformProvider` crashes your app (e.g. auth server unreachable without VPN).

---

## CRITICAL: volley_hub_session_id

The `useHubSessionId()` hook **throws at render time** if `volley_hub_session_id` is missing from URL params. This param is injected by the TV shell when launching your app -- it is **never** present in dev/web mode.

If you render `PlatformProvider` unconditionally without `ensureLocalHubSessionId()`, your app crashes:

```
Uncaught Error: Hub session ID not found in query parameters
```

### URL Query Parameters (injected by TV shell)

| Param | Source | Purpose |
|-------|--------|---------|
| `volley_hub_session_id` | TV shell | Required by `useHubSessionId()` at render time |
| `volley_platform` | TV shell | Platform detection override (FIRE_TV, SAMSUNG_TV, LG_TV) |
| `volley_account` | TV shell | User account ID for tracking |
| `sessionId` | VGF | Game session identifier |

---

## Platform Detection

The SDK uses mobile detection first, then the `volley_platform` query param (set by the TV shell) with user-agent fallback:

```
1. Check getMobileType() for mobile/Capacitor bridge
2. Check volley_platform query param
3. Check user agent for "Tizen" + "SMART-TV" (Samsung)
4. Check user agent for "Web0S" + "SmartTV" (LG)
5. Default to Platform.Web
```

**Lightweight local detection** (no SDK dependency):

```typescript
export type TVPlatform = "WEB" | "FIRE_TV" | "SAMSUNG_TV" | "LG_TV" | "MOBILE"

export function detectPlatform(): TVPlatform {
    const params = new URLSearchParams(window.location.search)
    const override = params.get("volley_platform")
    if (override === "FIRE_TV") return "FIRE_TV"
    if (override === "SAMSUNG_TV") return "SAMSUNG_TV"
    if (override === "LG_TV") return "LG_TV"

    const ua = navigator.userAgent
    if (ua.includes("Tizen") && ua.includes("SMART-TV")) return "SAMSUNG_TV"
    if (ua.includes("Web0S") && ua.includes("SmartTV")) return "LG_TV"

    return "WEB"
}

export function isTV(platform: TVPlatform): boolean {
    return platform === "FIRE_TV" || platform === "SAMSUNG_TV" || platform === "LG_TV"
}
```

---

## Stage Configuration

The Stage type is: `"local" | "test" | "dev" | "staging" | "production"`.

| Stage | Behaviour |
|-------|----------|
| `"local"` | Requires `platformApiUrl`. Missing it causes silent failures. |
| `"test"` | Requires `platformApiUrl`. |
| `"dev"` | Auto-resolves API URLs to dev environment. |
| `"staging"` | Auto-resolves API URLs to staging environment. **Use for development on real devices.** |
| `"production"` | Auto-resolves to production URLs. |

**CRITICAL: Platform URLs must be stage-aware.** Never hardcode `platform-dev.volley-services.net`. Use a lookup table:

```typescript
function getPlatformApiUrl(stage: string): string {
    switch (stage) {
        case "local":
        case "dev":
            return "https://platform-dev.volley-services.net"
        case "staging":
            return "https://platform-staging.volley-services.net"
        case "production":
            return "https://platform.volley-services.net"
        default:
            return "https://platform-dev.volley-services.net"
    }
}
```

---

## useDeviceInfo() -- Returns METHODS, Not Properties

**CRITICAL:** `useDeviceInfo()` returns an object with **methods**, not destructurable properties.

```typescript
// WRONG:
const { deviceId } = useDeviceInfo()

// CORRECT:
const deviceInfo = useDeviceInfo()
const deviceId = deviceInfo.getDeviceId()
```

Use `useDeviceInfo().getDeviceId()` for device identity. **Do NOT generate random UUIDs** -- use Platform SDK for all device identification.

```typescript
import { useDeviceInfo } from "@volley/platform-sdk/react"

function useControllerSession() {
    const deviceInfo = useDeviceInfo()
    const deviceId = deviceInfo.getDeviceId()
    const sessionId = new URLSearchParams(window.location.search).get("sessionId")

    const transport = useMemo(() =>
        createSocketIOClientTransport({
            url: BACKEND_URL,
            query: {
                sessionId,
                userId: deviceId,   // Platform SDK device ID, not random UUID
                clientType: ClientType.Controller,
            },
        }),
        [sessionId, deviceId],
    )

    return { transport, sessionId, clientId: deviceId }
}
```

---

## useKeyDown / useKeyUp -- D-pad Navigation

```typescript
import { useKeyDown, useKeyUp } from "@volley/platform-sdk/react"

// Register key press handlers (requires PlatformContext)
useKeyDown("ArrowUp", () => { /* navigate up */ })
useKeyDown("ArrowDown", () => { /* navigate down */ })
useKeyDown("ArrowLeft", () => { /* navigate left */ })
useKeyDown("ArrowRight", () => { /* navigate right */ })
useKeyDown("Enter", () => { /* select */ })
useKeyDown("Escape", () => { /* back */ })

// Register key release handlers
useKeyUp("Enter", () => { /* release select */ })
```

---

## Available Hooks (Complete Table)

| Hook | Purpose |
|------|---------|
| `useKeyDown(key, callback)` | Register key press handler (requires PlatformContext) |
| `useKeyUp(key, callback)` | Register key release handler (requires PlatformContext) |
| `useMicrophone()` | Access TV microphone hardware |
| `useInputHandler()` | Low-level input handler access |
| `useAccount()` | Get user account info |
| `useSessionId()` | Get Platform session ID |
| `useHubSessionId()` | Get TV shell hub session ID |
| `useDeviceInfo()` | Get device hardware info (returns methods, not properties) |
| `useTracking()` | Analytics tracking |
| `useAppLifecycle()` | App foreground/background events |
| `useCloseEvent()` | App close handling |
| `useGameOrchestration()` | Game orchestration control |
| `usePayments()` | In-app purchases |
| `useSpeechRecognition()` | Platform speech-to-text |
| `useAudioRecorder()` | Raw audio recording |
| `useAppVersion()` | App version info |
| `useHapticFeedback()` | Controller haptics |
| `usePlatformStatus()` | SDK ready state |
| `useAccountManagement()` | Account management operations |
| `useEventBroker()` | Platform event broker |
| `useGameId()` | Get the current game ID |

---

## VWR Testing (Volley Web Runtime)

VWR lets you develop and test games on real TV and mobile devices by loading your app in an iframe inside the TV shell.

```
Shell (TV/Mobile) -> VWR Loader -> VWR -> Hub/Games (iframes)
```

### Prerequisites

| Component | Minimum Version |
|-----------|----------------|
| `@volley/platform-sdk` | >= v7.40.3 |
| Fire TV shell | >= 6.1.0 |
| Samsung TV shell | >= 1.9.2 |
| LG TV shell | >= 1.6.0 |
| Android mobile | >= 2026.02.07 (394) |
| iOS mobile (dev) | >= v.4.9.4(3) |

### AWS SSO Setup (Human Only -- Agents Cannot Do This)

```bash
aws configure sso
# SSO start URL: https://volley.awsapps.com/start
# SSO region: us-east-1
# Select TVDevelopers role

aws sso login --profile volley-tv
export AWS_PROFILE=volley-tv

# Verify:
aws sts get-caller-identity --profile volley-tv
```

SSO sessions expire every 12 hours. If CLI commands fail with auth errors, the human must re-run `aws sso login --profile volley-tv`.

### vwr-s3-cli Commands

**Setup (fastest path):**

```bash
npx @volley/vwr-s3-cli setup \
    --device-id <your-device-id> \
    --platform <platform> \
    --env <env> \
    --launch-url <your-game-url>
```

| Flag | Required | Default | Description |
|------|----------|---------|-------------|
| `--device-id <id>` | Yes | -- | Your TV's device ID |
| `--platform <platform>` | Yes | -- | `SAMSUNG_TV`, `LG_TV`, `FIRE_TV`, `IOS_MOBILE`, `ANDROID_MOBILE`, or `WEB` |
| `--env <env>` | No | `dev` | Environment (`dev`, `staging`, `prod`) |
| `--launch-url <url>` | No | -- | URL for VWR to load in an iframe |

**CRITICAL: `--platform` values are case-sensitive with underscores.** `firetv` or `fire-tv` will fail silently. Valid values: `SAMSUNG_TV`, `LG_TV`, `FIRE_TV`, `IOS_MOBILE`, `ANDROID_MOBILE`, `WEB`.

**Other commands:**

```bash
# Get existing config
npx @volley/vwr-s3-cli get --device-id <id> --platform <platform>

# Edit config interactively
npx @volley/vwr-s3-cli edit --device-id <id> --platform <platform>

# Delete config
npx @volley/vwr-s3-cli delete --device-id <id> --platform <platform>

# Check help
npx @volley/vwr-s3-cli --help
```

### Amplitude vwr-enabled Flag

The `vwr-enabled` Amplitude flag is the on/off switch for VWR on a device. Even with an S3 config file, VWR will not load unless the device is on the flag's whitelist. The `setup` command adds your device automatically.

```bash
# Check flag status
npx @volley/vwr-s3-cli flag status --device-id <id>

# Add device to flag
npx @volley/vwr-s3-cli flag add --device-id <id>

# Remove device from flag
npx @volley/vwr-s3-cli flag remove --device-id <id>
```

### Environment Defaults by --env

| Field | dev | staging | prod |
|-------|-----|---------|------|
| `hubUrl` | `https://game-clients-dev.volley.tv/hub` | `https://game-clients-staging.volley.tv/hub` | `https://game-clients.volley.tv/hub` |
| `trustedDomains` | `https://game-clients-dev.volley.tv` | `https://game-clients-staging.volley.tv` | `https://game-clients.volley.tv` |

### Launch on Device

1. Force-quit and relaunch the Dev Volley shell app (cold restart required after config changes)
2. Shell detects VWR config for your device ID, loads VWR, which loads the Hub
3. If `launchUrl` is set, VWR navigates to that URL in an iframe

---

## Controller App -- MUST Use Platform SDK

All Volley controller apps (phone) **must** use `@volley/platform-sdk` with `PlatformProvider`. This is non-negotiable for production deployment.

```typescript
// apps/controller/src/App.tsx
import { PlatformProvider } from "@volley/platform-sdk/react"

const GAME_ID = import.meta.env.VITE_GAME_ID ?? "your-game-id"
const STAGE = import.meta.env.VITE_PLATFORM_SDK_STAGE ?? "staging"

export function App() {
    return (
        <PlatformProvider
            options={{
                gameId: GAME_ID,
                appVersion: __APP_VERSION__,
                stage: STAGE,
                tracking: {
                    segmentWriteKey: import.meta.env.VITE_SEGMENT_WRITE_KEY ?? "",
                },
            }}
        >
            <ControllerRoot />
        </PlatformProvider>
    )
}
```

**Provider stacking order (outermost to innermost):**
1. `PlatformProvider` -- Auth, analytics, device info
2. `BrowserRouter` -- URL routing
3. `VGFProvider` -- Game state transport
4. `SessionProvider` -- Session context
5. `LoggerProvider` -- Logging context (optional)

---

## Common Gotchas

### VPN Required for Dev/Staging

Local dev with `PlatformProvider` requires Volley VPN. The `auth-dev.volley.tv` server CORS-blocks localhost without VPN access. If you see CORS errors from auth endpoints, connect to VPN before retrying.

### No React StrictMode

**Do NOT use React StrictMode with VGF.** StrictMode's double mount/unmount cycle disconnects the Socket.IO transport permanently. Render `<App />` directly, no `<StrictMode>` wrapper.

```typescript
// main.tsx
createRoot(root).render(<App />)  // No <StrictMode>
```

### Use 127.0.0.1, Not localhost

VPN software can intercept `localhost` DNS resolution. Use `127.0.0.1` for all dev server URLs to bypass this.

### useDeviceInfo Returns Methods

```typescript
// WRONG: const { deviceId } = useDeviceInfo()
// CORRECT: useDeviceInfo().getDeviceId()
```

### Platform URL Hardcoding

Never hardcode platform URLs. Always derive from the current stage.

### socketOptions.query Clobbers VGF

Never put `query` inside a nested `socketOptions` object. This replaces VGF's internal `sessionId`, `userId`, and `clientType` params.
