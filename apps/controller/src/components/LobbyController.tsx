/**
 * Lobby phase controller — shows connection status and a Start Game button.
 */
import { useDispatchThunk } from "../hooks/useVGFState"

export function LobbyController() {
    const dispatchThunk = useDispatchThunk()

    const handleStartGame = () => {
        try {
            dispatchThunk("START_GAME", {})
        } catch (err) {
            console.warn("[LobbyController] START_GAME dispatch error:", err)
        }
    }

    return (
        <div
            style={{
                padding: 32,
                fontFamily: "sans-serif",
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 24,
                minHeight: "100vh",
                justifyContent: "center",
            }}
        >
            <h1 style={{ fontSize: 28, margin: 0 }}>Connected to Hello Weekend!</h1>
            <p style={{ color: "#666", margin: 0 }}>You are in the lobby. Press the button below to start.</p>
            <button
                onClick={handleStartGame}
                style={{
                    fontSize: 24,
                    padding: "16px 48px",
                    borderRadius: 12,
                    border: "none",
                    background: "#4CAF50",
                    color: "white",
                    cursor: "pointer",
                    fontWeight: "bold",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                }}
            >
                Start Game
            </button>
        </div>
    )
}
