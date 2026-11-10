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
  timeoutMinutes?: number;
}

function now(): number {
  return performance.now();
}

async function oneCycle(
  client: ApiClient,
  url: string,
  timeoutMinutes: number,
): Promise<LifecycleSample> {
  let stage = "create";
  const t0 = now();
  let createMs = 0;
  let connectMs = 0;
  let gotoMs = 0;
  let stopMs = 0;
  let browserId: string | null = null;
  let pw: Awaited<ReturnType<typeof chromium.connectOverCDP>> | null = null;

  try {
    const browser = (await client.request("POST", "/api/v1/browsers", {
      timeout: timeoutMinutes,
    })) as { id: string; cdpUrl: string };
    createMs = now() - t0;
    browserId = browser.id;

    stage = "connect";
    const tConnect = now();
    pw = await chromium.connectOverCDP(browser.cdpUrl);
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
    await client.request("PATCH", `/api/v1/browsers/${browser.id}`, { action: "stop" });
    stopMs = now() - tStop;
    browserId = null;

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
    if (browserId) {
      try {
        await client.request("PATCH", `/api/v1/browsers/${browserId}`, { action: "stop" });
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
  const timeoutMinutes = opts.timeoutMinutes ?? 5;

  for (let i = 0; i < warmup; i++) {
    await oneCycle(client, url, timeoutMinutes);
  }

  const samples: LifecycleSample[] = [];
  for (let i = 0; i < runs; i++) {
    samples.push(await oneCycle(client, url, timeoutMinutes));
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
