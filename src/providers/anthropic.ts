import type {
  LLMGenerateInput,
  LLMGenerateOutput,
  LLMProvider,
  ProviderCredentials,
  ProviderInfo,
} from "./types";
import { httpJson } from "./_http";

export const ANTHROPIC_INFO: ProviderInfo = {
  id: "anthropic",
  label: "Anthropic Claude",
  website: "https://console.anthropic.com",
  capabilities: ["llm"],
  apiKeyHelpUrl: "https://console.anthropic.com/settings/keys",
  apiKeyPlaceholder: "sk-ant-...",
  supportsBaseUrl: true,
  models: [
    { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5", capability: "llm" },
    { id: "claude-opus-4-1", label: "Claude Opus 4.1", capability: "llm" },
    { id: "claude-3-7-sonnet-latest", label: "Claude 3.7 Sonnet", capability: "llm" },
    { id: "claude-3-5-sonnet-latest", label: "Claude 3.5 Sonnet", capability: "llm" },
    { id: "claude-3-5-haiku-latest", label: "Claude 3.5 Haiku", capability: "llm" },
  ],
};

export class AnthropicLLM implements LLMProvider {
  capability = "llm" as const;

  async generate(input: LLMGenerateInput, creds: ProviderCredentials): Promise<LLMGenerateOutput> {
    const base = (creds.baseUrl ?? "https://api.anthropic.com").replace(/\/+$/, "");
    const url = `${base}/v1/messages`;

    const system = input.messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n");
    const messages = input.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content }));

    interface Resp {
      content?: Array<{ type: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    }
    const resp = await httpJson<Resp>(url, {
      method: "POST",
      headers: {
        "x-api-key": creds.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: {
        model: input.model,
        max_tokens: input.maxTokens ?? 4096,
        temperature: input.temperature ?? 0.7,
        system: system || undefined,
        messages,
      },
      signal: input.signal,
    });
    const text = (resp.content ?? [])
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("");
    return {
      text,
      raw: resp,
      usage: resp.usage
        ? {
            promptTokens: resp.usage.input_tokens,
            completionTokens: resp.usage.output_tokens,
            totalTokens: (resp.usage.input_tokens ?? 0) + (resp.usage.output_tokens ?? 0),
          }
        : undefined,
    };
  }
}
