import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.ts";
import { appError } from "../errors.ts";
import type { Profile } from "../types.ts";
import { ensureDir, pathExists, readJson, writeJson } from "./fs.ts";

export const PROFILE_ID_RE = /^[a-z0-9][a-z0-9_-]{1,63}$/;

function metaPath(id: string): string {
  return path.join(config.profilesDir, id, "profile.json");
}

export function profileDir(id: string): string {
  return path.join(config.profilesDir, id);
}

export async function initProfiles(): Promise<void> {
  await ensureDir(config.profilesDir);
}

export async function listProfiles(): Promise<Profile[]> {
  await initProfiles();
  const entries = await fs.readdir(config.profilesDir, { withFileTypes: true });
  const profiles: Profile[] = [];
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const profile = await getProfile(ent.name);
    if (profile) profiles.push(profile);
  }
  profiles.sort((a, b) => a.id.localeCompare(b.id));
  return profiles;
}

export async function getProfile(id: string): Promise<Profile | null> {
  const meta = await readJson<Profile | null>(metaPath(id), null);
  if (!meta) {
    if (await pathExists(profileDir(id))) {
      return {
        id,
        name: null,
        createdAt: null,
        lastUsedAt: null,
      };
    }
    return null;
  }
  return meta;
}

export async function createProfile({
  id,
  name = null,
}: {
  id: string;
  name?: string | null;
}): Promise<Profile> {
  if (!PROFILE_ID_RE.test(id)) {
    throw appError("Invalid profile id", 422, "invalid_profile_id");
  }
  const dir = profileDir(id);
  if (await pathExists(dir)) {
    throw appError("Profile already exists", 409, "profile_exists");
  }
  await ensureDir(dir);
  const profile: Profile = {
    id,
    name,
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
  };
  await writeJson(metaPath(id), profile);
  return profile;
}

export async function touchProfile(id: string): Promise<Profile | null> {
  const profile = await getProfile(id);
  if (!profile) return null;
  profile.lastUsedAt = new Date().toISOString();
  await writeJson(metaPath(id), profile);
  return profile;
}

export async function deleteProfile(id: string): Promise<void> {
  const dir = profileDir(id);
  if (!(await pathExists(dir))) {
    throw appError("Profile not found", 404, "profile_not_found");
  }
  await fs.rm(dir, { recursive: true, force: true });
}
