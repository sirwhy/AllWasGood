"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { enqueueGenerationJob } from "@/lib/queue";
import type { LinkToVideoPayload } from "@/lib/link-to-video";

const LANGS = ["id", "en"] as const;
const ASPECTS = ["16:9", "9:16", "1:1"] as const;

const inputSchema = z.object({
  productUrl: z.string().url(),
  language: z.enum(LANGS).default("id"),
  aspectRatio: z.enum(ASPECTS).default("9:16"),
  durationSeconds: z.coerce.number().int().min(10).max(60).default(20),
  llmProvider: z.string().min(1),
  llmModel: z.string().min(1),
  imageProvider: z.string().min(1),
  imageModel: z.string().min(1),
  imageStyle: z.string().optional(),
  ttsProvider: z.string().min(1),
  ttsModel: z.string().min(1),
  ttsVoiceId: z.string().optional(),
  customInstructions: z.string().optional(),
});

export async function startLinkToVideo(formData: FormData) {
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
      name: input.productUrl.replace(/^https?:\/\//, "").slice(0, 80),
      productUrl: input.productUrl,
    },
  });

  const generation = await db.generation.create({
    data: {
      userId,
      projectId: project.id,
      type: "VIDEO",
      status: "QUEUED",
      provider: input.llmProvider,
      model: input.llmModel,
      prompt: `Link-to-Video: ${input.productUrl}`,
      parameters: {
        language: input.language,
        aspectRatio: input.aspectRatio,
        durationSeconds: input.durationSeconds,
        imageProvider: input.imageProvider,
        imageModel: input.imageModel,
        imageStyle: input.imageStyle ?? null,
        ttsProvider: input.ttsProvider,
        ttsModel: input.ttsModel,
        ttsVoiceId: input.ttsVoiceId ?? null,
      },
    },
  });

  const payload: LinkToVideoPayload = {
    projectId: project.id,
    generationId: generation.id,
    productUrl: input.productUrl,
    language: input.language,
    aspectRatio: input.aspectRatio,
    durationSeconds: input.durationSeconds,
    llmProvider: input.llmProvider,
    llmModel: input.llmModel,
    imageProvider: input.imageProvider,
    imageModel: input.imageModel,
    imageStyle: input.imageStyle,
    ttsProvider: input.ttsProvider,
    ttsModel: input.ttsModel,
    ttsVoiceId: input.ttsVoiceId,
    customInstructions: input.customInstructions,
  };

  await enqueueGenerationJob({
    userId,
    type: "link-to-video.generate",
    generationId: generation.id,
    payload: payload as unknown as Record<string, unknown>,
  });

  revalidatePath("/link-to-video");
  redirect(`/link-to-video/${generation.id}`);
}

export async function listLinkToVideos() {
  const session = await auth();
  if (!session?.user?.id) return [];
  return db.generation.findMany({
    where: {
      userId: session.user.id,
      type: "VIDEO",
      prompt: { startsWith: "Link-to-Video:" },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      project: { select: { id: true, name: true, productUrl: true, productData: true } },
      assets: { select: { id: true, url: true, kind: true, mimeType: true } },
    },
  });
}
