/**
 * OpenAI provider — implements LLM, Image, TTS, STT.
 *
 * Also serves as the default OpenAI-compatible LLM client. Many other
 * providers (Groq, Together, Ollama, vLLM, LM Studio, OpenRouter) speak the
 * same protocol; pass a custom base URL via the user's Credential row to use
 * them.
 */
import type {
  GeneratedAsset,
  ImageGenerateInput,
  ImageGenerateOutput,
  ImageProvider,
  LLMGenerateInput,
  LLMGenerateOutput,
  LLMProvider,
  ProviderCredentials,
  ProviderInfo,
  STTProvider,
  STTTranscribeInput,
  STTTranscribeOutput,
  TTSGenerateInput,
  TTSGenerateOutput,
  TTSProvider,
} from "./types";
import { httpJson } from "./_http";

export const OPENAI_INFO: ProviderInfo = {
  id: "openai",
  label: "OpenAI",
  website: "https://platform.openai.com",
  capabilities: ["llm", "image", "tts", "stt"],
  supportsBaseUrl: true,
  apiKeyHelpUrl: "https://platform.openai.com/api-keys",
  apiKeyPlaceholder: "sk-...",
  models: [
    { id: "gpt-4o", label: "GPT-4o", capability: "llm" },
    { id: "gpt-4o-mini", label: "GPT-4o mini", capability: "llm" },
    { id: "gpt-4.1", label: "GPT-4.1", capability: "llm" },
    { id: "gpt-4.1-mini", label: "GPT-4.1 mini", capability: "llm" },
    { id: "o1-mini", label: "o1-mini", capability: "llm" },
    { id: "gpt-image-1", label: "gpt-image-1", capability: "image" },
    { id: "dall-e-3", label: "DALL·E 3", capability: "image" },
    { id: "tts-1", label: "TTS-1", capability: "tts" },
    { id: "tts-1-hd", label: "TTS-1 HD", capability: "tts" },
    { id: "gpt-4o-mini-tts", label: "GPT-4o mini TTS", capability: "tts" },
    { id: "whisper-1", label: "Whisper-1", capability: "stt" },
    { id: "gpt-4o-transcribe", label: "GPT-4o Transcribe", capability: "stt" },
  ],
};

function baseUrlFor(creds: ProviderCredentials, fallback = "https://api.openai.com/v1"): string {
  const u = creds.baseUrl?.trim();
  if (!u) return fallback;
  return u.replace(/\/+$/, "");
}

export class OpenAICompatLLM implements LLMProvider {
  capability = "llm" as const;
  constructor(private readonly providerLabel: string = "openai") {}

  async generate(input: LLMGenerateInput, creds: ProviderCredentials): Promise<LLMGenerateOutput> {
    const url = `${baseUrlFor(creds)}/chat/completions`;
    interface Choice {
      message?: { content?: string };
    }
    interface Resp {
      choices?: Choice[];
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    }
    const body: Record<string, unknown> = {
      model: input.model,
      messages: input.messages,
      temperature: input.temperature ?? 0.7,
    };
    if (input.maxTokens) body.max_tokens = input.maxTokens;
    if (input.jsonSchema) {
      body.response_format = {
        type: "json_schema",
        json_schema: { name: "output", schema: input.jsonSchema, strict: true },
      };
    }
    const resp = await httpJson<Resp>(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${creds.apiKey}` },
      body,
      signal: input.signal,
    });
    const text = resp.choices?.[0]?.message?.content ?? "";
    return {
      text,
      raw: resp,
      usage: resp.usage
        ? {
            promptTokens: resp.usage.prompt_tokens,
            completionTokens: resp.usage.completion_tokens,
            totalTokens: resp.usage.total_tokens,
          }
        : undefined,
    };
  }
}

export class OpenAIImage implements ImageProvider {
  capability = "image" as const;

  async generate(input: ImageGenerateInput, creds: ProviderCredentials): Promise<ImageGenerateOutput> {
    const url = `${baseUrlFor(creds)}/images/generations`;
    interface Resp {
      data?: Array<{ url?: string; b64_json?: string }>;
    }
    const sizeFromAspect = (ar?: string, w?: number, h?: number): string => {
      if (w && h) return `${w}x${h}`;
      switch (ar) {
        case "1:1":
          return "1024x1024";
        case "16:9":
          return "1792x1024";
        case "9:16":
        case "3:4":
          return "1024x1792";
        default:
          return "1024x1024";
      }
    };
    const body: Record<string, unknown> = {
      model: input.model || "gpt-image-1",
      prompt: input.prompt,
      n: input.numImages ?? 1,
      size: sizeFromAspect(input.aspectRatio, input.width, input.height),
    };
    const resp = await httpJson<Resp>(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${creds.apiKey}` },
      body,
      signal: input.signal,
    });
    const assets: GeneratedAsset[] = (resp.data ?? []).map((d) => ({
      url: d.url ?? `data:image/png;base64,${d.b64_json}`,
      mimeType: "image/png",
    }));
    return { assets, raw: resp };
  }
}

export class OpenAITTS implements TTSProvider {
  capability = "tts" as const;

  async generate(input: TTSGenerateInput, creds: ProviderCredentials): Promise<TTSGenerateOutput> {
    const url = `${baseUrlFor(creds)}/audio/speech`;
    const fmt = input.format ?? "mp3";
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: input.model || "tts-1",
        input: input.text,
        voice: input.voiceId || "alloy",
        format: fmt,
        speed: input.speed,
      }),
      signal: input.signal,
    });
    if (!res.ok) {
      throw new Error(`OpenAI TTS error ${res.status}: ${(await res.text()).slice(0, 500)}`);
    }
    const buf = await res.arrayBuffer();
    const b64 = Buffer.from(buf).toString("base64");
    return {
      assets: [{ url: `data:audio/${fmt};base64,${b64}`, mimeType: `audio/${fmt}` }],
    };
  }
}

export class OpenAISTT implements STTProvider {
  capability = "stt" as const;

  async transcribe(input: STTTranscribeInput, creds: ProviderCredentials): Promise<STTTranscribeOutput> {
    // Fetch audio bytes then forward as multipart form-data.
    const audioRes = await fetch(input.audioUrl);
    if (!audioRes.ok) throw new Error(`Cannot download audio: HTTP ${audioRes.status}`);
    const audioBuf = await audioRes.arrayBuffer();

    const form = new FormData();
    form.append("file", new Blob([audioBuf]), "audio.mp3");
    form.append("model", input.model || "whisper-1");
    if (input.language) form.append("language", input.language);
    form.append("response_format", "verbose_json");

    const url = `${baseUrlFor(creds)}/audio/transcriptions`;
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${creds.apiKey}` },
      body: form,
      signal: input.signal,
    });
    if (!res.ok) {
      throw new Error(`OpenAI STT error ${res.status}: ${(await res.text()).slice(0, 500)}`);
    }
    interface Resp {
      text: string;
      segments?: Array<{ start: number; end: number; text: string }>;
    }
    const data = (await res.json()) as Resp;
    return { text: data.text, segments: data.segments, raw: data };
  }
}
