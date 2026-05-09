/**
 * Link-to-Video orchestration: product URL -> LLM-written storyboard ->
 * per-scene image + TTS -> ffmpeg-rendered MP4. Runs in the BullMQ worker.
 */
import { Prisma } from "@prisma/client";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolveCredentials } from "@/lib/credentials";
import { db } from "@/lib/db";
import { aspectToDimensions, renderScenesToMp4 } from "@/lib/ffmpeg";
import { scrapeProductUrl, type ScrapedProduct } from "@/lib/scraper";
import { persistRemoteUrl, putBytes, type StoredAsset } from "@/lib/storage";
import { getImage, getLLM, getTTS } from "@/providers/registry";
import type { GeneratedAsset } from "@/providers/types";

export type LinkToVideoLanguage = "id" | "en";
export type LinkToVideoAspect = "16:9" | "9:16" | "1:1";

export interface LinkToVideoPayload {
  projectId: string;
  generationId: string;
  productUrl: string;
  language: LinkToVideoLanguage;
  aspectRatio: LinkToVideoAspect;
  durationSeconds: number;
  llmProvider: string;
  llmModel: string;
  imageProvider: string;
  imageModel: string;
  imageStyle?: string;
  ttsProvider: string;
  ttsModel: string;
  ttsVoiceId?: string;
  customInstructions?: string;
}

export interface Scene {
  id: string;
  narration: string;
  image_prompt: string;
  duration_seconds: number;
}

export interface Storyboard {
  title: string;
  hook: string;
  scenes: Scene[];
  cta: string;
}

export interface LinkToVideoResult {
  product: ScrapedProduct;
  storyboard: Storyboard;
  sceneImages: GeneratedAsset[];
  sceneAudios: GeneratedAsset[];
  video: StoredAsset;
}

const STORYBOARD_SYSTEM_PROMPT = `You are a video storyboarder for short-form social ads (TikTok / Reels / Shorts).
Given a product, you write a tight storyboard that fits the requested total duration.

Output ONE JSON object with this exact shape:

{
  "title": string,            // 1-line video title
  "hook": string,              // first-second hook (also used as scene 1 narration)
  "scenes": [                  // 3-6 scenes, total narration duration ~ requested seconds
    {
      "id": "s1",
      "narration": string,     // exact words to be spoken (in the requested language)
      "image_prompt": string,  // English visual prompt for an image generator
      "duration_seconds": number  // 2-6 seconds, integer
    }
  ],
  "cta": string                 // one-line call-to-action (also the last scene narration)
}

Rules:
- Output ONLY the JSON. No markdown fences, no commentary.
- Narration MUST be in the requested language; image_prompt MUST be in English.
- Scenes MUST sum to roughly the requested duration (within +/- 4 seconds).
- 'narration' must be naturally readable aloud (no bullet lists, no markdown).`;

function buildStoryboardUserPrompt(input: LinkToVideoPayload, product: ScrapedProduct) {
  const lang = input.language === "id" ? "Indonesian (Bahasa Indonesia)" : "English";
  const lines: string[] = [];
  lines.push(`Total target duration: ~${input.durationSeconds} seconds.`);
  lines.push(`Narration language: ${lang}.`);
  lines.push(`Aspect ratio: ${input.aspectRatio}.`);
  if (input.imageStyle) lines.push(`Image style: ${input.imageStyle}.`);
  if (input.customInstructions) lines.push(`Extra: ${input.customInstructions}.`);
  lines.push("\n--- PRODUCT ---");
  lines.push(`Title: ${product.title}`);
  if (product.brand) lines.push(`Brand: ${product.brand}`);
  if (product.price) lines.push(`Price: ${product.currency ?? ""} ${product.price}`.trim());
  lines.push(`URL: ${product.url}`);
  lines.push(`Description: ${product.description.slice(0, 1500)}`);
  if (product.features.length) {
    lines.push("Features:");
    for (const f of product.features.slice(0, 10)) lines.push(`  - ${f}`);
  }
  return lines.join("\n");
}

function safeParseJson(text: string): unknown {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        /* fall through */
      }
    }
    throw new Error("LLM returned non-JSON content for link-to-video storyboard");
  }
}

interface RawStoryboard {
  title?: string;
  hook?: string;
  cta?: string;
  scenes?: { id?: string; narration?: string; image_prompt?: string; duration_seconds?: number }[];
}

