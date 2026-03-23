/**
 * Routes to the correct controller component based on the current game phase.
 *
 * CRITICAL: VGF state starts as {} — always guard with "phase" in state
 * before rendering phase-specific components.
 */
import { useStateSync } from "../hooks/useVGFState"
import { LobbyController } from "./LobbyController"
import { PlayingController } from "./PlayingController"
import { GameOverController } from "./GameOverController"

export function PhaseRouter() {
    const state = useStateSync()

    if (!state || !("phase" in state)) {
        return (
            <div style={{ padding: 32, fontFamily: "sans-serif", textAlign: "center" }}>
                <p>Connecting...</p>
            </div>
        )
    }

    switch (state.phase) {
        case "lobby":
            return <LobbyController />
        case "playing":
            return <PlayingController />
        case "gameOver":
            return <GameOverController />
        default:
            return (
                <div style={{ padding: 32, fontFamily: "sans-serif", textAlign: "center" }}>
                    <p>Unknown phase: {state.phase}</p>
                </div>
            )
    }
}
