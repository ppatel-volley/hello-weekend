/**
 * Game Over phase controller — shows final score and a Play Again button.
 */
import { useStateSync, useDispatchThunk } from "../hooks/useVGFState"

export function GameOverController() {
    const state = useStateSync()
    const dispatchThunk = useDispatchThunk()

    const score = (state as any)?.score ?? 0
    const totalQuestions = (state as any)?.totalQuestions ?? 0

    const handlePlayAgain = () => {
        try {
            dispatchThunk("TRANSITION_TO_PHASE", "lobby")
        } catch (err) {
            console.warn("[GameOverController] TRANSITION_TO_PHASE error:", err)
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
            <h1 style={{ fontSize: 36, margin: 0 }}>Game Over!</h1>
            <p style={{ fontSize: 24, color: "#333", margin: 0 }}>
                Score: {score} / {totalQuestions}
            </p>
            <button
                onClick={handlePlayAgain}
                style={{
                    fontSize: 22,
                    padding: "16px 48px",
                    borderRadius: 12,
                    border: "none",
                    background: "#9C27B0",
                    color: "white",
                    cursor: "pointer",
                    fontWeight: "bold",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                }}
            >
                Play Again
            </button>
        </div>
    )
}
