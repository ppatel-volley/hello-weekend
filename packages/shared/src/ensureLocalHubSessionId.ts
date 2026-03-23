/**
 * Ensures volley_hub_session_id query parameter exists in local/dev/staging.
 * This allows PlatformProvider to initialise without requiring a real Volley Hub session.
 * Matches WoF's ensureLocalHubSessionId pattern.
 *
 * Browser-only: call this before rendering PlatformProvider in client apps.
 * Uses `globalThis` to avoid requiring DOM lib in the shared package tsconfig.
 */
export function ensureLocalHubSessionId(stage: string): void {
    if (stage !== "local" && stage !== "dev" && stage !== "staging") return

    const win = globalThis as unknown as {
        location?: { href: string }
        history?: {
            replaceState: (
                data: unknown,
                unused: string,
                url: string,
            ) => void
        }
    }
    if (!win.location) return

    const url = new URL(win.location.href)
    if (!url.searchParams.has("volley_hub_session_id")) {
        url.searchParams.set("volley_hub_session_id", "local-dev-hub-session")
        win.history?.replaceState({}, "", url.toString())
    }
}
