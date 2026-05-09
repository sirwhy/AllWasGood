/**
 * HeyGen — talking-avatar video generation.
 *
 * Async flow: POST /v2/video/generate → video_id, then poll
 * /v1/video_status.get?video_id=... until status is "completed".
 */
import type {
  AvatarGenerateInput,
  AvatarGenerateOutput,
  AvatarProvider,
  GeneratedAsset,
  ProviderCredentials,
  ProviderInfo,
} from "./types";
import { httpJson, pollUntil } from "./_http";

export const HEYGEN_INFO: ProviderInfo = {
  id: "heygen",
  label: "HeyGen",
  website: "https://app.heygen.com",
  capabilities: ["avatar"],
  apiKeyHelpUrl: "https://app.heygen.com/settings?nav=API",
  apiKeyPlaceholder: "your HeyGen API key",
  models: [
    { id: "default", label: "HeyGen Avatar v3", capability: "avatar" },
  ],
};

interface GenResp {
  data?: { video_id?: string };
  error?: string | { message?: string };
}

interface StatusResp {
  data?: {
    status: "pending" | "processing" | "waiting" | "completed" | "failed";
    video_url?: string;
    video_url_caption?: string;
    error?: { detail?: string };
  };
  error?: string | { message?: string };
}

export class HeyGenAvatar implements AvatarProvider {
  capability = "avatar" as const;

  async generate(input: AvatarGenerateInput, creds: ProviderCredentials): Promise<AvatarGenerateOutput> {
    if (!input.avatarId) {
      throw new Error("HeyGen requires an avatarId. Browse /v2/avatars to find one.");
    }
    const headers = { "X-Api-Key": creds.apiKey };

    const dim = (input.aspectRatio ?? "16:9") === "9:16"
      ? { width: 720, height: 1280 }
      : (input.aspectRatio ?? "16:9") === "1:1"
        ? { width: 720, height: 720 }
        : { width: 1280, height: 720 };

    const create = await httpJson<GenResp>("https://api.heygen.com/v2/video/generate", {
      method: "POST",
      headers,
      body: {
        video_inputs: [
          {
            character: { type: "avatar", avatar_id: input.avatarId, avatar_style: "normal" },
            voice: {
              type: "text",
              input_text: input.text,
              voice_id: input.voiceId || "1bd001e7e50f421d891986aad5158bc8",
            },
          },
        ],
        dimension: dim,
      },
      signal: input.signal,
    });
    const videoId = create.data?.video_id;
    if (!videoId) {
      const err = typeof create.error === "string" ? create.error : create.error?.message;
      throw new Error(`HeyGen create failed: ${err ?? "unknown"}`);
    }

    const final = await pollUntil<StatusResp["data"]>(
      async () => {
        const s = await httpJson<StatusResp>(
          `https://api.heygen.com/v1/video_status.get?video_id=${encodeURIComponent(videoId)}`,
          { headers, signal: input.signal },
        );
        if (s.data?.status === "completed") return { done: true, value: s.data };
        if (s.data?.status === "failed") {
          return { done: true, error: s.data.error?.detail ?? "HeyGen failed" };
        }
        return { done: false };
      },
      { intervalMs: 5000, timeoutMs: 900_000, signal: input.signal },
    );

    const url = final?.video_url;
    if (!url) throw new Error("HeyGen completed without a video_url");
    const assets: GeneratedAsset[] = [{ url, mimeType: "video/mp4" }];
    return { assets, raw: final };
  }
}
