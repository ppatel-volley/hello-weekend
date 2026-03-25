/**
 * Playwright global setup — starts the server, display, and controller dev processes.
 *
 * Stores child process PIDs in a temp file so global-teardown can kill them.
 */
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MONOREPO_ROOT = path.resolve(__dirname, "..", "..");
const PID_FILE = path.join(__dirname, ".e2e-pids.json");

const STARTUP_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 500;

interface ServerDef {
  name: string;
  filter: string;
  url: string;
}

const servers: ServerDef[] = [
  { name: "server", filter: "@hello-weekend/server", url: "http://127.0.0.1:8090/health" },
  { name: "display", filter: "@hello-weekend/display", url: "http://127.0.0.1:3000" },
  { name: "controller", filter: "@hello-weekend/controller", url: "http://127.0.0.1:5174" },
];

async function pollUntilReady(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status < 500) return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(`Timed out waiting for ${url} after ${timeoutMs}ms`);
}

function spawnDev(filter: string): ChildProcess {
  const isWindows = process.platform === "win32";
  const child = spawn("pnpm", ["--filter", filter, "dev"], {
    cwd: MONOREPO_ROOT,
    stdio: "pipe",
    shell: isWindows,
    detached: !isWindows,
  });

  // Log child stderr/stdout for debugging (prefix with name)
  child.stdout?.on("data", (chunk: Buffer) => {
    process.stdout.write(`[${filter}] ${chunk.toString()}`);
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    process.stderr.write(`[${filter}] ${chunk.toString()}`);
  });

  return child;
}

export default async function globalSetup(): Promise<void> {
  const children: ChildProcess[] = [];

  try {
    // Spawn all three dev processes
    for (const srv of servers) {
      const child = spawnDev(srv.filter);
      children.push(child);
    }

    // Wait for all to become healthy
    await Promise.all(
      servers.map((srv) => pollUntilReady(srv.url, STARTUP_TIMEOUT_MS)),
    );

    // Save PIDs so teardown can kill them
    const pids = children.map((c) => c.pid).filter((pid): pid is number => pid !== undefined);
    fs.writeFileSync(PID_FILE, JSON.stringify(pids), "utf-8");
  } catch (err) {
    // If startup fails, kill any children we spawned
    for (const child of children) {
      try {
        killProcess(child.pid);
      } catch {
        // ignore
      }
    }
    throw err;
  }
}

function killProcess(pid: number | undefined): void {
  if (pid === undefined) return;
  const isWindows = process.platform === "win32";
  if (isWindows) {
    spawn("taskkill", ["/F", "/T", "/PID", String(pid)], { stdio: "ignore", shell: true });
  } else {
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      process.kill(pid, "SIGTERM");
    }
  }
}
