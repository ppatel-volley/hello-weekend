/**
 * Thunks — async operations that dispatch reducers.
 * Each thunk factory receives GameServices via closure capture.
 *
 * Thunks receive an IThunkContext from VGF at runtime:
 *   ctx.getState(), ctx.getSessionId(), ctx.getClientId(),
 *   ctx.dispatch(), ctx.dispatchThunk()
 */
import type { HelloWeekendState } from "@hello-weekend/shared"
import { GAME_CONSTANTS } from "@hello-weekend/shared"
import type { GameServices } from "./services"
import { getRandomQuestions } from "./questions"

// VGF IThunkContext-compatible interface (structural match)
interface ThunkContext {
    getState: () => HelloWeekendState
    getSessionId: () => string
    getClientId: () => string
    dispatch: (reducerName: string, ...args: unknown[]) => void
    dispatchThunk: (thunkName: string, ...args: unknown[]) => Promise<void>
    logger: {
        info: (...args: unknown[]) => void
        error: (...args: unknown[]) => void
    }
}

/**
 * TRANSITION_TO_PHASE — WoF pattern: dispatches SET_NEXT_PHASE.
 * endIf checks hasNextPhase, next returns nextPhase.
 */
export function createTransitionToPhaseThunk(_services?: GameServices) {
    return async (ctx: ThunkContext, targetPhase: unknown) => {
        ctx.dispatch("SET_NEXT_PHASE", { targetPhase: targetPhase as string })
    }
}

/**
 * START_GAME — loads questions into serverState, dispatches initial state.
 * Called by the controller after connecting.
 */
export function createStartGameThunk(services: GameServices) {
    return async (ctx: ThunkContext, _payload: unknown) => {
        const sessionId = ctx.getSessionId()
        const questions = getRandomQuestions(GAME_CONSTANTS.QUESTIONS_PER_ROUND)

        // Store server-only state
        services.serverState.set(sessionId, {
            questions,
            currentAnswer: questions[0].answer,
            currentKeywords: questions[0].keywords,
        })

        ctx.dispatch("SET_CONTROLLER_CONNECTED", { connected: true })
        ctx.dispatch("SET_QUESTION", {
            question: questions[0].question,
            questionIndex: 0,
            hintKeywords: questions[0].keywords,
            timerStartedAt: Date.now(),
            timerDuration: GAME_CONSTANTS.TIMER_DURATION_MS,
        })
        ctx.dispatch("SET_NEXT_PHASE", { targetPhase: "playing" })
    }
}

/**
 * PROCESS_TRANSCRIPTION — checks answer (case-insensitive),
 * dispatches SUBMIT_ANSWER, advances question or transitions to gameOver.
 */
export function createProcessTranscriptionThunk(services: GameServices) {
    return async (ctx: ThunkContext, payload: unknown) => {
        const { text } = payload as { text: string }
        const state = ctx.getState()
        const sessionId = ctx.getSessionId()
        const serverState = services.serverState.get(sessionId)

        if (!serverState) {
            ctx.logger.error(
                "PROCESS_TRANSCRIPTION: no server state for session",
                sessionId,
            )
            return
        }

        const normalisedText = text.toLowerCase().trim()
        const isCorrect =
            normalisedText.includes(serverState.currentAnswer) ||
            serverState.currentKeywords.some((kw) =>
                normalisedText.includes(kw),
            )

        const newScore = isCorrect ? state.score + 1 : state.score

        ctx.dispatch("SUBMIT_ANSWER", {
            text,
            correct: isCorrect,
            score: newScore,
        })

        // Advance to next question or end game
        const nextIndex = state.questionIndex + 1
        if (nextIndex >= state.totalQuestions) {
            // Game over
            ctx.dispatch("SET_NEXT_PHASE", { targetPhase: "gameOver" })
        } else {
            // Next question
            const nextQ = serverState.questions[nextIndex]
            serverState.currentAnswer = nextQ.answer
            serverState.currentKeywords = nextQ.keywords

            ctx.dispatch("SET_QUESTION", {
                question: nextQ.question,
                questionIndex: nextIndex,
                hintKeywords: nextQ.keywords,
                timerStartedAt: Date.now(),
                timerDuration: GAME_CONSTANTS.TIMER_DURATION_MS,
            })
        }
    }
}
