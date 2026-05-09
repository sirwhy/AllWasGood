/**
 * Stability AI — text-to-image via the Stable Image API.
 */
import type {
  GeneratedAsset,
  ImageGenerateInput,
  ImageGenerateOutput,
  ImageProvider,
  ProviderCredentials,
  ProviderInfo,
} from "./types";

export const STABILITY_INFO: ProviderInfo = {
  id: "stability",
  label: "Stability AI",
  website: "https://platform.stability.ai",
  capabilities: ["image"],
  apiKeyHelpUrl: "https://platform.stability.ai/account/keys",
  apiKeyPlaceholder: "sk-...",
  models: [
    { id: "stable-image/generate/ultra", label: "Stable Image Ultra", capability: "image" },
    { id: "stable-image/generate/core", label: "Stable Image Core", capability: "image" },
    { id: "stable-image/generate/sd3", label: "Stable Diffusion 3.5", capability: "image" },
  ],
};

export class StabilityImage implements ImageProvider {
  capability = "image" as const;

  async generate(input: ImageGenerateInput, creds: ProviderCredentials): Promise<ImageGenerateOutput> {
    const url = `https://api.stability.ai/v2beta/${input.model}`;
    const form = new FormData();
    form.append("prompt", input.prompt);
    if (input.negativePrompt) form.append("negative_prompt", input.negativePrompt);
    if (input.aspectRatio) form.append("aspect_ratio", input.aspectRatio);
    if (input.seed !== undefined) form.append("seed", String(input.seed));
    form.append("output_format", "png");

    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${creds.apiKey}`, Accept: "image/*" },
      body: form,
      signal: input.signal,
    });
    if (!res.ok) throw new Error(`Stability error ${res.status}: ${(await res.text()).slice(0, 500)}`);
    const buf = await res.arrayBuffer();
    const b64 = Buffer.from(buf).toString("base64");
    const assets: GeneratedAsset[] = [
      { url: `data:image/png;base64,${b64}`, mimeType: "image/png" },
    ];
    return { assets };
  }
}
