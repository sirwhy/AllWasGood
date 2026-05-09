import type {
  LLMGenerateInput,
  LLMGenerateOutput,
  LLMProvider,
  ProviderCredentials,
  ProviderInfo,
} from "./types";
import { httpJson } from "./_http";

export const GOOGLE_INFO: ProviderInfo = {
  id: "google",
  label: "Google Gemini",
  website: "https://aistudio.google.com",
  capabilities: ["llm"],
  apiKeyHelpUrl: "https://aistudio.google.com/apikey",
  apiKeyPlaceholder: "AIza...",
  models: [
    { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", capability: "llm" },
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", capability: "llm" },
    { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", capability: "llm" },
    { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro", capability: "llm" },
  ],
};

export class GoogleLLM implements LLMProvider {
  capability = "llm" as const;

  async generate(input: LLMGenerateInput, creds: ProviderCredentials): Promise<LLMGenerateOutput> {
    const base = (creds.baseUrl ?? "https://generativelanguage.googleapis.com").replace(/\/+$/, "");
    const url = `${base}/v1beta/models/${encodeURIComponent(input.model)}:generateContent?key=${encodeURIComponent(creds.apiKey)}`;

    const systemTexts = input.messages.filter((m) => m.role === "system").map((m) => m.content);
    const contents = input.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

    interface Resp {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
    }
    const resp = await httpJson<Resp>(url, {
      method: "POST",
      body: {
        systemInstruction: systemTexts.length
          ? { parts: systemTexts.map((t) => ({ text: t })) }
          : undefined,
        contents,
        generationConfig: {
          temperature: input.temperature ?? 0.7,
          maxOutputTokens: input.maxTokens,
        },
      },
      signal: input.signal,
    });
    const text = (resp.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? "")
      .join("");
    return {
      text,
      raw: resp,
      usage: resp.usageMetadata
        ? {
            promptTokens: resp.usageMetadata.promptTokenCount,
            completionTokens: resp.usageMetadata.candidatesTokenCount,
            totalTokens: resp.usageMetadata.totalTokenCount,
          }
        : undefined,
    };
  }
}
