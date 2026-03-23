import type { HelloWeekendState } from "@hello-weekend/shared"

/**
 * Pure reducers. ALL take (state, payload) pattern.
 * NONE modify state.phase — VGF 4.8+ throws PhaseModificationError.
 */
export const globalReducers: Record<
    string,
    (state: HelloWeekendState, ...args: unknown[]) => HelloWeekendState
> = {
    SET_NEXT_PHASE: (
        state: HelloWeekendState,
        payload: unknown,
    ): HelloWeekendState => {
        const { targetPhase } = payload as { targetPhase: string }
        return { ...state, nextPhase: targetPhase }
    },

    CLEAR_NEXT_PHASE: (state: HelloWeekendState): HelloWeekendState => {
        return { ...state, nextPhase: null }
    },

    SET_CONTROLLER_CONNECTED: (
        state: HelloWeekendState,
        payload: unknown,
    ): HelloWeekendState => {
        const { connected } = payload as { connected: boolean }
        return { ...state, controllerConnected: connected }
    },

    SET_QUESTION: (
        state: HelloWeekendState,
        payload: unknown,
    ): HelloWeekendState => {
        const {
            question,
            questionIndex,
            hintKeywords,
            timerStartedAt,
            timerDuration,
        } = payload as {
            question: string
            questionIndex: number
            hintKeywords: string[]
            timerStartedAt: number
            timerDuration: number
        }
        return {
            ...state,
            currentQuestion: question,
            questionIndex,
            hintKeywords,
            timerStartedAt,
            timerDuration,
            lastAnswerText: null,
            lastAnswerCorrect: null,
            transcript: "",
        }
    },

    SUBMIT_ANSWER: (
        state: HelloWeekendState,
        payload: unknown,
    ): HelloWeekendState => {
        const { text, correct, score } = payload as {
            text: string
            correct: boolean
            score: number
        }
        return {
            ...state,
            lastAnswerText: text,
            lastAnswerCorrect: correct,
            score,
        }
    },
}
