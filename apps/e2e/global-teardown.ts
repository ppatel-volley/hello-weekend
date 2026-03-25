/**
 * Playwright global teardown — kills the dev processes started by global-setup.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PID_FILE = path.join(__dirname, ".e2e-pids.json");

function killProcess(pid: number): void {
  const isWindows = process.platform === "win32";
  if (isWindows) {
    spawn("taskkill", ["/F", "/T", "/PID", String(pid)], { stdio: "ignore", shell: true });
  } else {
    try {
      // Kill the process group (negative PID)
      process.kill(-pid, "SIGTERM");
    } catch {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        // already dead
      }
    }
  }
}

export default async function globalTeardown(): Promise<void> {
  try {
    if (!fs.existsSync(PID_FILE)) return;

    const pids: number[] = JSON.parse(fs.readFileSync(PID_FILE, "utf-8"));
    for (const pid of pids) {
      killProcess(pid);
    }

    fs.unlinkSync(PID_FILE);
  } catch (err) {
    console.warn("[global-teardown] Error cleaning up:", err);
  }
}
