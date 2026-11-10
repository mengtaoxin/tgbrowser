import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { config } from "../config.ts";
import {
  createSessionRecord,
  getSession,
  toPublicSession,
  updateSession,
} from "./sessions.ts";

describe("sessions store", () => {
  let tmpDir = "";
  let prevDataDir = "";
  let prevStatePath = "";

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "tgbrowser-sessions-"));
    prevDataDir = config.dataDir;
    prevStatePath = config.statePath;
    config.dataDir = tmpDir;
    config.statePath = path.join(tmpDir, "state.json");
  });

  afterEach(async () => {
    config.dataDir = prevDataDir;
    config.statePath = prevStatePath;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("migrates legacy browsers state key into sessions", async () => {
    await fs.writeFile(
      config.statePath,
      JSON.stringify({
        browsers: [
          {
            id: "legacy-1",
            status: "stopped",
            profileId: null,
            engine: "stock",
            startedAt: "2026-01-01T00:00:00.000Z",
            timeoutAt: null,
            ttlMs: 60_000,
            containerId: null,
            containerName: null,
            cdpPort: null,
            livePort: null,
            profilePath: null,
          },
        ],
      }),
      "utf8",
    );
    const loaded = await getSession("legacy-1");
    assert.equal(loaded?.id, "legacy-1");
    assert.equal(loaded?.status, "stopped");
  });

  it("persists session records and maps Browserless-style public URLs", async () => {
    const session = await createSessionRecord({
      profileId: "device-a",
      ttlMs: 60_000,
      cdpPort: 9222,
      livePort: 6080,
      containerName: "tgbrowser-test",
    });
    const loaded = await getSession(session.id);
    assert.equal(loaded?.status, "active");
    assert.equal(loaded?.profileId, "device-a");
    assert.equal(loaded?.ttlMs, 60_000);

    const publicSession = toPublicSession(session, "http://127.0.0.1:7800", "secret");
    assert.equal(
      publicSession.connect,
      `http://127.0.0.1:7800/session/${session.id}/connect`,
    );
    assert.equal(
      publicSession.live,
      `http://127.0.0.1:7800/session/${session.id}/live/`,
    );
    assert.equal(
      publicSession.stop,
      `http://127.0.0.1:7800/session/${session.id}?token=secret`,
    );
    assert.equal(publicSession.ttl, 60_000);

    const stopped = await updateSession(session.id, {
      status: "stopped",
      cdpPort: null,
      livePort: null,
    });
    assert.equal(stopped?.status, "stopped");
    const stoppedPublic = toPublicSession(stopped!, "http://127.0.0.1:7800", "secret");
    assert.equal(stoppedPublic.connect, null);
    assert.equal(stoppedPublic.stop, null);
    assert.equal(stoppedPublic.live, null);
  });
});
