/**
 * Replicate — image, video, TTS via the Replicate model marketplace.
 *
 * Replicate's API is async: POST /predictions returns a prediction id, then
 * poll GET /predictions/:id until status is "succeeded" or "failed".
 *
 * The "model" field in our input is a Replicate model spec like
 * "owner/name" or "owner/name:version".
 */
import type {
  ImageGenerateInput,
  ImageGenerateOutput,
  ImageProvider,
  ProviderCredentials,
  ProviderInfo,
  TTSGenerateInput,
  TTSGenerateOutput,
  TTSProvider,
  VideoGenerateInput,
  VideoGenerateOutput,
  VideoProvider,
} from "./types";
import { httpJson, pollUntil } from "./_http";

export const REPLICATE_INFO: ProviderInfo = {
  id: "replicate",
  label: "Replicate",
  website: "https://replicate.com",
  capabilities: ["image", "video", "tts"],
  apiKeyHelpUrl: "https://replicate.com/account/api-tokens",
  apiKeyPlaceholder: "r8_...",
  models: [
    // Image
    { id: "black-forest-labs/flux-1.1-pro", label: "FLUX 1.1 Pro", capability: "image" },
    { id: "black-forest-labs/flux-schnell", label: "FLUX Schnell (fast)", capability: "image" },
    { id: "ideogram-ai/ideogram-v2", label: "Ideogram v2 (text rendering)", capability: "image" },
    { id: "stability-ai/stable-diffusion-3.5-large", label: "Stable Diffusion 3.5 Large", capability: "image" },
    { id: "google/imagen-3", label: "Google Imagen 3", capability: "image" },
    { id: "recraft-ai/recraft-v3", label: "Recraft v3", capability: "image" },
    // Video
    { id: "kwaivgi/kling-v1.6-pro", label: "Kling v1.6 Pro", capability: "video" },
    { id: "minimax/video-01", label: "MiniMax Hailuo Video-01", capability: "video" },
    { id: "luma/ray-flash-2-720p", label: "Luma Ray 2 Flash", capability: "video" },
    { id: "wavespeedai/wan-2.1-i2v-720p", label: "WAN 2.1 I2V 720p", capability: "video" },
    // TTS
    { id: "minimax/speech-02-hd", label: "MiniMax Speech-02 HD", capability: "tts" },
    { id: "lucataco/xtts-v2", label: "XTTS v2 (voice cloning)", capability: "tts" },
  ],
};

interface ReplicatePrediction {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: unknown;
  error?: string;
  urls?: { get?: string; cancel?: string };
}

async function createPrediction(
  modelSpec: string,
  input: Record<string, unknown>,
  apiKey: string,
  signal?: AbortSignal,
): Promise<ReplicatePrediction> {
  // Replicate accepts either "owner/name" (uses default version) or
  // "owner/name:version" (pinned). Use the official models endpoint when
  // possible to avoid pinning to a stale version.
  if (modelSpec.includes(":")) {
    const [, version] = modelSpec.split(":");
    return httpJson<ReplicatePrediction>(`https://api.replicate.com/v1/predictions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, Prefer: "wait=10" },
      body: { version, input },
      signal,
    });
  }
  return httpJson<ReplicatePrediction>(
    `https://api.replicate.com/v1/models/${modelSpec}/predictions`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, Prefer: "wait=10" },
      body: { input },
      signal,
    },
  );
}

async function awaitPrediction(
  prediction: ReplicatePrediction,
  apiKey: string,
  signal?: AbortSignal,
): Promise<ReplicatePrediction> {
  if (prediction.status === "succeeded" || prediction.status === "failed") return prediction;
  const url = prediction.urls?.get ?? `https://api.replicate.com/v1/predictions/${prediction.id}`;
  return pollUntil<ReplicatePrediction>(
    async () => {
      const p = await httpJson<ReplicatePrediction>(url, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal,
      });
      if (p.status === "succeeded") return { done: true, value: p };
      if (p.status === "failed" || p.status === "canceled") {
        return { done: true, error: p.error ?? `Replicate prediction ${p.status}` };
      }
      return { done: false };
    },
    { intervalMs: 3000, timeoutMs: 600_000, signal },
  );
}

