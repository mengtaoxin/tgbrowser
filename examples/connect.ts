import { chromium } from "patchright";

const CDP_URL = process.env.CDP_URL ?? "http://127.0.0.1:9229";

// Patchright is a drop-in Playwright replacement with CDP leak patches.
// Do not set custom userAgent / extraHTTPHeaders — that hurts stealth.
const browser = await chromium.connectOverCDP(CDP_URL);
const context = browser.contexts()[0] ?? (await browser.newContext());
const page = context.pages()[0] ?? (await context.newPage());

await page.goto("https://example.com");
console.log(`title: ${await page.title()}`);
console.log(`url:   ${page.url()}`);
console.log(`HITL:  open http://127.0.0.1:6080/vnc.html`);

// Keep the CDP session open so you can intervene via noVNC.
await new Promise(() => {});
