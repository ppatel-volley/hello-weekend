import type { HelloWeekendState } from "@hello-weekend/shared"

interface GameOverSceneProps {
    state: HelloWeekendState
}

export function GameOverScene({ state }: GameOverSceneProps) {
    return (
        <div style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100vh",
            backgroundColor: "#1a1a2e",
            color: "#e0e0e0",
            fontFamily: "sans-serif",
            gap: "2rem",
        }}>
            <h1 style={{
                fontSize: "4rem",
                margin: 0,
                background: "linear-gradient(135deg, #f093fb, #f5576c)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
            }}>
                Game Over!
            </h1>

            <div style={{
                fontSize: "2.5rem",
                fontWeight: "bold",
                color: "#667eea",
            }}>
                Final Score: {state.score}
            </div>

            <p style={{
                fontSize: "1.3rem",
                color: "#888",
                margin: 0,
            }}>
                Check your controller to play again
            </p>
        </div>
    )
}