function toAssetUrls(output: unknown): string[] {
  if (!output) return [];
  if (typeof output === "string") return [output];
  if (Array.isArray(output)) {
    return output.flatMap((o) => toAssetUrls(o));
  }
  if (typeof output === "object") {
    const o = output as Record<string, unknown>;
    if (typeof o.url === "string") return [o.url];
    if (Array.isArray(o.images)) return o.images.flatMap(toAssetUrls);
    if (Array.isArray(o.outputs)) return o.outputs.flatMap(toAssetUrls);
  }
  return [];
}

export class ReplicateImage implements ImageProvider {
  capability = "image" as const;

  async generate(input: ImageGenerateInput, creds: ProviderCredentials): Promise<ImageGenerateOutput> {
    const replicateInput: Record<string, unknown> = {
      prompt: input.prompt,
    };
    if (input.negativePrompt) replicateInput.negative_prompt = input.negativePrompt;
    if (input.aspectRatio) replicateInput.aspect_ratio = input.aspectRatio;
    if (input.width) replicateInput.width = input.width;
    if (input.height) replicateInput.height = input.height;
    if (input.steps) replicateInput.num_inference_steps = input.steps;
    if (input.guidanceScale) replicateInput.guidance_scale = input.guidanceScale;
    if (input.seed !== undefined) replicateInput.seed = input.seed;
    if (input.numImages && input.numImages > 1) replicateInput.num_outputs = input.numImages;
    if (input.inputImageUrl) replicateInput.image = input.inputImageUrl;

    const created = await createPrediction(input.model, replicateInput, creds.apiKey, input.signal);
    const final = await awaitPrediction(created, creds.apiKey, input.signal);
    const urls = toAssetUrls(final.output);
    return {
      assets: urls.map((url) => ({ url, mimeType: "image/png" })),
      raw: final,
    };
  }
}

export class ReplicateVideo implements VideoProvider {
  capability = "video" as const;

  async generate(input: VideoGenerateInput, creds: ProviderCredentials): Promise<VideoGenerateOutput> {
    const replicateInput: Record<string, unknown> = {
      prompt: input.prompt,
    };
    if (input.negativePrompt) replicateInput.negative_prompt = input.negativePrompt;
    if (input.inputImageUrl) replicateInput.image = input.inputImageUrl;
    if (input.aspectRatio) replicateInput.aspect_ratio = input.aspectRatio;
    if (input.durationSeconds) replicateInput.duration = input.durationSeconds;
    if (input.fps) replicateInput.fps = input.fps;
    if (input.seed !== undefined) replicateInput.seed = input.seed;

    const created = await createPrediction(input.model, replicateInput, creds.apiKey, input.signal);
    const final = await awaitPrediction(created, creds.apiKey, input.signal);
    const urls = toAssetUrls(final.output);
    return {
      assets: urls.map((url) => ({ url, mimeType: "video/mp4" })),
      raw: final,
    };
  }
}

export class ReplicateTTS implements TTSProvider {
  capability = "tts" as const;

  async generate(input: TTSGenerateInput, creds: ProviderCredentials): Promise<TTSGenerateOutput> {
    const replicateInput: Record<string, unknown> = { text: input.text };
    if (input.voiceId) replicateInput.voice = input.voiceId;
    if (input.language) replicateInput.language = input.language;
    if (input.speed) replicateInput.speed = input.speed;

    const created = await createPrediction(input.model, replicateInput, creds.apiKey, input.signal);
    const final = await awaitPrediction(created, creds.apiKey, input.signal);
    const urls = toAssetUrls(final.output);
    return {
      assets: urls.map((url) => ({ url, mimeType: "audio/mpeg" })),
      raw: final,
    };
  }
}
