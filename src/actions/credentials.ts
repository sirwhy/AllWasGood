"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  deleteCredential as svcDelete,
  saveCredential as svcSave,
} from "@/lib/credentials";
import { getProviderInfo, KNOWN_PROVIDER_IDS } from "@/providers/registry";

const Save = z.object({
  provider: z.string().refine((v) => KNOWN_PROVIDER_IDS.includes(v), { message: "Unknown provider" }),
  apiKey: z.string().min(1).max(500),
  label: z.string().max(80).optional(),
  baseUrl: z.string().url().optional().or(z.literal("")),
});

export async function saveCredentialAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHORIZED");
  const parsed = Save.parse({
    provider: formData.get("provider"),
    apiKey: formData.get("apiKey"),
    label: formData.get("label") || undefined,
    baseUrl: formData.get("baseUrl") || undefined,
  });
  const info = getProviderInfo(parsed.provider);
  if (!info) throw new Error("Unknown provider");
  await svcSave({
    userId: session.user.id,
    provider: parsed.provider,
    apiKey: parsed.apiKey.trim(),
    label: parsed.label?.trim() || undefined,
    baseUrl: parsed.baseUrl?.trim() || undefined,
  });
  revalidatePath("/settings");
}

export async function deleteCredentialAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHORIZED");
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await svcDelete(session.user.id, id);
  revalidatePath("/settings");
}

export async function listCredentialsForCurrentUser() {
  const session = await auth();
  if (!session?.user?.id) return [];
  return db.credential.findMany({
    where: { userId: session.user.id },
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
}
