import { useStateSync } from "../hooks/useVGFState"
import { LobbyScene } from "./LobbyScene"
import { PlayingScene } from "./PlayingScene"
import { GameOverScene } from "./GameOverScene"
import type { HelloWeekendState } from "@hello-weekend/shared"

/**
 * Routes to the correct scene based on VGF phase.
 * Guards against empty initial state ({}) before VGF connects.
 */
export function SceneRouter() {
    const state = useStateSync() as HelloWeekendState

    // VGF state starts as {} — guard until real state arrives
    if (!state || !("phase" in state)) {
        return (
            <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: "100vh",
                backgroundColor: "#1a1a2e",
                color: "#e0e0e0",
                fontFamily: "sans-serif",
                fontSize: "1.5rem",
            }}>
                Connecting...
            </div>
        )
    }

    switch (state.phase) {
        case "lobby":
            return <LobbyScene state={state} />
        case "playing":
            return <PlayingScene state={state} />
        case "gameOver":
            return <GameOverScene state={state} />
        default:
            return (
                <div style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    height: "100vh",
                    backgroundColor: "#1a1a2e",
                    color: "#e0e0e0",
                    fontFamily: "sans-serif",
                    fontSize: "1.5rem",
                }}>
                    Unknown phase: {state.phase}
                </div>
            )
    }
}
