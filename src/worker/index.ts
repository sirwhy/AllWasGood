/**
 * BullMQ worker — long-running AI generation jobs.
 *
 * Run with: pnpm worker (uses tsx). In production this is a separate process
 * (Railway service) that connects to the same Redis the web tier uses.
 */
import "dotenv/config";

import { Worker, type Job } from "bullmq";
import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { resolveCredentials } from "@/lib/credentials";
import { env } from "@/lib/env";
import { createRedisConnection } from "@/lib/redis";
import { persistRemoteUrl } from "@/lib/storage";
import {
  getAvatar,
  getImage,
  getLLM,
  getSTT,
  getTTS,
  getVideo,
} from "@/providers/registry";
import { QUEUE_NAMES } from "@/lib/queue";
import type { GeneratedAsset } from "@/providers/types";
import { runSmartCreation, type SmartCreationPayload } from "@/lib/smart-creation";
import { runEditorRender, type EditorRenderPayload } from "@/lib/editor";

interface JobData {
  jobId: string;
  generationId?: string;
  userId: string;
  payload: Record<string, unknown>;
}

async function persistAssets(userId: string, assets: GeneratedAsset[]): Promise<GeneratedAsset[]> {
  const out: GeneratedAsset[] = [];
  for (const a of assets) {
    try {
      const stored = await persistRemoteUrl({ userId, url: a.url });
      out.push({ ...a, url: stored.url, mimeType: stored.contentType });
    } catch (err) {
      console.warn("[worker] persist asset failed, keeping original url:", err);
      out.push(a);
    }
  }
  return out;
}

