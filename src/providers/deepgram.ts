/**
 * Deepgram — speech-to-text.
 */
import type {
  ProviderCredentials,
  ProviderInfo,
  STTProvider,
  STTTranscribeInput,
  STTTranscribeOutput,
} from "./types";
import { httpJson } from "./_http";

export const DEEPGRAM_INFO: ProviderInfo = {
  id: "deepgram",
  label: "Deepgram",
  website: "https://deepgram.com",
  capabilities: ["stt"],
  apiKeyHelpUrl: "https://console.deepgram.com",
  apiKeyPlaceholder: "your Deepgram API key",
  models: [
    { id: "nova-3", label: "Nova-3", capability: "stt" },
    { id: "nova-2", label: "Nova-2", capability: "stt" },
  ],
};

export class DeepgramSTT implements STTProvider {
  capability = "stt" as const;

  async transcribe(input: STTTranscribeInput, creds: ProviderCredentials): Promise<STTTranscribeOutput> {
    const params = new URLSearchParams({
      model: input.model || "nova-3",
      smart_format: "true",
      punctuate: "true",
    });
    if (input.language) params.set("language", input.language);

    interface Resp {
      results?: {
        channels?: Array<{
          alternatives?: Array<{
            transcript?: string;
            words?: Array<{ start: number; end: number; word: string }>;
          }>;
        }>;
      };
    }
    const data = await httpJson<Resp>(`https://api.deepgram.com/v1/listen?${params}`, {
      method: "POST",
      headers: {
        Authorization: `Token ${creds.apiKey}`,
      },
      body: { url: input.audioUrl },
      signal: input.signal,
    });
    const alt = data.results?.channels?.[0]?.alternatives?.[0];
    return {
      text: alt?.transcript ?? "",
      raw: data,
    };
  }
}
