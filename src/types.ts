export type SessionStatus = "active" | "stopped";
export type BrowserEngine = "stock";
export type SessionFilter = "active" | "stopped";

export interface Profile {
  id: string;
  name: string | null;
  createdAt: string | null;
  lastUsedAt: string | null;
}

export interface SessionRecord {
  id: string;
  status: SessionStatus;
  profileId: string | null;
  engine: BrowserEngine;
  startedAt: string;
  timeoutAt: string | null;
  ttlMs: number;
  containerId: string | null;
  containerName: string | null;
  cdpPort: number | null;
  livePort: number | null;
  profilePath: string | null;
}

export interface PublicSession {
  id: string;
  status: SessionStatus;
  profileId: string | null;
  connect: string | null;
  stop: string | null;
  live: string | null;
  ttl: number;
  timeoutAt: string | null;
  startedAt: string;
  engine: BrowserEngine;
}

export interface CreateSessionBody {
  ttl: number;
  profileId?: string | null;
  browserScreenWidth?: number | null;
  browserScreenHeight?: number | null;
  engine?: BrowserEngine;
}

export interface CreateProfileBody {
  id: string;
  name?: string | null;
}

export interface SessionState {
  sessions: SessionRecord[];
}

export interface UpstreamBases {
  cdpBase: string;
  liveBase: string;
}
