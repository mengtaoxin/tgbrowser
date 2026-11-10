import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { config } from "../config.ts";
import { isAppError } from "../errors.ts";
import {
  PROFILE_ID_RE,
  createProfile,
  deleteProfile,
  getProfile,
  listProfiles,
} from "./profiles.ts";

describe("profiles", () => {
  let tmpDir = "";
  let prevProfilesDir = "";

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "tgbrowser-profiles-"));
    prevProfilesDir = config.profilesDir;
    config.profilesDir = tmpDir;
  });

  afterEach(async () => {
    config.profilesDir = prevProfilesDir;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("validates profile ids", () => {
    assert.equal(PROFILE_ID_RE.test("device-a"), true);
    assert.equal(PROFILE_ID_RE.test("A"), false);
    assert.equal(PROFILE_ID_RE.test("-bad"), false);
  });

  it("creates, lists, and deletes profiles", async () => {
    const created = await createProfile({ id: "device-a", name: "Device A" });
    assert.equal(created.id, "device-a");
    assert.equal(created.name, "Device A");
    assert.ok(created.createdAt);

    const listed = await listProfiles();
    assert.equal(listed.length, 1);
    assert.equal((await getProfile("device-a"))?.id, "device-a");

    await deleteProfile("device-a");
    assert.equal(await getProfile("device-a"), null);
  });

  it("rejects invalid and duplicate ids", async () => {
    await assert.rejects(
      () => createProfile({ id: "BAD" }),
      (err: unknown) => isAppError(err) && err.code === "invalid_profile_id" && err.status === 422,
    );

    await createProfile({ id: "device-b" });
    await assert.rejects(
      () => createProfile({ id: "device-b" }),
      (err: unknown) => isAppError(err) && err.code === "profile_exists" && err.status === 409,
    );
  });
});
