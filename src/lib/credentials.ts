/**
 * Credential service — manages encrypted, per-user provider API keys.
 *
 * Lookup order (first match wins):
 *   1. user.Credential where provider = X (latest, isDefault=true preferred)
 *   2. environment fallback (e.g. process.env.OPENAI_API_KEY)
 */
import type { ProviderCredentials } from "@/providers/types";
import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { decryptString, encryptString } from "@/lib/crypto";
import { env } from "@/lib/env";
import { getProviderInfo } from "@/providers/registry";

const ENV_FALLBACKS: Record<string, { apiKey?: string; baseUrl?: string }> = {
  openai: { apiKey: env.OPENAI_API_KEY, baseUrl: env.OPENAI_BASE_URL },
  "openai-compat": { apiKey: env.OPENAI_API_KEY, baseUrl: env.OPENAI_BASE_URL },
  anthropic: { apiKey: env.ANTHROPIC_API_KEY },
  google: { apiKey: env.GOOGLE_API_KEY },
  groq: { apiKey: env.GROQ_API_KEY },
  ollama: { apiKey: "ollama" },
  xiaomi: { apiKey: undefined },
  replicate: { apiKey: env.REPLICATE_API_TOKEN },
  fal: { apiKey: env.FAL_API_KEY },
  stability: { apiKey: env.STABILITY_API_KEY },
  elevenlabs: { apiKey: env.ELEVENLABS_API_KEY },
  heygen: { apiKey: env.HEYGEN_API_KEY },
  did: { apiKey: env.DID_API_KEY },
  deepgram: { apiKey: env.DEEPGRAM_API_KEY },
};

export async function resolveCredentials(
  userId: string,
  provider: string,
): Promise<ProviderCredentials> {
  if (!getProviderInfo(provider)) {
    throw new Error(`Unknown provider "${provider}"`);
  }
  const row = await db.credential.findFirst({
    where: { userId, provider },
    orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
  });
  if (row) {
    return {
      apiKey: decryptString(row.encryptedKey),
      baseUrl: row.baseUrl ?? undefined,
      metadata: (row.metadata as Record<string, unknown> | null) ?? undefined,
    };
  }
  const fallback = ENV_FALLBACKS[provider];
  if (fallback?.apiKey) {
    return { apiKey: fallback.apiKey, baseUrl: fallback.baseUrl };
  }
  throw new Error(
    `No API key configured for provider "${provider}". Add one in Settings → API Keys.`,
  );
}

export async function listUserCredentials(userId: string) {
  const rows = await db.credential.findMany({
    where: { userId },
    orderBy: [{ provider: "asc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      provider: true,
      label: true,
      baseUrl: true,
      isDefault: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return rows;
}

export interface SaveCredentialInput {
  userId: string;
  provider: string;
  apiKey: string;
  label?: string;
  baseUrl?: string;
  isDefault?: boolean;
  metadata?: Record<string, unknown>;
}

export async function saveCredential(input: SaveCredentialInput) {
  const info = getProviderInfo(input.provider);
  if (!info) throw new Error(`Unknown provider "${input.provider}"`);

  const encryptedKey = encryptString(input.apiKey);
  const label = input.label ?? null;

  const existing = await db.credential.findFirst({
    where: { userId: input.userId, provider: input.provider, label },
  });

  if (existing) {
    return db.credential.update({
      where: { id: existing.id },
      data: {
        encryptedKey,
        baseUrl: input.baseUrl ?? null,
        isDefault: input.isDefault ?? existing.isDefault,
        metadata: input.metadata
          ? (input.metadata as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });
  }
  return db.credential.create({
    data: {
      userId: input.userId,
      provider: input.provider,
      label,
      encryptedKey,
      baseUrl: input.baseUrl ?? null,
      isDefault: input.isDefault ?? true,
      metadata: input.metadata
        ? (input.metadata as Prisma.InputJsonValue)
        : Prisma.JsonNull,
    },
  });
}

export async function deleteCredential(userId: string, id: string) {
  await db.credential.deleteMany({ where: { id, userId } });
}
