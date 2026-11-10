import { chromium, type Page } from "patchright";
import type { ApiClient } from "./client.ts";
import { CORE_SITES, type BenchSite } from "./sites.ts";

export interface SignalSnapshot {
  webdriver: boolean | undefined;
  headlessUa: boolean;
  chromeRuntime: boolean;
  plugins: number;
}

export interface SiteResult {
  id: string;
  url: string;
  kind: BenchSite["kind"];
  ok: boolean;
  title: string | null;
  loadMs: number | null;
  blockedHint: boolean;
  signals?: SignalSnapshot;
  error: string | null;
}

export interface ReachabilityResult {
  browserId: string;
  sites: SiteResult[];
  passed: number;
  failed: number;
}

async function readSignals(page: Page): Promise<SignalSnapshot> {
  return page.evaluate(() => {
    const nav = navigator as Navigator & {
      webdriver?: boolean;
      plugins: { length: number };
    };
    const win = globalThis as typeof globalThis & { chrome?: unknown };
    return {
      webdriver: nav.webdriver,
      headlessUa: /HeadlessChrome/i.test(nav.userAgent),
      chromeRuntime: !!win.chrome,
      plugins: nav.plugins.length,
    };
  });
}

function looksBlocked(title: string, bodySnippet: string): boolean {
  const hay = `${title}\n${bodySnippet}`.toLowerCase();
  // Keep phrases specific — pages like bot.sannysoft.com mention "captcha" as a test label.
  return (
    hay.includes("attention required") ||
    hay.includes("just a moment") ||
    hay.includes("cf-browser-verification") ||
    hay.includes("sorry, you have been blocked") ||
    hay.includes("access denied")
  );
}

async function checkSite(page: Page, site: BenchSite): Promise<SiteResult> {
  const started = performance.now();
  try {
    await page.goto(site.url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    const loadMs = performance.now() - started;
    const title = await page.title();
    const bodySnippet = (
      await page.locator("body").innerText({ timeout: 5_000 }).catch(() => "")
    ).slice(0, 500);
    const blockedHint = looksBlocked(title, bodySnippet);

    let signals: SignalSnapshot | undefined;
    if (site.kind === "signal") {
      signals = await readSignals(page);
    }

    let ok = !blockedHint;
    if (site.titleIncludes) {
      ok = ok && title.toLowerCase().includes(site.titleIncludes.toLowerCase());
    }
    if (signals) {
      ok = ok && signals.webdriver !== true && !signals.headlessUa;
    }

    return {
      id: site.id,
      url: site.url,
      kind: site.kind,
      ok,
      title,
      loadMs,
      blockedHint,
      signals,
      error: ok ? null : blockedHint ? "blocked_hint" : "title_or_signal_mismatch",
    };
  } catch (err) {
    return {
      id: site.id,
      url: site.url,
      kind: site.kind,
      ok: false,
      title: null,
      loadMs: null,
      blockedHint: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function runReachability(
  client: ApiClient,
  sites: readonly BenchSite[] = CORE_SITES,
): Promise<ReachabilityResult> {
  const browser = (await client.request("POST", "/api/v1/browsers", {
    timeout: 10,
  })) as { id: string; cdpUrl: string };

  let pw: Awaited<ReturnType<typeof chromium.connectOverCDP>> | null = null;
  try {
    pw = await chromium.connectOverCDP(browser.cdpUrl);
    const context = pw.contexts()[0] ?? (await pw.newContext());
    const page = context.pages()[0] ?? (await context.newPage());

    const results: SiteResult[] = [];
    for (const site of sites) {
      results.push(await checkSite(page, site));
    }

    return {
      browserId: browser.id,
      sites: results,
      passed: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
    };
  } finally {
    if (pw) {
      try {
        await pw.close();
      } catch {
        // ignore
      }
    }
    await client.request("PATCH", `/api/v1/browsers/${browser.id}`, { action: "stop" }).catch(() => {});
  }
}
