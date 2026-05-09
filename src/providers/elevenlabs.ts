/**
 * ElevenLabs — high-quality TTS with voice cloning.
 */
import type {
  GeneratedAsset,
  ProviderCredentials,
  ProviderInfo,
  TTSGenerateInput,
  TTSGenerateOutput,
  TTSProvider,
} from "./types";

export const ELEVENLABS_INFO: ProviderInfo = {
  id: "elevenlabs",
  label: "ElevenLabs",
  website: "https://elevenlabs.io",
  capabilities: ["tts"],
  apiKeyHelpUrl: "https://elevenlabs.io/app/settings/api-keys",
  apiKeyPlaceholder: "sk_...",
  models: [
    { id: "eleven_turbo_v2_5", label: "Eleven Turbo v2.5", capability: "tts" },
    { id: "eleven_multilingual_v2", label: "Eleven Multilingual v2", capability: "tts" },
    { id: "eleven_v3", label: "Eleven v3", capability: "tts" },
  ],
};

export class ElevenLabsTTS implements TTSProvider {
  capability = "tts" as const;

  async generate(input: TTSGenerateInput, creds: ProviderCredentials): Promise<TTSGenerateOutput> {
    const voiceId = input.voiceId || "21m00Tcm4TlvDq8ikWAM"; // Rachel (default)
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": creds.apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: input.text,
        model_id: input.model || "eleven_turbo_v2_5",
      }),
      signal: input.signal,
    });
    if (!res.ok) {
      throw new Error(`ElevenLabs error ${res.status}: ${(await res.text()).slice(0, 500)}`);
    }
    const buf = await res.arrayBuffer();
    const b64 = Buffer.from(buf).toString("base64");
    const assets: GeneratedAsset[] = [
      { url: `data:audio/mpeg;base64,${b64}`, mimeType: "audio/mpeg" },
    ];
    return { assets };
  }
}
