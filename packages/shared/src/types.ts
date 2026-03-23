export interface HelloWeekendState {
    // MUST include index signature (VGF requirement)
    [key: string]: unknown

    // VGF BaseGameState
    phase: string
    previousPhase?: string
    __vgfStateVersion?: number

    // WoF phase transition pattern
    nextPhase: string | null

    // Game state
    score: number
    questionIndex: number
    totalQuestions: number
    currentQuestion: string
    hintKeywords: string[] // For Recognition Service keyword boosting
    lastAnswerText: string | null
    lastAnswerCorrect: boolean | null
    transcript: string

    // Timer
    timerStartedAt: number
    timerDuration: number

    // Connection
    controllerConnected: boolean
}

// Server-only state (never sent to clients)
export interface ServerOnlyState {
    questions: Question[]
    currentAnswer: string
    currentKeywords: string[]
}

export interface Question {
    question: string
    answer: string
    keywords: string[]
}
