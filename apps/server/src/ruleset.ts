/**
 * Top-level entry point for the VGF server.
 * Implements GameRuleset<HelloWeekendState>.
 */
import type { GameRuleset } from "@volley/vgf/server"
import type { HelloWeekendState } from "@hello-weekend/shared"
import { createInitialGameState } from "@hello-weekend/shared"
import { globalReducers } from "./reducers"
import { createPhases } from "./phases"
import {
    createTransitionToPhaseThunk,
    createStartGameThunk,
    createProcessTranscriptionThunk,
} from "./thunks"
import type { GameServices } from "./services"

/**
 * Creates the game ruleset for Hello Weekend.
 * This is the interface VGF expects to boot the game server.
 */
export function createGameRuleset(
    services: GameServices,
): GameRuleset<HelloWeekendState> {
    return {
        setup: createInitialGameState,
        actions: {},
        reducers: globalReducers,
        thunks: {
            TRANSITION_TO_PHASE: createTransitionToPhaseThunk(),
            START_GAME: createStartGameThunk(services),
            PROCESS_TRANSCRIPTION: createProcessTranscriptionThunk(services),
        },
        phases: createPhases(),
    } as unknown as GameRuleset<HelloWeekendState>
}