async function runJob(job: Job<JobData>) {
  const { jobId, generationId, userId, payload } = job.data;
  console.log(`[worker] job ${jobId} type=${job.name} user=${userId}`);

  await db.job.update({
    where: { id: jobId },
    data: { status: "RUNNING", startedAt: new Date(), attempts: { increment: 1 } },
  });
  if (generationId) {
    await db.generation.update({
      where: { id: generationId },
      data: { status: "RUNNING" },
    });
  }

  type GenPayload = {
    provider: string;
    model: string;
    [k: string]: unknown;
  };
  const p = payload as GenPayload;

  // Smart Creation + AI Editor manage their own credentials, so we skip the
  // global resolveCredentials() call for those paths.
  const needsTopLevelCreds =
    job.name !== "smart-creation.generate" && job.name !== "editor.render";
  const creds = needsTopLevelCreds
    ? await resolveCredentials(userId, p.provider)
    : { apiKey: "", baseUrl: undefined };

  let assets: GeneratedAsset[] = [];
  let resultText: string | undefined;
  switch (job.name) {
    case "llm.generate": {
      const llm = getLLM(p.provider);
      const { text } = await llm.generate(
        {
          model: p.model,
          messages: (p.messages as { role: string; content: string }[]).map((m) => ({
            role: m.role as "system" | "user" | "assistant",
            content: m.content,
          })),
          temperature: p.temperature as number | undefined,
          maxTokens: p.maxTokens as number | undefined,
        },
        creds,
      );
      resultText = text;
      break;
    }
    case "image.generate": {
      const r = await getImage(p.provider).generate(
        {
          model: p.model,
          prompt: String(p.prompt),
          negativePrompt: p.negativePrompt as string | undefined,
          aspectRatio: p.aspectRatio as string | undefined,
          width: p.width as number | undefined,
          height: p.height as number | undefined,
          numImages: p.numImages as number | undefined,
          seed: p.seed as number | undefined,
          inputImageUrl: p.inputImageUrl as string | undefined,
        },
        creds,
      );
      assets = r.assets;
      break;
    }
    case "video.generate": {
      const r = await getVideo(p.provider).generate(
        {
          model: p.model,
          prompt: String(p.prompt),
          negativePrompt: p.negativePrompt as string | undefined,
          aspectRatio: p.aspectRatio as string | undefined,
          durationSeconds: p.durationSeconds as number | undefined,
          inputImageUrl: p.inputImageUrl as string | undefined,
          seed: p.seed as number | undefined,
        },
        creds,
      );
      assets = r.assets;
      break;
    }
    case "avatar.generate": {
      const r = await getAvatar(p.provider).generate(
        {
          model: p.model,
          text: String(p.text),
          avatarId: p.avatarId as string | undefined,
          avatarPhotoUrl: p.avatarPhotoUrl as string | undefined,
          voiceId: p.voiceId as string | undefined,
          aspectRatio: p.aspectRatio as string | undefined,
          language: p.language as string | undefined,
        },
        creds,
      );
      assets = r.assets;
      break;
    }
    case "tts.generate": {
      const r = await getTTS(p.provider).generate(
        {
          model: p.model,
          text: String(p.text),
          voiceId: p.voiceId as string | undefined,
          language: p.language as string | undefined,
          speed: p.speed as number | undefined,
        },
        creds,
      );
      assets = r.assets;
      break;
    }
    case "stt.transcribe": {
      const r = await getSTT(p.provider).transcribe(
        {
          model: p.model,
          audioUrl: String(p.audioUrl),
          language: p.language as string | undefined,
        },
        creds,
      );
      resultText = r.text;
      break;
    }
    case "smart-creation.generate": {
      const result = await runSmartCreation(payload as unknown as SmartCreationPayload);
      const summary = result.variants
        .map((v, i) => `Variant ${i + 1}: ${v.hook}\n${v.caption}`)
        .join("\n\n");
      resultText = summary;
      const generationId = (payload as unknown as SmartCreationPayload).generationId;
      await db.generation.update({
        where: { id: generationId },
        data: {
          outputs: {
            kind: "smart-creation",
            product: result.product as unknown as Prisma.InputJsonValue,
            variants: result.variants as unknown as Prisma.InputJsonValue,
            imagePrompts: result.imagePrompts,
            images: result.images as unknown as Prisma.InputJsonValue,
          } as unknown as Prisma.InputJsonValue,
        },
      });
      // We already wrote outputs above; tell the post-job code to skip its own
      // outputs/asset write by clearing assets.
      assets = [];
      await db.job.update({
        where: { id: jobId },
        data: {
          status: "SUCCEEDED",
          result: {
            summary,
            variants: result.variants.length,
            images: result.images.length,
          } as unknown as Prisma.InputJsonValue,
          completedAt: new Date(),
        },
      });
      await db.generation.update({
        where: { id: generationId },
        data: { status: "SUCCEEDED", completedAt: new Date() },
      });
      return;
    }
    case "editor.render": {
      const payload_ = payload as unknown as EditorRenderPayload;
      const result = await runEditorRender(payload_);
      assets = [];
      await db.job.update({
        where: { id: jobId },
        data: {
          status: "SUCCEEDED",
          result: { videoUrl: result.videoUrl } as unknown as Prisma.InputJsonValue,
          completedAt: new Date(),
        },
      });
      await db.generation.update({
        where: { id: payload_.generationId },
        data: { status: "SUCCEEDED", completedAt: new Date() },
      });
      return;
    }
    default:
      throw new Error(`Unknown job type: ${job.name}`);
  }

  const persisted = await persistAssets(userId, assets);
  for (const a of persisted) {
    await db.asset.create({
      data: {
        userId,
        generationId: generationId ?? null,
        kind: a.mimeType?.startsWith("video/")
          ? "VIDEO"
          : a.mimeType?.startsWith("audio/")
            ? "AUDIO"
            : a.mimeType?.startsWith("image/")
              ? "IMAGE"
              : "OTHER",
        url: a.url,
        mimeType: a.mimeType ?? null,
        width: a.width ?? null,
        height: a.height ?? null,
        durationMs: a.durationMs ?? null,
      },
    });
  }
  const outcome = {
    text: resultText,
    assets: persisted.map((a) => ({ ...a })),
  };
  if (generationId) {
    await db.generation.update({
      where: { id: generationId },
      data: {
        status: "SUCCEEDED",
        outputs: outcome as unknown as Prisma.InputJsonValue,
        completedAt: new Date(),
      },
    });
  }
  await db.job.update({
    where: { id: jobId },
    data: {
      status: "SUCCEEDED",
      result: outcome as unknown as Prisma.InputJsonValue,
      completedAt: new Date(),
    },
  });
}

async function main() {
  console.log(`[worker] starting (concurrency=${env.WORKER_CONCURRENCY})`);
  const worker = new Worker<JobData>(QUEUE_NAMES.generation, runJob, {
    connection: createRedisConnection(),
    concurrency: env.WORKER_CONCURRENCY,
  });
  worker.on("failed", async (job, err) => {
    console.error(`[worker] job ${job?.id} failed:`, err);
    if (job?.data?.jobId) {
      await db.job
        .update({
          where: { id: job.data.jobId },
          data: {
            status: "FAILED",
            errorMessage: String(err?.message ?? err),
            completedAt: new Date(),
          },
        })
        .catch(() => undefined);
      if (job.data.generationId) {
        await db.generation
          .update({
            where: { id: job.data.generationId },
            data: {
              status: "FAILED",
              errorMessage: String(err?.message ?? err),
              completedAt: new Date(),
            },
          })
          .catch(() => undefined);
      }
    }
  });
  worker.on("completed", (job) => {
    console.log(`[worker] job ${job.id} completed`);
  });
  process.on("SIGTERM", async () => {
    console.log("[worker] SIGTERM, draining...");
    await worker.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
