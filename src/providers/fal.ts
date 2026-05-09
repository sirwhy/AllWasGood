/**
 * fal.ai — fast image and video models with a queue API.
 * Submit a job, poll for status, fetch result.
 */
import type {
  GeneratedAsset,
  ImageGenerateInput,
  ImageGenerateOutput,
  ImageProvider,
  ProviderCredentials,
  ProviderInfo,
  VideoGenerateInput,
  VideoGenerateOutput,
  VideoProvider,
} from "./types";
import { httpJson, pollUntil } from "./_http";

export const FAL_INFO: ProviderInfo = {
  id: "fal",
  label: "fal.ai",
  website: "https://fal.ai",
  capabilities: ["image", "video"],
  apiKeyHelpUrl: "https://fal.ai/dashboard/keys",
  apiKeyPlaceholder: "fal_...",
  models: [
    { id: "fal-ai/flux/dev", label: "FLUX [dev]", capability: "image" },
    { id: "fal-ai/flux-pro/v1.1", label: "FLUX 1.1 Pro", capability: "image" },
    { id: "fal-ai/recraft-v3", label: "Recraft v3", capability: "image" },
    { id: "fal-ai/ideogram/v2", label: "Ideogram v2", capability: "image" },
    { id: "fal-ai/stable-diffusion-v35-large", label: "SD 3.5 Large", capability: "image" },
    { id: "fal-ai/kling-video/v1.6/standard/text-to-video", label: "Kling 1.6 Standard", capability: "video" },
    { id: "fal-ai/luma-dream-machine", label: "Luma Dream Machine", capability: "video" },
    { id: "fal-ai/minimax-video", label: "MiniMax Hailuo Video", capability: "video" },
    { id: "fal-ai/runway-gen3/turbo/image-to-video", label: "Runway Gen-3 Turbo I2V", capability: "video" },
  ],
};

interface FalQueueResp {
  request_id: string;
  status?: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
  status_url?: string;
  response_url?: string;
}

async function submitFal(model: string, input: Record<string, unknown>, apiKey: string, signal?: AbortSignal) {
  return httpJson<FalQueueResp>(`https://queue.fal.run/${model}`, {
    method: "POST",
    headers: { Authorization: `Key ${apiKey}` },
    body: input,
    signal,
  });
}

async function awaitFal(model: string, queue: FalQueueResp, apiKey: string, signal?: AbortSignal) {
  const statusUrl = queue.status_url ?? `https://queue.fal.run/${model}/requests/${queue.request_id}/status`;
  const responseUrl = queue.response_url ?? `https://queue.fal.run/${model}/requests/${queue.request_id}`;
  await pollUntil(
    async () => {
      const s = await httpJson<{ status: string; logs?: unknown }>(statusUrl, {
        headers: { Authorization: `Key ${apiKey}` },
        signal,
      });
      if (s.status === "COMPLETED") return { done: true, value: s };
      if (s.status === "FAILED") return { done: true, error: "fal job failed" };
      return { done: false };
    },
    { intervalMs: 2000, timeoutMs: 600_000, signal },
  );
  return httpJson<Record<string, unknown>>(responseUrl, {
    headers: { Authorization: `Key ${apiKey}` },
    signal,
  });
}

function toAssets(out: unknown, mime: string): GeneratedAsset[] {
  if (!out || typeof out !== "object") return [];
  const o = out as Record<string, unknown>;
  if (Array.isArray(o.images)) {
    return o.images
      .map((i) => (typeof i === "object" && i && (i as Record<string, unknown>).url) as string | undefined)
      .filter((u): u is string => typeof u === "string")
      .map((url) => ({ url, mimeType: mime }));
  }
  if (typeof o.video === "object" && o.video && (o.video as Record<string, unknown>).url) {
    return [{ url: (o.video as Record<string, unknown>).url as string, mimeType: mime }];
  }
  if (typeof o.image === "object" && o.image && (o.image as Record<string, unknown>).url) {
    return [{ url: (o.image as Record<string, unknown>).url as string, mimeType: mime }];
  }
  return [];
}

export class FalImage implements ImageProvider {
  capability = "image" as const;

  async generate(input: ImageGenerateInput, creds: ProviderCredentials): Promise<ImageGenerateOutput> {
    const body: Record<string, unknown> = { prompt: input.prompt };
    if (input.negativePrompt) body.negative_prompt = input.negativePrompt;
    if (input.aspectRatio) body.aspect_ratio = input.aspectRatio;
    if (input.width) body.width = input.width;
    if (input.height) body.height = input.height;
    if (input.numImages) body.num_images = input.numImages;
    if (input.seed !== undefined) body.seed = input.seed;
    if (input.guidanceScale) body.guidance_scale = input.guidanceScale;
    if (input.steps) body.num_inference_steps = input.steps;
    if (input.inputImageUrl) body.image_url = input.inputImageUrl;

    const queue = await submitFal(input.model, body, creds.apiKey, input.signal);
    const result = await awaitFal(input.model, queue, creds.apiKey, input.signal);
    return { assets: toAssets(result, "image/png"), raw: result };
  }
}

export class FalVideo implements VideoProvider {
  capability = "video" as const;

  async generate(input: VideoGenerateInput, creds: ProviderCredentials): Promise<VideoGenerateOutput> {
    const body: Record<string, unknown> = { prompt: input.prompt };
    if (input.negativePrompt) body.negative_prompt = input.negativePrompt;
    if (input.aspectRatio) body.aspect_ratio = input.aspectRatio;
    if (input.durationSeconds) body.duration = input.durationSeconds;
    if (input.inputImageUrl) body.image_url = input.inputImageUrl;
    if (input.seed !== undefined) body.seed = input.seed;

    const queue = await submitFal(input.model, body, creds.apiKey, input.signal);
    const result = await awaitFal(input.model, queue, creds.apiKey, input.signal);
    return { assets: toAssets(result, "video/mp4"), raw: result };
  }
}
