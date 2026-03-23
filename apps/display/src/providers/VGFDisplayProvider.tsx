/**
 * VGF provider wrapper for the DISPLAY client.
 * Creates SocketIOClientTransport via useMemo and lets VGFProvider manage lifecycle.
 */
import { useMemo, type ReactNode } from "react"
import {
    VGFProvider,
    SocketIOClientTransport,
    ClientType,
} from "@volley/vgf/client"

interface VGFDisplayProviderProps {
    children: ReactNode
    serverUrl?: string
}

function getQueryParam(name: string, fallback: string): string {
    const params = new URLSearchParams(window.location.search)
    return params.get(name) ?? fallback
}

export function VGFDisplayProvider({ children, serverUrl }: VGFDisplayProviderProps) {
    const transport = useMemo(() => {
        const url = serverUrl ?? (import.meta.env.DEV ? "http://127.0.0.1:8090" : window.location.origin)
        const sessionId = getQueryParam("sessionId", "")
        const userId = getQueryParam("userId", import.meta.env.DEV ? "display-dev" : "")

        return new SocketIOClientTransport({
            url,
            query: {
                sessionId,
                userId,
                clientType: ClientType.Display,
            },
            socketOptions: {
                transports: ["polling", "websocket"],
                upgrade: true,
                reconnectionAttempts: 10,
                reconnectionDelay: 1000,
                reconnectionDelayMax: 5000,
            },
        } as ConstructorParameters<typeof SocketIOClientTransport>[0])
    }, [serverUrl])

    return (
        <VGFProvider transport={transport} clientOptions={{ autoConnect: true }}>
            {children}
        </VGFProvider>
    )
}
