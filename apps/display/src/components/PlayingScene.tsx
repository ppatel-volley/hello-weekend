import type { HelloWeekendState } from "@hello-weekend/shared"

interface PlayingSceneProps {
    state: HelloWeekendState
}

export function PlayingScene({ state }: PlayingSceneProps) {
    const isCorrect = state.lastAnswerCorrect === true
    const isIncorrect = state.lastAnswerCorrect === false
    const hasAnswerFeedback = state.lastAnswerCorrect !== null

    return (
        <div data-phase="playing" style={{
            display: "flex",
            flexDirection: "column",
            height: "100vh",
            backgroundColor: "#1a1a2e",
            color: "#e0e0e0",
            fontFamily: "sans-serif",
            padding: "2rem",
        }}>
            {/* Header: score + progress */}
            <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "2rem",
            }}>
                <div data-score={state.score} style={{
                    fontSize: "1.5rem",
                    color: "#667eea",
                    fontWeight: "bold",
                }}>
                    Score: {state.score}
                </div>
                <div style={{
                    fontSize: "1.2rem",
                    color: "#888",
                }}>
                    Question {state.questionIndex + 1} / {state.totalQuestions}
                </div>
            </div>

            {/* Current question */}
            <div style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "2rem",
            }}>
                <h2 data-question={state.currentQuestion} style={{
                    fontSize: "2.5rem",
                    margin: 0,
                    textAlign: "center",
                    maxWidth: "80%",
                    lineHeight: 1.3,
                }}>
                    {state.currentQuestion || "Preparing question..."}
                </h2>

                {/* Answer feedback */}
                {hasAnswerFeedback && (
                    <div data-feedback={isCorrect ? "correct" : "incorrect"} style={{
                        padding: "1rem 2rem",
                        borderRadius: "12px",
                        fontSize: "1.5rem",
                        fontWeight: "bold",
                        backgroundColor: isCorrect ? "#1b4332" : "#641220",
                        color: isCorrect ? "#95d5b2" : "#f4978e",
                        border: `2px solid ${isCorrect ? "#2d6a4f" : "#a4161a"}`,
                    }}>
                        {isCorrect ? "Correct!" : "Incorrect"}
                        {state.lastAnswerText && (
                            <span style={{ fontWeight: "normal", marginLeft: "1rem", fontSize: "1.2rem" }}>
                                — "{state.lastAnswerText}"
                            </span>
                        )}
                    </div>
                )}

                {/* Latest transcript */}
                {state.transcript && (
                    <div style={{
                        padding: "0.75rem 1.5rem",
                        backgroundColor: "#16213e",
                        borderRadius: "8px",
                        border: "1px solid #333",
                        fontSize: "1.2rem",
                        color: "#aaa",
                        fontStyle: "italic",
                        maxWidth: "70%",
                        textAlign: "center",
                    }}>
                        "{state.transcript}"
                    </div>
                )}
            </div>
        </div>
    )
}
