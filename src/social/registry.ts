import { LINKEDIN } from "./linkedin";
import { TWITTER } from "./twitter";
import { YOUTUBE } from "./youtube";
import { FACEBOOK, INSTAGRAM, THREADS, TIKTOK } from "./stubs";
import type { PlatformAdapter, PlatformId, PlatformInfo } from "./types";

const REGISTRY: Record<PlatformId, PlatformAdapter> = {
  TWITTER,
  LINKEDIN,
  YOUTUBE,
  TIKTOK,
  INSTAGRAM,
  FACEBOOK,
  THREADS,
};

export function listPlatforms(): PlatformInfo[] {
  return Object.values(REGISTRY).map((p) => p.info);
}

export function getPlatform(id: PlatformId): PlatformAdapter {
  const p = REGISTRY[id];
  if (!p) throw new Error(`Unknown platform: ${id}`);
  return p;
}
