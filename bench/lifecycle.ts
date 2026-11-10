import { chromium } from "patchright";
import type { ApiClient } from "./client.ts";
import { summarize, type Summary } from "../src/bench/stats.ts";

export interface LifecycleSample {
  createMs: number;
  connectMs: number;
  gotoMs: number;
  stopMs: number;
  totalMs: number;
  success: boolean;
  errorStage: string | null;
  errorMessage: string | null;
}

export interface LifecycleResult {
  url: string;
  runs: number;
  warmup: number;
  successCount: number;
  samples: LifecycleSample[];
  stages: {
    create: Summary;
    connect: Summary;
    goto: Summary;
    stop: Summary;
    total: Summary;
  };
}

export interface LifecycleOptions {
  runs?: number;
  warmup?: number;
  url?: string;
  ttlMs?: number;
}

function now(): number {
  return performance.now();
}

async function oneCycle(
  client: ApiClient,
  url: string,
  ttlMs: number,
): Promise<LifecycleSample> {
  let stage = "create";
  const t0 = now();
  let createMs = 0;
  let connectMs = 0;
  let gotoMs = 0;
  let stopMs = 0;
  let sessionId: string | null = null;
  let pw: Awaited<ReturnType<typeof chromium.connectOverCDP>> | null = null;

  try {
    const session = (await client.request("POST", "/session", {
      ttl: ttlMs,
    })) as { id: string; connect: string };
    createMs = now() - t0;
    sessionId = session.id;

    stage = "connect";
    const tConnect = now();
    pw = await chromium.connectOverCDP(session.connect);
    connectMs = now() - tConnect;
    const context = pw.contexts()[0] ?? (await pw.newContext());
    const page = context.pages()[0] ?? (await context.newPage());

    stage = "goto";
    const tGoto = now();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    gotoMs = now() - tGoto;

    await pw.close();
    pw = null;

    stage = "stop";
    const tStop = now();
    await client.request("DELETE", `/session/${session.id}`);
    stopMs = now() - tStop;
    sessionId = null;

    return {
      createMs,
      connectMs,
      gotoMs,
      stopMs,
      totalMs: createMs + connectMs + gotoMs + stopMs,
      success: true,
      errorStage: null,
      errorMessage: null,
    };
  } catch (err) {
    if (pw) {
      try {
        await pw.close();
      } catch {
        // ignore
      }
    }
    if (sessionId) {
      try {
        await client.request("DELETE", `/session/${sessionId}`);
      } catch {
        // ignore
      }
    }
    return {
      createMs,
      connectMs,
      gotoMs,
      stopMs,
      totalMs: now() - t0,
      success: false,
      errorStage: stage,
      errorMessage: err instanceof Error ? err.message : String(err),
    };
  }
}

function successful(samples: LifecycleSample[]): LifecycleSample[] {
  return samples.filter((s) => s.success);
}

export async function runLifecycle(
  client: ApiClient,
  opts: LifecycleOptions = {},
): Promise<LifecycleResult> {
  const runs = opts.runs ?? Number(process.env.BENCH_RUNS ?? 3);
  const warmup = opts.warmup ?? Number(process.env.BENCH_WARMUP ?? 1);
  const url = opts.url ?? process.env.BENCH_URL ?? "https://example.com/";
  const ttlMs = opts.ttlMs ?? 5 * 60_000;

  for (let i = 0; i < warmup; i++) {
    await oneCycle(client, url, ttlMs);
  }

  const samples: LifecycleSample[] = [];
  for (let i = 0; i < runs; i++) {
    samples.push(await oneCycle(client, url, ttlMs));
  }

  const ok = successful(samples);
  return {
    url,
    runs,
    warmup,
    successCount: ok.length,
    samples,
    stages: {
      create: summarize(ok.map((s) => s.createMs)),
      connect: summarize(ok.map((s) => s.connectMs)),
      goto: summarize(ok.map((s) => s.gotoMs)),
      stop: summarize(ok.map((s) => s.stopMs)),
      total: summarize(ok.map((s) => s.totalMs)),
    },
  };
}
