import type { ReactNode } from "react"
import { PlatformProvider } from "@volley/platform-sdk/react"
import { SceneRouter } from "./components/SceneRouter"
import { VGFDisplayProvider } from "./providers/VGFDisplayProvider"
import { detectPlatform, isTV } from "./utils/detectPlatform"
import { ensureLocalHubSessionId, GAME_CONSTANTS } from "@hello-weekend/shared"

const stage = import.meta.env.VITE_STAGE ?? "staging"

// Inject fallback volley_hub_session_id before any React renders
ensureLocalHubSessionId(stage)

/**
 * MaybePlatformProvider — only loads PlatformProvider on real TV devices.
 * On web/dev: skip PlatformProvider entirely (useHubSessionId throws without volley_hub_session_id).
 */
function MaybePlatformProvider({ children }: { children: ReactNode }) {
    if (!isTV(detectPlatform())) return <>{children}</>

    return (
        <PlatformProvider
            options={{
                gameId: GAME_CONSTANTS.GAME_ID,
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
