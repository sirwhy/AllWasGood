/**
 * Authenticated symmetric encryption for credentials at rest.
 *
 * Uses AES-256-GCM with a 96-bit random IV per ciphertext. The encryption key
 * is derived from CREDENTIAL_ENCRYPTION_KEY env var (expected to be a base64
 * string decoding to >= 32 bytes; if shorter, we hash it with SHA-256 to get
 * 32 bytes).
 *
 * Output format (base64): IV(12) || TAG(16) || CIPHERTEXT
 */
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

import { env } from "@/lib/env";

const ALG = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

function getKey(): Buffer {
  const raw = env.CREDENTIAL_ENCRYPTION_KEY;
  let buf: Buffer;
  try {
    buf = Buffer.from(raw, "base64");
  } catch {
    buf = Buffer.from(raw, "utf8");
  }
  if (buf.length < 32) {
    // Hash whatever the user gave us to derive a stable 32-byte key.
    buf = createHash("sha256").update(raw).digest();
  } else if (buf.length > 32) {
    buf = buf.subarray(0, 32);
  }
  return buf;
}

const KEY = getKey();

export function encryptString(plaintext: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALG, KEY, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptString(payload: string): string {
  const buf = Buffer.from(payload, "base64");
  if (buf.length < IV_LEN + TAG_LEN) {
    throw new Error("Invalid ciphertext payload");
  }
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const enc = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALG, KEY, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString("utf8");
}

/**
 * Mask a secret for display purposes: show first 4 and last 4 chars.
 */
export function maskSecret(value: string): string {
  if (!value) return "";
  if (value.length <= 8) return "•".repeat(value.length);
  return `${value.slice(0, 4)}${"•".repeat(Math.max(4, value.length - 8))}${value.slice(-4)}`;
}
