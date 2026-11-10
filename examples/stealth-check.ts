import { chromium } from "patchright";

const CDP_URL = process.env.CDP_URL ?? "http://127.0.0.1:9229";

const browser = await chromium.connectOverCDP(CDP_URL);
const context = browser.contexts()[0] ?? (await browser.newContext());
const page = context.pages()[0] ?? (await context.newPage());

const signals = await page.evaluate(() => {
  const nav = navigator as Navigator & {
    webdriver?: boolean;
    deviceMemory?: number;
    plugins: { length: number };
  };
  const win = globalThis as typeof globalThis & { chrome?: unknown };
  return {
    webdriver: nav.webdriver,
    languages: [...nav.languages],
    hardwareConcurrency: nav.hardwareConcurrency,
    deviceMemory: nav.deviceMemory,
    platform: nav.platform,
    plugins: nav.plugins.length,
    chromeRuntime: !!win.chrome,
    ua: nav.userAgent,
    headlessUa: /HeadlessChrome/i.test(nav.userAgent),
  };
});

console.log("local signals:");
console.log(JSON.stringify(signals, null, 2));

await page.goto("https://bot.sannysoft.com/", { waitUntil: "domcontentloaded" });
console.log(`opened: ${page.url()}`);
console.log("HITL:  open http://127.0.0.1:6080/vnc.html to inspect the report");

await new Promise(() => {});
