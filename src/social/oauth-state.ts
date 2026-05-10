/**
 * Encrypted OAuth state — survives across redirects without DB.
 *
 * Format: AES-256-GCM(JSON-payload) (via crypto.encryptString) re-encoded
 * as URL-safe base64. GCM's auth tag provides integrity, so the payload
 * is BOTH confidential and tamper-evident; this matters because the
 * payload includes the PKCE codeVerifier (RFC 7636 expects it to remain
 * server-side, never in URLs).
 *
 * Earlier revisions of this file used a base64-encoded plaintext payload
 * with a separate HMAC; that exposed the PKCE verifier in the redirect
 * URL. The verify path still accepts the old `payload.signature` shape
 * so already-issued auth flows in flight don't break, but new states
 * are always encrypted.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { decryptString, encryptString } from "@/lib/crypto";
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

function toUrlSafe(b64: string): string {
  return b64.replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function fromUrlSafe(s: string): string {
  // base64 decode tolerates missing padding in Node's Buffer.from
  return s.replace(/-/g, "+").replace(/_/g, "/");
}

function fromB64url(s: string): Buffer {
  return Buffer.from(fromUrlSafe(s), "base64");
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
  const ciphertext = encryptString(JSON.stringify(payload));
  // ciphertext is std base64; make it URL-safe and prefix with "v2." so
  // the verifier can distinguish it from any in-flight v1 (signed-only)
  // states without ambiguity.
  return `v2.${toUrlSafe(ciphertext)}`;
}

export function verifyOAuthState(state: string): OAuthStatePayload {
  if (state.startsWith("v2.")) {
    const ciphertext = fromUrlSafe(state.slice("v2.".length));
    const json = decryptString(ciphertext);
    const payload = JSON.parse(json) as OAuthStatePayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      throw new Error("OAuth state expired");
    }
    return payload;
  }

  // Legacy v1: base64url(json) + '.' + base64url(hmac). Accept briefly so
  // any in-flight authorize redirects from before the v2 deploy succeed.
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
