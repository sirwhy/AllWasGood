/**
 * AI Editor orchestration: read a saved EditorComposition off the
 * Generation row, render to MP4 with FFmpeg, persist as a stored asset
 * and an Asset row attached to the Generation.
 */
import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import {
  renderEditorComposition,
  type EditorComposition,
} from "@/lib/editor-render";
import { putBytes } from "@/lib/storage";

export interface EditorRenderPayload {
  generationId: string;
}

export async function runEditorRender(payload: EditorRenderPayload) {
  const generation = await db.generation.findUnique({
    where: { id: payload.generationId },
  });
  if (!generation) throw new Error(`Generation ${payload.generationId} not found`);
  const params = generation.parameters as { composition?: EditorComposition } | null;
  if (!params?.composition) {
    throw new Error("Generation has no editor composition in parameters");
  }
  const composition = params.composition;

  const result = await renderEditorComposition(composition);
  const stored = await putBytes({
    userId: generation.userId,
    bytes: result.bytes,
    contentType: "video/mp4",
    prefix: "editor",
  });

  await db.asset.create({
    data: {
      userId: generation.userId,
      generationId: generation.id,
      kind: "VIDEO",
      url: stored.url,
      mimeType: "video/mp4",
      metadata: {
        source: "editor",
        role: "final",
        aspect: composition.aspect,
        clipCount: composition.clips.length,
      } as unknown as Prisma.InputJsonValue,
    },
  });

  await db.generation.update({
    where: { id: generation.id },
    data: {
      outputs: {
        kind: "editor",
        video: { url: stored.url, contentType: "video/mp4" },
        composition: composition as unknown as Prisma.InputJsonValue,
      } as unknown as Prisma.InputJsonValue,
    },
  });

  return { videoUrl: stored.url };
}
