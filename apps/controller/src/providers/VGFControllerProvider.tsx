/**
 * VGF provider wrapper for the CONTROLLER client.
 *
 * Creates a Socket.IO transport connecting to the VGF server
 * and wraps children in VGFProvider for state sync and dispatch.
 *
 * Key patterns:
 * - useDeviceInfo().getDeviceId() for device identity (gotcha #38)
 * - Fallback to crypto.randomUUID() if Platform SDK unavailable
 * - query at top level, NOT inside socketOptions (gotcha #4)
 * - transports: ["polling", "websocket"] (gotcha #6)
 * - autoConnect in clientOptions (gotcha #39)
 */
import { useMemo, useRef, type ReactNode } from "react"
import { useDeviceInfo } from "@volley/platform-sdk/react"
import { VGFProvider, SocketIOClientTransport, ClientType } from "@volley/vgf/client"
import { getVolleyAccount } from "../utils/params"

interface VGFControllerProviderProps {
    children: ReactNode
    sessionId: string
    serverUrl?: string
}

export function VGFControllerProvider({ children, sessionId, serverUrl }: VGFControllerProviderProps) {
    const volleyAccount = getVolleyAccount()
    const fallbackIdRef = useRef(crypto.randomUUID())

    // Get device ID from Platform SDK; fall back to random UUID
    let deviceId: string | null = null
    try {
        const deviceInfo = useDeviceInfo()
        deviceId = deviceInfo.getDeviceId()
    } catch {
        // Platform SDK not available (PlatformProvider not in tree, etc.)
    }

    const userId = volleyAccount || deviceId || fallbackIdRef.current

    const transport = useMemo(() => {
        const url = serverUrl ?? (import.meta.env.DEV ? "http://127.0.0.1:8090" : window.location.origin)

        return new SocketIOClientTransport({
            url,
            query: {
                sessionId,
                userId,
                clientType: ClientType.Controller,
            },
            socketOptions: {
                transports: ["polling", "websocket"],
                upgrade: true,
            },
        } as ConstructorParameters<typeof SocketIOClientTransport>[0])
    }, [sessionId, serverUrl, userId])

    return (
        <VGFProvider transport={transport} clientOptions={{ autoConnect: true }}>
            {children}
        </VGFProvider>
    )
}
