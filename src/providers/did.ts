/**
 * D-ID — talking-photo video generation.
 *
 * Flow: POST /talks → id, then poll GET /talks/:id until status is "done".
 * Supports providing a public photo URL OR a built-in/preset avatar via
 * source_url.
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

export const DID_INFO: ProviderInfo = {
  id: "did",
  label: "D-ID",
  website: "https://www.d-id.com",
  capabilities: ["avatar"],
  apiKeyHelpUrl: "https://studio.d-id.com/account-settings",
  apiKeyPlaceholder: "your D-ID API key (basic auth username:password)",
  models: [
    { id: "microsoft", label: "Microsoft TTS voice", capability: "avatar" },
    { id: "elevenlabs", label: "ElevenLabs TTS voice", capability: "avatar" },
  ],
};

interface CreateResp {
  id?: string;
  status?: string;
}
interface StatusResp {
  id?: string;
  status?: "created" | "started" | "done" | "error" | "rejected";
  result_url?: string;
  error?: { description?: string };
}

export class DIDAvatar implements AvatarProvider {
  capability = "avatar" as const;

  async generate(input: AvatarGenerateInput, creds: ProviderCredentials): Promise<AvatarGenerateOutput> {
    const sourceUrl = input.avatarPhotoUrl;
    if (!sourceUrl) {
      throw new Error("D-ID requires avatarPhotoUrl (a public photo URL).");
    }
    const headers = {
      Authorization: `Basic ${Buffer.from(creds.apiKey).toString("base64")}`,
    };

    const provider: Record<string, unknown> = { type: input.model || "microsoft" };
    if (input.voiceId) provider.voice_id = input.voiceId;

    const create = await httpJson<CreateResp>("https://api.d-id.com/talks", {
      method: "POST",
      headers,
      body: {
        source_url: sourceUrl,
        script: {
          type: "text",
          input: input.text,
          provider,
        },
      },
      signal: input.signal,
    });
    if (!create.id) throw new Error("D-ID create returned no id");

    const final = await pollUntil<StatusResp>(
      async () => {
        const s = await httpJson<StatusResp>(`https://api.d-id.com/talks/${create.id}`, {
          headers,
          signal: input.signal,
        });
        if (s.status === "done") return { done: true, value: s };
        if (s.status === "error" || s.status === "rejected") {
          return { done: true, error: s.error?.description ?? `D-ID ${s.status}` };
        }
        return { done: false };
      },
      { intervalMs: 4000, timeoutMs: 600_000, signal: input.signal },
    );
    const url = final.result_url;
    if (!url) throw new Error("D-ID done without result_url");
    const assets: GeneratedAsset[] = [{ url, mimeType: "video/mp4" }];
    return { assets, raw: final };
  }
}
