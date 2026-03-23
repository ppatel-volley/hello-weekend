import type { HelloWeekendState } from "./types"
import { GAME_CONSTANTS } from "./constants"

export function createInitialGameState(): HelloWeekendState {
    return {
        phase: "lobby",
        previousPhase: undefined,
        __vgfStateVersion: undefined,
        nextPhase: null,
        score: 0,
        questionIndex: 0,
        totalQuestions: GAME_CONSTANTS.QUESTIONS_PER_ROUND,
        currentQuestion: "",
        hintKeywords: [],
        lastAnswerText: null,
        lastAnswerCorrect: null,
        transcript: "",
        timerStartedAt: 0,
        timerDuration: GAME_CONSTANTS.TIMER_DURATION_MS,
        controllerConnected: false,
    }
}
