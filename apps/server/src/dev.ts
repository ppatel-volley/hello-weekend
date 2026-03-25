/**
 * Standalone development server for Hello Weekend.
 * Boots a WGFServer with in-memory storage and stub services.
 *
 * Usage: tsx watch src/dev.ts
 */
import express from "express"
import { createServer } from "node:http"
import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { createLogger } from "@volley/logger"
import { Server as SocketIOServer } from "socket.io"
import { WGFServer, MemoryStorage } from "@volley/vgf/server"
import { createGameRuleset } from "./ruleset"
import type { GameServices } from "./services"

// Load .env file from monorepo root (Node.js 22+ built-in)
const envPath = resolve(import.meta.dirname ?? ".", "../../..", ".env")
if (existsSync(envPath)) {
    process.loadEnvFile(envPath)
}

const logger = createLogger({
    type: "node",
    level: "info",
    name: "hello-weekend-dev",
})

const app = express()
// Allow cross-origin requests from Vite dev servers
app.use((_req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*")
    next()
})
const httpServer = createServer(app)

const storage = new MemoryStorage()

// Noop scheduler store for dev (no Redis needed)
const schedulerStore = {
    async load(_sessionId: string) {
        return null
    },
    async save(_sessionId: string, _runtime: unknown) {},
    async remove(_sessionId: string) {},
}

const io = new SocketIOServer(httpServer, {
    cors: {
        origin: true,
        methods: ["GET", "POST"],
        credentials: true,
    },
})

const services: GameServices = {
    serverState: new Map(),
}

const game = createGameRuleset(services)
const PORT = parseInt(process.env.PORT ?? "8090", 10)

const server = new WGFServer({
    port: PORT,
    httpServer,
    expressApp: app,
    socketIOServer: io,
    storage,
    logger,
    gameRuleset: game,
    schedulerStore,
})

// Health endpoint
app.get("/health", (_req, res) => {
    res.json({ status: "ok" })
})

// Dev-only: force-reset the dev session (used by E2E tests between scenarios)
app.post("/api/reset-session", (_req, res) => {
    if (storage.doesSessionExist(DEV_SESSION_ID)) {
        storage.deleteSessionById(DEV_SESSION_ID)
    }
    storage.createSession({
        sessionId: DEV_SESSION_ID,
        members: {},
        state: game.setup(),
    })
    logger.info({ sessionId: DEV_SESSION_ID }, "Dev session force-reset")
    res.json({ status: "ok", sessionId: DEV_SESSION_ID })
})

server.start()

// Pre-create a dev session so clients can connect with ?sessionId=dev-test
const DEV_SESSION_ID = "dev-test"

function ensureDevSession() {
    if (!storage.doesSessionExist(DEV_SESSION_ID)) {
        storage.createSession({
            sessionId: DEV_SESSION_ID,
            members: {},
            state: game.setup(),
        })
        logger.info({ sessionId: DEV_SESSION_ID }, "Dev session pre-created")
    }
}

ensureDevSession()

// VGF deletes sessions on client disconnect; re-create every 2s
setInterval(ensureDevSession, 2000)

logger.info(
    { port: PORT, url: `http://127.0.0.1:${PORT}` },
    "Hello Weekend dev server started",
)
