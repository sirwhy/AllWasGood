# Adding a new AI provider

Providers live in `src/providers/`. Each provider implements one or more **capability** interfaces from `src/providers/types.ts`:

| Capability | Interface | Description |
|---|---|---|
| `llm` | `LLMProvider` | text generation / chat completions |
| `image` | `ImageProvider` | text-to-image, image-to-image |
| `video` | `VideoProvider` | text-to-video, image-to-video |
| `avatar` | `AvatarProvider` | talking-head video |
| `tts` | `TTSProvider` | text-to-speech |
| `stt` | `STTProvider` | speech-to-text |

## 1. Create the provider file

```ts
// src/providers/myprovider.ts
import type {
  LLMGenerateInput,
  LLMGenerateOutput,
  LLMProvider,
  ProviderCredentials,
  ProviderInfo,
} from "./types";
import { httpJson } from "./_http";

export const MYPROVIDER_INFO: ProviderInfo = {
  id: "myprovider",
  label: "My Provider",
  website: "https://myprovider.example.com",
  capabilities: ["llm"],
  apiKeyHelpUrl: "https://myprovider.example.com/keys",
  apiKeyPlaceholder: "mp-...",
  supportsBaseUrl: true,
  models: [
    { id: "fast", label: "MyProvider Fast", capability: "llm" },
    { id: "smart", label: "MyProvider Smart", capability: "llm" },
  ],
};

export class MyProviderLLM implements LLMProvider {
  capability = "llm" as const;

  async generate(input: LLMGenerateInput, creds: ProviderCredentials): Promise<LLMGenerateOutput> {
    const url = (creds.baseUrl ?? "https://api.myprovider.example.com").replace(/\/+$/, "") + "/v1/chat";
    interface Resp { output?: { text?: string } }
    const data = await httpJson<Resp>(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${creds.apiKey}` },
      body: { model: input.model, messages: input.messages, temperature: input.temperature },
      signal: input.signal,
    });
    return { text: data.output?.text ?? "", raw: data };
  }
}
```

## 2. Register it

Add to `src/providers/registry.ts`:

```ts
import { MyProviderLLM, MYPROVIDER_INFO } from "./myprovider";

const REGISTRY: Record<string, RegistryEntry> = {
  // …existing entries…
  myprovider: {
    info: MYPROVIDER_INFO,
    llm: () => new MyProviderLLM(),
  },
};
```

## 3. (Optional) Add an env-var fallback

Edit `src/lib/credentials.ts` and add to `ENV_FALLBACKS`:

```ts
myprovider: { apiKey: env.MYPROVIDER_API_KEY },
```

Then add `MYPROVIDER_API_KEY` to `src/lib/env.ts` and `.env.example`.

## 4. Done

The provider now appears in **Settings → API Keys** and can be selected from feature dropdowns. No further wiring needed.

---

## Tip: OpenAI-compatible providers

If your provider speaks the OpenAI Chat Completions protocol, you don't need a custom class — users can pick the built-in **"OpenAI-compatible (custom gateway)"** provider in Settings, paste your **Base URL** + **API Key**, and it works.

If you want a dedicated entry (so users see your logo / model list), wrap `OpenAICompatLLM` like `xiaomi.ts` or `groq.ts` does:

```ts
export class MyLLM implements LLMProvider {
  capability = "llm" as const;
  private inner = new OpenAICompatLLM("myprovider");
  generate(input, creds) {
    return this.inner.generate(input, { ...creds, baseUrl: creds.baseUrl ?? "https://api.myprovider.example.com/v1" });
  }
}
```
