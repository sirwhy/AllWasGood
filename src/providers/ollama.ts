import type {
  LLMGenerateInput,
  LLMGenerateOutput,
  LLMProvider,
  ProviderCredentials,
  ProviderInfo,
} from "./types";
import { OpenAICompatLLM } from "./openai";

export const OLLAMA_INFO: ProviderInfo = {
  id: "ollama",
  label: "Ollama / LM Studio / vLLM (self-hosted, OpenAI-compatible)",
  website: "https://ollama.com",
  capabilities: ["llm"],
  apiKeyHelpUrl: "https://ollama.com",
  apiKeyPlaceholder: "ollama (any value works)",
  supportsBaseUrl: true,
  models: [
    { id: "llama3.2", label: "Llama 3.2", capability: "llm" },
    { id: "llama3.1", label: "Llama 3.1", capability: "llm" },
    { id: "qwen2.5", label: "Qwen 2.5", capability: "llm" },
    { id: "mistral", label: "Mistral", capability: "llm" },
    { id: "deepseek-r1", label: "DeepSeek R1", capability: "llm" },
  ],
};

export class OllamaLLM implements LLMProvider {
  capability = "llm" as const;
  private inner = new OpenAICompatLLM("ollama");

  generate(input: LLMGenerateInput, creds: ProviderCredentials): Promise<LLMGenerateOutput> {
    return this.inner.generate(input, {
      ...creds,
      apiKey: creds.apiKey || "ollama",
      baseUrl: creds.baseUrl ?? "http://localhost:11434/v1",
    });
  }
}
