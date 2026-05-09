/**
 * HMAC-signed OAuth state — survives across redirects without DB.
 *
 * Format: base64url(json) + '.' + base64url(hmac).
 * Payload includes userId, platform, nonce, codeVerifier (for PKCE flows),
 * and an expiry timestamp.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { env } from "@/lib/env";

export interface OAuthStatePayload {
  userId: string;
  platform: string;
  nonce: string;
  codeVerifier?: string;
  exp: number;
}

const TTL_SECONDS = 15 * 60;

function key(): Buffer {
  return Buffer.from(env.AUTH_SECRET, "utf8");
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function fromB64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

export function signOAuthState(opts: {
  userId: string;
  platform: string;
  codeVerifier?: string;
}): string {
  const payload: OAuthStatePayload = {
    userId: opts.userId,
    platform: opts.platform,
    nonce: randomBytes(16).toString("hex"),
    codeVerifier: opts.codeVerifier,
    exp: Math.floor(Date.now() / 1000) + TTL_SECONDS,
  };
  const json = Buffer.from(JSON.stringify(payload), "utf8");
  const sig = createHmac("sha256", key()).update(json).digest();
  return `${b64url(json)}.${b64url(sig)}`;
}

export function verifyOAuthState(state: string): OAuthStatePayload {
  const parts = state.split(".");
  if (parts.length !== 2) throw new Error("Invalid OAuth state");
  const [jsonB, sigB] = parts;
  const json = fromB64url(jsonB);
  const sig = fromB64url(sigB);
  const expected = createHmac("sha256", key()).update(json).digest();
  if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) {
    throw new Error("Invalid OAuth state signature");
  }
  const payload = JSON.parse(json.toString("utf8")) as OAuthStatePayload;
  if (payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("OAuth state expired");
  }
  return payload;
}
