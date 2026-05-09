"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { resolveCredentials } from "@/lib/credentials";
import { db } from "@/lib/db";
import { enqueueGenerationJob } from "@/lib/queue";
import { getLLM } from "@/providers/registry";

const aspectSchema = z.enum(["16:9", "9:16", "1:1", "4:5"]);
const positionSchema = z.enum(["top", "center", "bottom"]);

const overlaySchema = z.object({
  text: z.string().min(1).max(500),
  position: positionSchema.default("bottom"),
  fontSize: z.coerce.number().int().min(16).max(160).optional(),
  color: z.string().max(20).optional(),
  fromSeconds: z.coerce.number().min(0).optional(),
  toSeconds: z.coerce.number().min(0).optional(),
});

const clipSchema = z.object({
  id: z.string().min(1),
  src: z.string().url(),
  kind: z.enum(["image", "video"]),
  durationSeconds: z.coerce.number().positive().max(60).optional(),
  overlays: z.array(overlaySchema).default([]),
});

const compositionSchema = z.object({
  aspect: aspectSchema,
  fps: z.coerce.number().int().min(15).max(60).default(30),
  clips: z.array(clipSchema).min(1).max(20),
  audio: z
    .object({
      src: z.string().url(),
      volume: z.coerce.number().min(0).max(1).optional(),
    })
    .optional(),
});

export type EditorCompositionInput = z.infer<typeof compositionSchema>;

export async function createEditorProject(input: {
  name: string;
  composition: EditorCompositionInput;
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");

  const composition = compositionSchema.parse(input.composition);

  const project = await db.project.create({
    data: {
      userId: session.user.id,
      name: input.name || "Untitled editor project",
    },
  });
  const generation = await db.generation.create({
    data: {
      userId: session.user.id,
      projectId: project.id,
      type: "EDIT_VIDEO",
      provider: "ffmpeg",
      model: "editor-v1",
      status: "PENDING",
      prompt: input.name,
      parameters: { composition } as unknown as Prisma.InputJsonValue,
    },
  });

  await enqueueGenerationJob({
    userId: session.user.id,
    type: "editor.render",
    generationId: generation.id,
    payload: {
      generationId: generation.id,
      provider: "ffmpeg",
      model: "editor-v1",
    },
  });

  revalidatePath("/editor");
  redirect(`/editor/${generation.id}`);
}

export async function listEditorProjects() {
  const session = await auth();
  if (!session?.user?.id) return [];
  return db.generation.findMany({
    where: { userId: session.user.id, type: "EDIT_VIDEO" },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      project: { select: { id: true, name: true } },
      assets: {
        select: { id: true, url: true, kind: true, mimeType: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
}

const aiTextSchema = z.object({
  description: z.string().min(1).max(2000),
  language: z.enum(["id", "en"]).default("en"),
  numClips: z.coerce.number().int().min(1).max(20),
  llmProvider: z.string().min(1),
  llmModel: z.string().min(1),
});

export async function aiSuggestTextOverlays(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");
  const parsed = aiTextSchema.parse(Object.fromEntries(formData.entries()));

  const llm = getLLM(parsed.llmProvider);
  const creds = await resolveCredentials(session.user.id, parsed.llmProvider);

  const lang = parsed.language === "id" ? "Indonesian (Bahasa Indonesia)" : "English";
  const system = `You write punchy on-screen text overlays for short-form video ads. Output ONLY a JSON array of strings of length ${parsed.numClips}, one overlay per clip. Each string is the overlay text in ${lang}, max 8 words, no markdown, no quotes around the array elements beyond JSON's.`;
  const user = `Topic / description: ${parsed.description}. Total clips: ${parsed.numClips}.`;
  const { text } = await llm.generate(
    {
      model: parsed.llmModel,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.8,
      maxTokens: 600,
    },
    creds,
  );
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  let arr: unknown;
  try {
    arr = JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\[[\s\S]*\]/);
    if (!m) throw new Error("LLM returned non-JSON content");
    arr = JSON.parse(m[0]);
  }
  if (!Array.isArray(arr)) throw new Error("LLM did not return a JSON array");
  return arr.slice(0, parsed.numClips).map((s) => String(s));
}
