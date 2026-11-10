import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { config } from "../config.ts";
import { appError } from "../errors.ts";

interface RunResult {
  stdout: string;
  stderr: string;
}

function run(cmd: string, args: string[], opts: Record<string, unknown> = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
      ...opts,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
      else {
        reject(appError(stderr || stdout || `${cmd} exited ${code}`, 500, "docker_error"));
      }
    });
  });
}

export function reservePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : null;
      srv.close((err) => {
        if (err) reject(err);
        else if (!port) reject(new Error("Failed to reserve port"));
        else resolve(port);
      });
    });
    srv.on("error", reject);
  });
}

export async function ensureBrowserImage(): Promise<void> {
  try {
    await run("docker", ["image", "inspect", config.browserImage]);
  } catch {
    throw appError(
      `Docker image "${config.browserImage}" not found. Run: docker compose build`,
      503,
      "image_missing",
    );
  }
}

export async function startBrowserContainer({
  name,
  profilePath,
  cdpPort,
  livePort,
}: {
  name: string;
  profilePath: string;
  cdpPort: number;
  livePort: number;
}): Promise<string> {
  await ensureBrowserImage();
  const args = [
    "run",
    "-d",
    "--rm",
    "--name",
    name,
    "--shm-size",
    "2g",
    "-p",
    `127.0.0.1:${cdpPort}:9222`,
    "-p",
    `127.0.0.1:${livePort}:6080`,
    "-v",
    `${profilePath}:/data/profile`,
    config.browserImage,
  ];
  const { stdout } = await run("docker", args);
  return stdout;
}

export async function stopBrowserContainer(nameOrId: string): Promise<void> {
  try {
    await run("docker", ["stop", "-t", "10", nameOrId]);
  } catch (err) {
    const msg = String(err instanceof Error ? err.message : err);
    if (msg.includes("No such container")) return;
    throw err;
  }
}

export async function waitForCdp(
  port: number,
  { timeoutMs = 30000 }: { timeoutMs?: number } = {},
): Promise<unknown> {
  const started = Date.now();
  let lastErr: unknown;
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return await res.json();
      lastErr = new Error(`CDP HTTP ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  const message = lastErr instanceof Error ? lastErr.message : "timeout";
  throw appError(`CDP not ready on :${port}: ${message}`, 503, "cdp_timeout");
}
