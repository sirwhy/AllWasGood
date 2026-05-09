/**
 * Storage abstraction — supports S3-compatible providers and local disk.
 *
 * Local mode writes to ./storage/<userId>/<key>; the web server serves these
 * via a /api/files/[...path] route handler (see src/app/api/files).
 */
import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { env } from "@/lib/env";

export interface StoredAsset {
  url: string;
  key: string;
  contentType: string;
  bytes: number;
}

const LOCAL_ROOT = join(process.cwd(), "storage");

function publicUrlBase(): string {
  if (env.STORAGE_PROVIDER === "s3") {
    return env.S3_PUBLIC_URL?.replace(/\/+$/, "") ?? "";
  }
  return env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "") + "/api/files";
}

function pickExt(contentType: string): string {
  if (contentType.startsWith("image/png")) return ".png";
  if (contentType.startsWith("image/jpeg")) return ".jpg";
  if (contentType.startsWith("image/webp")) return ".webp";
  if (contentType.startsWith("video/mp4")) return ".mp4";
  if (contentType.startsWith("video/webm")) return ".webm";
  if (contentType.startsWith("audio/mpeg")) return ".mp3";
  if (contentType.startsWith("audio/wav")) return ".wav";
  if (contentType.startsWith("audio/ogg")) return ".ogg";
  return ".bin";
}

export async function putBytes(opts: {
  userId: string;
  bytes: Uint8Array | Buffer;
  contentType: string;
  prefix?: string;
}): Promise<StoredAsset> {
  const ext = pickExt(opts.contentType);
  const id = randomUUID();
  const key = `${opts.prefix ?? "generations"}/${opts.userId}/${id}${ext}`;

  if (env.STORAGE_PROVIDER === "s3") {
    return putBytesS3({ key, bytes: opts.bytes, contentType: opts.contentType });
  }
  return putBytesLocal({ key, bytes: opts.bytes, contentType: opts.contentType });
}

async function putBytesLocal(opts: {
  key: string;
  bytes: Uint8Array | Buffer;
  contentType: string;
}): Promise<StoredAsset> {
  const filePath = join(LOCAL_ROOT, opts.key);
  await mkdir(join(filePath, ".."), { recursive: true });
  await writeFile(filePath, opts.bytes);
  return {
    url: `${publicUrlBase()}/${opts.key}`,
    key: opts.key,
    contentType: opts.contentType,
    bytes: opts.bytes.length,
  };
}

async function putBytesS3(opts: {
  key: string;
  bytes: Uint8Array | Buffer;
  contentType: string;
}): Promise<StoredAsset> {
  if (!env.S3_BUCKET || !env.S3_ENDPOINT || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
    throw new Error("S3 storage selected but S3_* env vars are not fully configured.");
  }
  // Minimal SigV4 PUT — kept dependency-free to avoid pulling AWS SDK on the
  // hot path. For broader S3 features (multipart, presigning), add @aws-sdk/client-s3.
  const url = `${env.S3_ENDPOINT.replace(/\/+$/, "")}/${env.S3_BUCKET}/${encodeURI(opts.key)}`;
  const region = env.S3_REGION || "auto";
  const service = "s3";
  const date = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = date.slice(0, 8);
  const payloadHash = createHash("sha256").update(opts.bytes).digest("hex");
  const headers: Record<string, string> = {
    "Content-Type": opts.contentType,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": date,
  };
  const host = new URL(url).host;
  headers["host"] = host;
  const signedHeaders = Object.keys(headers)
    .map((h) => h.toLowerCase())
    .sort()
    .join(";");
  const canonicalHeaders =
    Object.keys(headers)
      .map((h) => h.toLowerCase())
      .sort()
      .map((h) => `${h}:${headers[Object.keys(headers).find((k) => k.toLowerCase() === h)!]}\n`)
      .join("") + "";
  const canonicalRequest =
    `PUT\n/${env.S3_BUCKET}/${encodeURI(opts.key)}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${date}\n${credentialScope}\n${createHash("sha256")
    .update(canonicalRequest)
    .digest("hex")}`;
  const { createHmac } = await import("node:crypto");
  const kDate = createHmac("sha256", "AWS4" + env.S3_SECRET_ACCESS_KEY!)
    .update(dateStamp)
    .digest();
  const kRegion = createHmac("sha256", kDate).update(region).digest();
  const kService = createHmac("sha256", kRegion).update(service).digest();
  const kSigning = createHmac("sha256", kService).update("aws4_request").digest();
  const signature = createHmac("sha256", kSigning).update(stringToSign).digest("hex");
  const auth = `AWS4-HMAC-SHA256 Credential=${env.S3_ACCESS_KEY_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const res = await fetch(url, {
    method: "PUT",
    headers: { ...headers, Authorization: auth },
    body: new Uint8Array(opts.bytes),
  });
  if (!res.ok) {
    throw new Error(`S3 PUT failed ${res.status}: ${(await res.text()).slice(0, 500)}`);
  }
  const publicUrl = env.S3_PUBLIC_URL
    ? `${env.S3_PUBLIC_URL.replace(/\/+$/, "")}/${opts.key}`
    : url;
  return {
    url: publicUrl,
    key: opts.key,
    contentType: opts.contentType,
    bytes: opts.bytes.length,
  };
}

/**
 * Fetch a remote URL and persist it to our storage layer. Useful for
 * "claiming" provider-generated outputs whose URLs may expire (e.g. Replicate
 * delivery URLs are valid for 24h).
 */
export async function persistRemoteUrl(opts: {
  userId: string;
  url: string;
  prefix?: string;
}): Promise<StoredAsset> {
  // Skip if it's already a data: URI we can't fetch — store the data: directly
  if (opts.url.startsWith("data:")) {
    const match = opts.url.match(/^data:([^;]+);base64,(.*)$/);
    if (!match) throw new Error("Invalid data URI");
    const bytes = Buffer.from(match[2], "base64");
    return putBytes({
      userId: opts.userId,
      bytes,
      contentType: match[1],
      prefix: opts.prefix,
    });
  }
  const res = await fetch(opts.url);
  if (!res.ok) throw new Error(`Failed to fetch remote asset: HTTP ${res.status}`);
  const contentType = res.headers.get("content-type") ?? "application/octet-stream";
  const buf = Buffer.from(await res.arrayBuffer());
  return putBytes({
    userId: opts.userId,
    bytes: buf,
    contentType,
    prefix: opts.prefix,
  });
}
