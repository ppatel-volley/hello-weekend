/**
 * Playing phase controller — voice input via Recognition Service SDK
 * with text input fallback for dev without VPN.
 *
 * Key patterns:
 * - Hold-to-speak mic button with touch start/end
 * - Recognition Service SDK via createClientWithBuilder
 * - asrRequestConfig is REQUIRED (gotcha #1)
 * - sampleRate from AudioContext, NOT hardcoded (gotcha #2)
 * - GameContextV1 requires type, gameId, gamePhase (gotcha #3)
 * - onError must clean up resources (gotcha #6)
 * - stopRecording() for normal release, stopAbnormally() for error/unmount (gotcha #5)
 * - Text input fallback when Recognition Service is unavailable
 */
import { useState, useRef, useEffect, useCallback } from "react"
import { useStateSync, useDispatchThunk } from "../hooks/useVGFState"

// Try to load Recognition Service SDK synchronously — may not be available
let recognitionSdk: any = null
try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    recognitionSdk = require("@volley/recognition-client-sdk")
} catch {
    console.warn("[PlayingController] Recognition Service SDK not available — using text input fallback")
}

interface RecordingResources {
    client: any
    audioCtx: AudioContext
    mediaStream: MediaStream
    scriptNode: ScriptProcessorNode
    source: MediaStreamAudioSourceNode
}

