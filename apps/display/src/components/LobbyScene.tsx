import type { HelloWeekendState } from "@hello-weekend/shared"

interface LobbySceneProps {
    state: HelloWeekendState
}

export function LobbyScene({ state }: LobbySceneProps) {
    const params = new URLSearchParams(window.location.search)
    const sessionId = params.get("sessionId") ?? ""
    const controllerUrl = `${window.location.origin}?sessionId=${sessionId}`

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
                background: "linear-gradient(135deg, #667eea, #764ba2)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
            }}>
                Hello Weekend!
            </h1>

            <p style={{
                fontSize: "1.5rem",
                color: "#aaa",
                margin: 0,
            }}>
                Waiting for a controller to connect...
            </p>

            <div style={{
                padding: "1.5rem 2rem",
                backgroundColor: "#16213e",
                borderRadius: "12px",
                border: "1px solid #333",
                textAlign: "center",
            }}>
                <p style={{ margin: "0 0 0.5rem 0", fontSize: "1rem", color: "#888" }}>
                    Connect your controller at:
                </p>
                <p style={{
                    margin: 0,
                    fontSize: "1.2rem",
                    color: "#667eea",
                    fontFamily: "monospace",
                    wordBreak: "break-all",
                }}>
                    {controllerUrl}
                </p>
            </div>
        </div>
    )
}
