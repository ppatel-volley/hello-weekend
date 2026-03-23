import type { ServerOnlyState } from "@hello-weekend/shared"

export interface GameServices {
    serverState: Map<string, ServerOnlyState>
}
