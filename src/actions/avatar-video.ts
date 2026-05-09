"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { enqueueGenerationJob } from "@/lib/queue";

const ASPECT_RATIOS = ["16:9", "9:16", "1:1"] as const;

const inputSchema = z
  .object({
    name: z.string().optional(),
    text: z.string().min(2).max(5000),
    language: z.string().optional(),
    provider: z.string().min(1),
    model: z.string().min(1),
    aspectRatio: z.enum(ASPECT_RATIOS).default("16:9"),
    avatarId: z.string().optional(),
    avatarPhotoUrl: z.string().url().optional(),
    voiceId: z.string().optional(),
  })
  .refine((d) => d.avatarId || d.avatarPhotoUrl, {
    message: "Either avatarId or avatarPhotoUrl is required",
    path: ["avatarId"],
  });

export async function startAvatarVideo(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");

  const raw = Object.fromEntries(formData.entries());
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error("Invalid input: " + parsed.error.errors.map((e) => e.message).join(", "));
  }
  const input = parsed.data;
  const userId = session.user.id;

  const project = await db.project.create({
    data: {
      userId,
      name: input.name?.trim() || `Avatar — ${input.text.slice(0, 50)}`,
    },
  });

  const generation = await db.generation.create({
    data: {
      userId,
      projectId: project.id,
      type: "AVATAR_VIDEO",
      status: "QUEUED",
      provider: input.provider,
      model: input.model,
      prompt: input.text,
      parameters: {
        language: input.language ?? null,
        aspectRatio: input.aspectRatio,
        avatarId: input.avatarId ?? null,
        avatarPhotoUrl: input.avatarPhotoUrl ?? null,
        voiceId: input.voiceId ?? null,
      },
    },
  });

  await enqueueGenerationJob({
    userId,
    type: "avatar.generate",
    generationId: generation.id,
    payload: {
      provider: input.provider,
      model: input.model,
      text: input.text,
      avatarId: input.avatarId,
      avatarPhotoUrl: input.avatarPhotoUrl,
      voiceId: input.voiceId,
      aspectRatio: input.aspectRatio,
      language: input.language,
    },
  });

  revalidatePath("/avatars");
  redirect(`/avatars/${generation.id}`);
}

export async function listAvatarVideos() {
  const session = await auth();
  if (!session?.user?.id) return [];
  return db.generation.findMany({
    where: { userId: session.user.id, type: "AVATAR_VIDEO" },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      project: { select: { id: true, name: true } },
      assets: { select: { id: true, url: true, kind: true, mimeType: true } },
    },
  });
}
