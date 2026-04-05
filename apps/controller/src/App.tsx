/**
 * Controller app root.
 *
 * Uses PlatformProvider unconditionally (controllers always run in mobile
 * browser, never in TV shell — no MaybePlatformProvider needed).
 *
 * ensureLocalHubSessionId() is called at module level to inject the fallback
 * volley_hub_session_id param before PlatformProvider renders.
 */
import type { ReactNode } from "react"
import { PlatformProvider } from "@volley/platform-sdk/react"
import { ensureLocalHubSessionId, GAME_CONSTANTS } from "@hello-weekend/shared"
import { getSessionIdFromUrl } from "./utils/params"
import { VGFControllerProvider } from "./providers/VGFControllerProvider"
import { PhaseRouter } from "./components/PhaseRouter"

const STAGE = import.meta.env.VITE_PLATFORM_SDK_STAGE ?? "dev"

// Inject fallback hub session ID before any React rendering
ensureLocalHubSessionId(STAGE)

function MaybePlatformProvider({ children }: { children: ReactNode }) {
    return (
        <PlatformProvider
            options={{
                gameId: GAME_CONSTANTS.GAME_ID,
                appVersion: "0.1.0",
                stage: STAGE,
            }}
        >
            {children}
        </PlatformProvider>
    )
}

export function App() {
    const sessionId = getSessionIdFromUrl()

    if (!sessionId) {
        return (
            <div style={{ padding: 32, fontFamily: "sans-serif", textAlign: "center" }}>
                <h1>Hello Weekend Controller</h1>
                <p>No session ID found.</p>
                <p>
                    Add <code>?sessionId=dev-test</code> to the URL to connect.
                </p>
                <p style={{ marginTop: 16, color: "#666" }}>
                    Example:{" "}
                    <a href="?sessionId=dev-test">
                        {window.location.origin}
                        {window.location.pathname}?sessionId=dev-test
                    </a>
                </p>
            </div>
        )
    }

    return (
        <MaybePlatformProvider>
            <VGFControllerProvider sessionId={sessionId}>
                <PhaseRouter />
            </VGFControllerProvider>
        </MaybePlatformProvider>
    )
}
