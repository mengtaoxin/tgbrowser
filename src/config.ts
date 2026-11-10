import path from "node:path";
import { fileURLToPath } from "node:url";
import type { BrowserEngine } from "./types.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, "..");

export interface Config {
  host: string;
  port: number;
  apiKey: string;
  dataDir: string;
  profilesDir: string;
  statePath: string;
  browserImage: string;
  defaultTimeoutMinutes: number;
  maxTimeoutMinutes: number;
  engines: readonly BrowserEngine[];
}

const dataDir = process.env.TGBROWSER_DATA_DIR ?? path.join(ROOT, "data");

export const config: Config = {
  host: process.env.TGBROWSER_HOST ?? "127.0.0.1",
  port: Number(process.env.TGBROWSER_PORT ?? 7800),
  apiKey: process.env.TGBROWSER_API_KEY ?? "",
  dataDir,
  profilesDir: process.env.TGBROWSER_PROFILES_DIR ?? path.join(dataDir, "profiles"),
  statePath: process.env.TGBROWSER_STATE_PATH ?? path.join(dataDir, "state.json"),
  browserImage: process.env.TGBROWSER_BROWSER_IMAGE ?? "tgbrowser-browser",
  defaultTimeoutMinutes: Number(process.env.TGBROWSER_DEFAULT_TIMEOUT ?? 60),
  maxTimeoutMinutes: 240,
  engines: ["stock"],
};

export function publicBaseUrl(): string {
  return `http://${config.host}:${config.port}`;
}
