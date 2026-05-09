/**
 * Xiaomi MiMo — OpenAI-compatible LLM provider.
 * Endpoint: https://api.xiaomimimo.com/v1
 * Console: https://platform.xiaomimimo.com
 */
import type {
  LLMGenerateInput,
  LLMGenerateOutput,
  LLMProvider,
  ProviderCredentials,
  ProviderInfo,
} from "./types";
import { OpenAICompatLLM } from "./openai";

export const XIAOMI_INFO: ProviderInfo = {
  id: "xiaomi",
  label: "Xiaomi MiMo (OpenAI-compatible)",
  website: "https://platform.xiaomimimo.com",
  capabilities: ["llm"],
  apiKeyHelpUrl: "https://platform.xiaomimimo.com",
  apiKeyPlaceholder: "your MiMo API key",
  supportsBaseUrl: true,
  models: [
    { id: "mimo-v2.5-pro", label: "MiMo V2.5 Pro", capability: "llm" },
    { id: "mimo-v2-pro", label: "MiMo V2 Pro", capability: "llm" },
    { id: "mimo-v2-flash", label: "MiMo V2 Flash", capability: "llm" },
  ],
};

export class XiaomiLLM implements LLMProvider {
  capability = "llm" as const;
  private inner = new OpenAICompatLLM("xiaomi");

  generate(input: LLMGenerateInput, creds: ProviderCredentials): Promise<LLMGenerateOutput> {
    return this.inner.generate(input, {
      ...creds,
      baseUrl: creds.baseUrl ?? "https://api.xiaomimimo.com/v1",
    });
  }
}
