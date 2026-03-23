import type { ReactNode } from "react"
import { SceneRouter } from "./components/SceneRouter"
import { VGFDisplayProvider } from "./providers/VGFDisplayProvider"
import { detectPlatform, isTV } from "./utils/detectPlatform"
import { ensureLocalHubSessionId } from "@hello-weekend/shared"

const stage = import.meta.env.VITE_STAGE ?? "staging"

// Inject fallback volley_hub_session_id before any React renders
ensureLocalHubSessionId(stage)

/**
 * MaybePlatformProvider — only loads PlatformProvider on real TV devices.
 * On web/dev: skip PlatformProvider entirely (useHubSessionId throws without volley_hub_session_id).
 */
function MaybePlatformProvider({ children }: { children: ReactNode }) {
    if (!isTV(detectPlatform())) return <>{children}</>

    // Synchronous conditional load — avoids bundling the SDK in web builds.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PlatformProvider } = require("@volley/platform-sdk/react")

    return (
        <PlatformProvider
            options={{
                gameId: "hello-weekend",
                appVersion: "0.1.0",
                stage,
                screensaverPrevention: { autoStart: true },
            }}
        >
            {children}
        </PlatformProvider>
    )
}

export function App() {
    return (
        <MaybePlatformProvider>
            <VGFDisplayProvider>
                <SceneRouter />
            </VGFDisplayProvider>
        </MaybePlatformProvider>
    )
}
