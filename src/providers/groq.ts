import type {
  LLMGenerateInput,
  LLMGenerateOutput,
  LLMProvider,
  ProviderCredentials,
  ProviderInfo,
} from "./types";
import { OpenAICompatLLM } from "./openai";

export const GROQ_INFO: ProviderInfo = {
  id: "groq",
  label: "Groq (OpenAI-compatible, very fast inference)",
  website: "https://console.groq.com",
  capabilities: ["llm"],
  apiKeyHelpUrl: "https://console.groq.com/keys",
  apiKeyPlaceholder: "gsk_...",
  supportsBaseUrl: true,
  models: [
    { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B", capability: "llm" },
    { id: "llama-3.1-8b-instant", label: "Llama 3.1 8B", capability: "llm" },
    { id: "mixtral-8x7b-32768", label: "Mixtral 8x7B", capability: "llm" },
    { id: "gemma2-9b-it", label: "Gemma 2 9B", capability: "llm" },
  ],
};

export class GroqLLM implements LLMProvider {
  capability = "llm" as const;
  private inner = new OpenAICompatLLM("groq");

  generate(input: LLMGenerateInput, creds: ProviderCredentials): Promise<LLMGenerateOutput> {
    return this.inner.generate(input, {
      ...creds,
      baseUrl: creds.baseUrl ?? "https://api.groq.com/openai/v1",
    });
  }
}