export function PlayingController() {
    const state = useStateSync()
    const dispatchThunk = useDispatchThunk()

    const [isRecording, setIsRecording] = useState(false)
    const [transcript, setTranscript] = useState("")
    const [textInput, setTextInput] = useState("")
    const [feedback, setFeedback] = useState<string | null>(null)
    const [sdkAvailable, setSdkAvailable] = useState(recognitionSdk !== null)

    const resourcesRef = useRef<RecordingResources | null>(null)

    const question = (state as any)?.currentQuestion ?? ""
    const questionIndex = (state as any)?.questionIndex ?? 0
    const totalQuestions = (state as any)?.totalQuestions ?? 0
    const score = (state as any)?.score ?? 0
    const lastAnswerText = (state as any)?.lastAnswerText ?? null
    const lastAnswerCorrect = (state as any)?.lastAnswerCorrect ?? null
    const hintKeywords = ((state as any)?.hintKeywords ?? []) as string[]

    // Show answer feedback when it changes
    useEffect(() => {
        if (lastAnswerText !== null) {
            setFeedback(
                lastAnswerCorrect
                    ? `Correct! "${lastAnswerText}"`
                    : `Wrong: "${lastAnswerText}"`,
            )
            const timer = setTimeout(() => setFeedback(null), 3000)
            return () => clearTimeout(timer)
        }
    }, [lastAnswerText, lastAnswerCorrect])

    const cleanup = useCallback(() => {
        const res = resourcesRef.current
        if (!res) return

        try {
            res.scriptNode.disconnect()
            res.source.disconnect()
            res.mediaStream.getTracks().forEach((t) => t.stop())
            res.audioCtx.close().catch(() => {})
        } catch (err) {
            console.warn("[PlayingController] cleanup error:", err)
        }

        resourcesRef.current = null
        setIsRecording(false)
    }, [])

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            const res = resourcesRef.current
            if (res?.client) {
                try {
                    res.client.stopAbnormally()
                } catch {}
            }
            cleanup()
        }
    }, [cleanup])

    const startRecording = useCallback(async () => {
        if (!recognitionSdk || isRecording) return

        const { createClientWithBuilder, RecognitionContextTypeV1, AudioEncoding, Language } =
            recognitionSdk

        try {
            const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true })
            const audioCtx = new AudioContext()

            const client = createClientWithBuilder((builder: any) =>
                builder
                    .stage(import.meta.env.VITE_RECOGNITION_STAGE ?? "dev")
                    .gameId("hello-weekend")
                    .asrRequestConfig({
                        provider: "deepgram",
                        model: "nova-3",
                        language: Language.ENGLISH_US,
                        sampleRate: audioCtx.sampleRate as any,
                        encoding: AudioEncoding.LINEAR16,
                        interimResults: true,
                        useContext: true,
                    })
                    .gameContext({
                        type: RecognitionContextTypeV1.GAME_CONTEXT,
                        gameId: "hello-weekend",
                        gamePhase: "playing",
                        slotMap: { answer: hintKeywords },
                    })
                    .onTranscript((result: any) => {
                        if (result.finalTranscript || result.pendingTranscript) {
                            setTranscript(result.finalTranscript || result.pendingTranscript || "")
                        }

                        if (!result.finalTranscript) return

                        try {
                            dispatchThunk("PROCESS_TRANSCRIPTION", {
                                text: result.finalTranscript,
                                confidence: result.finalTranscriptConfidence ?? 0,
                                isFinal: result.is_finished,
                            })
                        } catch (err) {
                            console.warn("[PlayingController] PROCESS_TRANSCRIPTION error:", err)
                        }
                    })
                    .onError((error: any) => {
                        console.error("[PlayingController] Recognition SDK error:", error)
                        const res = resourcesRef.current
                        if (res?.client) {
                            try {
                                res.client.stopAbnormally()
                            } catch {}
                        }
                        cleanup()
                    }),
            )

            await client.connect()

            // Create ScriptProcessorNode for PCM capture
            const source = audioCtx.createMediaStreamSource(mediaStream)
            const scriptNode = audioCtx.createScriptProcessor(4096, 1, 1)

            scriptNode.onaudioprocess = (e: AudioProcessingEvent) => {
                if (!client.isConnected()) return

                const float32 = e.inputBuffer.getChannelData(0)
                const int16 = new Int16Array(float32.length)
                for (let i = 0; i < float32.length; i++) {
                    const s = Math.max(-1, Math.min(1, float32[i]))
                    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
                }
                client.sendAudio(int16.buffer)
            }

            source.connect(scriptNode)
            scriptNode.connect(audioCtx.destination)

            resourcesRef.current = { client, audioCtx, mediaStream, scriptNode, source }
            setIsRecording(true)
            setTranscript("")
        } catch (err) {
            console.error("[PlayingController] Failed to start recording:", err)
            setSdkAvailable(false)
            cleanup()
        }
    }, [isRecording, hintKeywords, dispatchThunk, cleanup])

    const stopRecording = useCallback(async () => {
        const res = resourcesRef.current
        if (!res?.client) return

        try {
            // Graceful stop — waits for final transcript
            await res.client.stopRecording()
        } catch (err) {
            console.warn("[PlayingController] stopRecording error:", err)
        }

        cleanup()
    }, [cleanup])

    const handleTextSubmit = useCallback(
        (e: React.FormEvent) => {
            e.preventDefault()
            if (!textInput.trim()) return

            try {
                dispatchThunk("PROCESS_TRANSCRIPTION", {
                    text: textInput.trim(),
                    confidence: 1.0,
                    isFinal: true,
                })
            } catch (err) {
                console.warn("[PlayingController] PROCESS_TRANSCRIPTION error:", err)
            }

            setTextInput("")
        },
        [textInput, dispatchThunk],
    )

    return (
        <div
            style={{
                padding: 24,
                fontFamily: "sans-serif",
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 16,
                minHeight: "100vh",
            }}
        >
            {/* Score and progress */}
            <div style={{ fontSize: 14, color: "#888" }}>
                Question {questionIndex + 1} of {totalQuestions} | Score: {score}
            </div>

            {/* Question */}
            <h2 style={{ fontSize: 22, margin: "8px 0", maxWidth: 400 }}>
                {question || "Waiting for question..."}
            </h2>

            {/* Answer feedback */}
            {feedback && (
                <div
                    style={{
                        padding: "8px 16px",
                        borderRadius: 8,
                        background: lastAnswerCorrect ? "#E8F5E9" : "#FFEBEE",
                        color: lastAnswerCorrect ? "#2E7D32" : "#C62828",
                        fontWeight: "bold",
                    }}
                >
                    {feedback}
                </div>
            )}

            {/* Transcript display */}
            {transcript && (
                <div style={{ fontSize: 16, color: "#555", fontStyle: "italic" }}>
                    "{transcript}"
                </div>
            )}

            {/* Voice input — Hold to Speak button */}
            {sdkAvailable && (
                <button
                    onTouchStart={startRecording}
                    onTouchEnd={stopRecording}
                    onMouseDown={startRecording}
                    onMouseUp={stopRecording}
                    onMouseLeave={() => {
                        if (isRecording) stopRecording()
                    }}
                    style={{
                        fontSize: 20,
                        padding: "20px 40px",
                        borderRadius: 50,
                        border: "none",
                        background: isRecording ? "#F44336" : "#2196F3",
                        color: "white",
                        cursor: "pointer",
                        fontWeight: "bold",
                        boxShadow: isRecording
                            ? "0 0 24px rgba(244,67,54,0.5)"
                            : "0 4px 12px rgba(0,0,0,0.15)",
                        transition: "all 0.2s",
                        userSelect: "none",
                        WebkitUserSelect: "none",
                    }}
                >
                    {isRecording ? "Listening..." : "Hold to Speak"}
                </button>
            )}

            {/* Text input fallback */}
            <div style={{ marginTop: 16, width: "100%", maxWidth: 400 }}>
                {!sdkAvailable && (
                    <p style={{ fontSize: 12, color: "#999", marginBottom: 8 }}>
                        Voice input unavailable (no VPN/SDK). Using text fallback.
                    </p>
                )}
                <form
                    onSubmit={handleTextSubmit}
                    style={{ display: "flex", gap: 8 }}
                >
                    <input
                        type="text"
                        value={textInput}
                        onChange={(e) => setTextInput(e.target.value)}
                        placeholder="Type your answer..."
                        style={{
                            flex: 1,
                            padding: "12px 16px",
                            fontSize: 16,
                            borderRadius: 8,
                            border: "1px solid #ddd",
                            outline: "none",
                        }}
                    />
                    <button
                        type="submit"
                        style={{
                            padding: "12px 24px",
                            fontSize: 16,
                            borderRadius: 8,
                            border: "none",
                            background: "#FF9800",
                            color: "white",
                            cursor: "pointer",
                            fontWeight: "bold",
                        }}
                    >
                        Submit
                    </button>
                </form>
            </div>
        </div>
    )
}
