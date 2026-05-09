"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { enqueueGenerationJob } from "@/lib/queue";
import type { SmartCreationPayload } from "@/lib/smart-creation";

const TONES = ["casual", "professional", "playful", "luxury", "urgent"] as const;
const LANGS = ["id", "en"] as const;

const inputSchema = z.object({
  productUrl: z.string().url(),
  language: z.enum(LANGS).default("id"),
  tone: z.enum(TONES).default("casual"),
  numVariants: z.coerce.number().int().min(1).max(10).default(3),
  audience: z.string().optional(),
  hashtagStyle: z.string().optional(),
  customInstructions: z.string().optional(),
  llmProvider: z.string().min(1),
  llmModel: z.string().min(1),
  generateImages: z.coerce.boolean().default(false),
  imageProvider: z.string().optional(),
  imageModel: z.string().optional(),
  imageStyle: z.string().optional(),
  numImages: z.coerce.number().int().min(0).max(10).optional(),
});

export async function startSmartCreation(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");

  const raw = Object.fromEntries(formData.entries());
  const parsed = inputSchema.safeParse({
    ...raw,
    generateImages: raw.generateImages === "on" || raw.generateImages === "true",
  });
  if (!parsed.success) {
    throw new Error("Invalid input: " + parsed.error.errors.map((e) => e.message).join(", "));
  }
  const input = parsed.data;

  if (input.generateImages && (!input.imageProvider || !input.imageModel)) {
    throw new Error("Image provider and model are required when 'Generate images' is on");
  }

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
      type: "TEXT",
      status: "QUEUED",
      provider: input.llmProvider,
      model: input.llmModel,
      prompt: `Smart Creation: ${input.productUrl}`,
      parameters: {
        language: input.language,
        tone: input.tone,
        numVariants: input.numVariants,
        generateImages: input.generateImages,
        imageProvider: input.imageProvider ?? null,
        imageModel: input.imageModel ?? null,
        imageStyle: input.imageStyle ?? null,
      },
    },
  });

  const payload: SmartCreationPayload = {
    projectId: project.id,
    generationId: generation.id,
    productUrl: input.productUrl,
    language: input.language,
    tone: input.tone,
    numVariants: input.numVariants,
    audience: input.audience,
    hashtagStyle: input.hashtagStyle,
    customInstructions: input.customInstructions,
    llmProvider: input.llmProvider,
    llmModel: input.llmModel,
    generateImages: input.generateImages,
    imageProvider: input.imageProvider,
    imageModel: input.imageModel,
    imageStyle: input.imageStyle,
    numImages: input.numImages,
  };

  await enqueueGenerationJob({
    userId,
    type: "smart-creation.generate",
    generationId: generation.id,
    payload: payload as unknown as Record<string, unknown>,
  });

  revalidatePath("/smart-creation");
  redirect(`/smart-creation/${generation.id}`);
}

export async function listSmartCreations() {
  const session = await auth();
  if (!session?.user?.id) return [];
  return db.generation.findMany({
    where: {
      userId: session.user.id,
      type: "TEXT",
      project: { productUrl: { not: null } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      project: { select: { id: true, name: true, productUrl: true, productData: true } },
    },
  });
}
