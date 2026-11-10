import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { formatMs } from "../src/bench/stats.ts";
import { createApiClient, waitForApi } from "./client.ts";
import { runLifecycle, type LifecycleResult } from "./lifecycle.ts";
import { runReachability, type ReachabilityResult } from "./reachability.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS_DIR = path.join(ROOT, "bench-results");

type Suite = "lifecycle" | "reachability" | "all";

function parseSuite(argv: string[]): Suite {
  const arg = argv.find((a) => a === "lifecycle" || a === "reachability" || a === "all");
  return arg ?? "all";
}

function printLifecycle(result: LifecycleResult): void {
  const rate = result.runs === 0 ? 0 : (result.successCount / result.runs) * 100;
  console.log(`\n# lifecycle  url=${result.url}  runs=${result.runs} warmup=${result.warmup}`);
  console.log(`success: ${result.successCount}/${result.runs} (${rate.toFixed(0)}%)`);
  console.log("stage       count   mean   p50   p95   min   max");
  for (const [name, s] of Object.entries(result.stages)) {
    console.log(
      `${name.padEnd(11)} ${String(s.count).padStart(5)} ${formatMs(s.mean).padStart(6)} ${formatMs(s.p50).padStart(5)} ${formatMs(s.p95).padStart(5)} ${formatMs(s.min).padStart(5)} ${formatMs(s.max).padStart(5)}`,
    );
  }
  for (const sample of result.samples.filter((s) => !s.success)) {
    console.log(`fail @ ${sample.errorStage}: ${sample.errorMessage}`);
  }
}

function printReachability(result: ReachabilityResult): void {
  console.log(`\n# reachability  browser=${result.browserId}`);
  console.log(`passed: ${result.passed}/${result.sites.length}`);
  for (const site of result.sites) {
    const ms = site.loadMs == null ? "-" : `${Math.round(site.loadMs)}ms`;
    const mark = site.ok ? "ok" : "FAIL";
    const extra = site.signals
      ? ` webdriver=${String(site.signals.webdriver)} headlessUa=${site.signals.headlessUa}`
      : "";
    console.log(
      `  [${mark}] ${site.id.padEnd(10)} ${ms.padStart(7)}  ${site.title ?? site.error ?? ""}${extra}`,
    );
  }
}

async function writeResult(name: string, payload: unknown): Promise<string> {
  await fs.mkdir(RESULTS_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(RESULTS_DIR, `${name}-${stamp}.json`);
  await fs.writeFile(file, `${JSON.stringify(payload, null, 2)}\n`);
  return file;
}

const suite = parseSuite(process.argv.slice(2));
const client = createApiClient();
await waitForApi(client);
console.log(`API ready: ${client.baseUrl}`);

let exitCode = 0;

if (suite === "lifecycle" || suite === "all") {
  const lifecycle = await runLifecycle(client);
  printLifecycle(lifecycle);
  const file = await writeResult("lifecycle", lifecycle);
  console.log(`wrote ${file}`);
  if (lifecycle.successCount < lifecycle.runs) exitCode = 1;
}

if (suite === "reachability" || suite === "all") {
  const reachability = await runReachability(client);
  printReachability(reachability);
  const file = await writeResult("reachability", reachability);
  console.log(`wrote ${file}`);
  if (reachability.failed > 0) exitCode = 1;
}

process.exit(exitCode);