function normalizeStoryboard(raw: RawStoryboard): Storyboard {
  const scenes: Scene[] = (raw.scenes ?? []).map((s, i) => ({
    id: s.id || `s${i + 1}`,
    narration: (s.narration ?? "").trim(),
    image_prompt: (s.image_prompt ?? "").trim(),
    duration_seconds: clamp(Math.round(s.duration_seconds ?? 4), 2, 8),
  }));
  if (!scenes.length) throw new Error("Storyboard has no scenes");
  return {
    title: (raw.title ?? "").trim() || "Marketing video",
    hook: (raw.hook ?? "").trim(),
    scenes,
    cta: (raw.cta ?? "").trim(),
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

async function downloadToFile(url: string, filePath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download ${url} failed: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(filePath, buf);
}

export async function runLinkToVideo(payload: LinkToVideoPayload): Promise<LinkToVideoResult> {
  const project = await db.project.findUnique({ where: { id: payload.projectId } });
  if (!project) throw new Error(`Project ${payload.projectId} not found`);
  const userId = project.userId;

  // 1) scrape
  const product = await scrapeProductUrl(payload.productUrl);
  await db.project.update({
    where: { id: project.id },
    data: { productData: product as unknown as Prisma.InputJsonValue },
  });

  // 2) LLM storyboard
  const llm = getLLM(payload.llmProvider);
  const llmCreds = await resolveCredentials(userId, payload.llmProvider);
  const { text } = await llm.generate(
    {
      model: payload.llmModel,
      messages: [
        { role: "system", content: STORYBOARD_SYSTEM_PROMPT },
        { role: "user", content: buildStoryboardUserPrompt(payload, product) },
      ],
      temperature: 0.7,
      maxTokens: 1800,
    },
    llmCreds,
  );
  const storyboard = normalizeStoryboard(safeParseJson(text) as RawStoryboard);

  // 3) per-scene image + TTS in parallel
  const imageProvider = getImage(payload.imageProvider);
  const imageCreds = await resolveCredentials(userId, payload.imageProvider);
  const ttsProvider = getTTS(payload.ttsProvider);
  const ttsCreds = await resolveCredentials(userId, payload.ttsProvider);

  const aspectForImage =
    payload.aspectRatio === "9:16" ? "9:16" : payload.aspectRatio === "1:1" ? "1:1" : "16:9";

  const imagePromises = storyboard.scenes.map(async (scene): Promise<GeneratedAsset> => {
    const r = await imageProvider.generate(
      {
        model: payload.imageModel,
        prompt: payload.imageStyle
          ? `${scene.image_prompt}. Style: ${payload.imageStyle}`
          : scene.image_prompt,
        aspectRatio: aspectForImage,
        numImages: 1,
      },
      imageCreds,
    );
    if (!r.assets.length) throw new Error(`Image gen returned no assets for scene ${scene.id}`);
    return r.assets[0];
  });
  const ttsPromises = storyboard.scenes.map(async (scene): Promise<GeneratedAsset> => {
    const r = await ttsProvider.generate(
      {
        model: payload.ttsModel,
        text: scene.narration,
        voiceId: payload.ttsVoiceId,
        language: payload.language,
        format: "mp3",
      },
      ttsCreds,
    );
    if (!r.assets.length) throw new Error(`TTS returned no assets for scene ${scene.id}`);
    return r.assets[0];
  });

  const [sceneImages, sceneAudios] = await Promise.all([
    Promise.all(imagePromises),
    Promise.all(ttsPromises),
  ]);

  // persist images + audios up-front so they survive provider URL expiry
  const persistedImages = await Promise.all(
    sceneImages.map(async (a) => {
      try {
        const stored = await persistRemoteUrl({ userId, url: a.url, prefix: "link-to-video" });
        return { ...a, url: stored.url, mimeType: stored.contentType };
      } catch {
        return a;
      }
    }),
  );
  const persistedAudios = await Promise.all(
    sceneAudios.map(async (a) => {
      try {
        const stored = await persistRemoteUrl({ userId, url: a.url, prefix: "link-to-video" });
        return { ...a, url: stored.url, mimeType: stored.contentType };
      } catch {
        return a;
      }
    }),
  );

  // 4) ffmpeg render
  const tmpRoot = await mkdtemp(join(tmpdir(), "awg-l2v-render-"));
  let video: StoredAsset;
  try {
    const sceneInputs = await Promise.all(
      storyboard.scenes.map(async (scene, i) => {
        const imgUrl = persistedImages[i].url;
        const audUrl = persistedAudios[i].url;
        const imgExt = imgUrl.match(/\.(png|jpe?g|webp|gif|avif|bmp|tiff?)(?:\?|#|$)/i)?.[1]?.toLowerCase() || "jpg";
        const imgPath = join(tmpRoot, `img-${i}.${imgExt}`);
        const audPath = join(tmpRoot, `aud-${i}.mp3`);
        await downloadToFile(imgUrl, imgPath);
        await downloadToFile(audUrl, audPath);
        return { imagePath: imgPath, audioPath: audPath };
      }),
    );
    const dim = aspectToDimensions(payload.aspectRatio);
    const outPath = join(tmpRoot, "final.mp4");
    await renderScenesToMp4({
      scenes: sceneInputs,
      width: dim.width,
      height: dim.height,
      fps: 30,
      outputPath: outPath,
    });

    const { readFile } = await import("node:fs/promises");
    const bytes = await readFile(outPath);
    video = await putBytes({
      userId,
      bytes,
      contentType: "video/mp4",
      prefix: "link-to-video",
    });
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }

  // record asset rows for images, audios, and the final video
  for (const img of persistedImages) {
    await db.asset.create({
      data: {
        userId,
        generationId: payload.generationId,
        kind: "IMAGE",
        url: img.url,
        mimeType: img.mimeType ?? null,
        width: img.width ?? null,
        height: img.height ?? null,
        metadata: { source: "link-to-video", role: "scene-image" } as unknown as Prisma.InputJsonValue,
      },
    });
  }
  for (const aud of persistedAudios) {
    await db.asset.create({
      data: {
        userId,
        generationId: payload.generationId,
        kind: "AUDIO",
        url: aud.url,
        mimeType: aud.mimeType ?? "audio/mpeg",
        durationMs: aud.durationMs ?? null,
        metadata: { source: "link-to-video", role: "scene-audio" } as unknown as Prisma.InputJsonValue,
      },
    });
  }
  await db.asset.create({
    data: {
      userId,
      generationId: payload.generationId,
      kind: "VIDEO",
      url: video.url,
      mimeType: video.contentType,
      metadata: { source: "link-to-video", role: "final" } as unknown as Prisma.InputJsonValue,
    },
  });

  return {
    product,
    storyboard,
    sceneImages: persistedImages,
    sceneAudios: persistedAudios,
    video,
  };
}
