export type BrowserStatus = "active" | "stopped";
export type BrowserEngine = "stock";
export type BrowserFilter = "active" | "stopped";

export interface Profile {
  id: string;
  name: string | null;
  createdAt: string | null;
  lastUsedAt: string | null;
}

export interface BrowserRecord {
  id: string;
  status: BrowserStatus;
  profileId: string | null;
  engine: BrowserEngine;
  startedAt: string;
  timeoutAt: string | null;
  containerId: string | null;
  containerName: string | null;
  cdpPort: number | null;
  livePort: number | null;
  profilePath: string | null;
}

export interface PublicBrowser {
  id: string;
  status: BrowserStatus;
  profileId: string | null;
  cdpUrl: string | null;
  liveUrl: string | null;
  timeoutAt: string | null;
  startedAt: string;
  engine: BrowserEngine;
}

export interface CreateBrowserBody {
  profileId?: string | null;
  timeout?: number;
  browserScreenWidth?: number | null;
  browserScreenHeight?: number | null;
  engine?: BrowserEngine;
}

export interface CreateProfileBody {
  id: string;
  name?: string | null;
}

export interface BrowserState {
  browsers: BrowserRecord[];
}

export interface UpstreamBases {
  cdpBase: string;
  liveBase: string;
}
