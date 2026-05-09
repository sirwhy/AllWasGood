/**
 * Generic OpenAI-compatible LLM provider — for arbitrary gateways like
 * OpenRouter, Together, Anyscale, DeepInfra, Fireworks, kiro.dev (if it
 * exposes one), and any private LLM gateway you run.
 *
 * Configure with custom Base URL + API key in Settings.
 */
import type {
  LLMGenerateInput,
  LLMGenerateOutput,
  LLMProvider,
  ProviderCredentials,
  ProviderInfo,
} from "./types";
import { OpenAICompatLLM } from "./openai";

export const OPENAI_COMPAT_INFO: ProviderInfo = {
  id: "openai-compat",
  label: "OpenAI-compatible (custom gateway)",
  website: "",
  capabilities: ["llm"],
  apiKeyHelpUrl: "",
  apiKeyPlaceholder: "your gateway API key",
  supportsBaseUrl: true,
  models: [
    { id: "auto", label: "(set model id manually per-request)", capability: "llm" },
  ],
};

export class OpenAICompatGenericLLM implements LLMProvider {
  capability = "llm" as const;
  private inner = new OpenAICompatLLM("openai-compat");

  generate(input: LLMGenerateInput, creds: ProviderCredentials): Promise<LLMGenerateOutput> {
    if (!creds.baseUrl) {
      throw new Error(
        "OpenAI-compatible provider requires a Base URL. Configure it in Settings → API Keys.",
      );
    }
    return this.inner.generate(input, creds);
  }
}
