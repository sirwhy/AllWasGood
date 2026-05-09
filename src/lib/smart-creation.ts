/**
 * Smart Creation orchestration: product URL -> scraped data -> LLM-generated
 * marketing copy variants -> (optional) AI-generated images.
 *
 * Called from the worker process; the web tier just enqueues a job.
 */
import { Prisma } from "@prisma/client";

import { resolveCredentials } from "@/lib/credentials";
import { db } from "@/lib/db";
import { scrapeProductUrl, type ScrapedProduct } from "@/lib/scraper";
import { persistRemoteUrl } from "@/lib/storage";
import { getImage, getLLM } from "@/providers/registry";
import type { GeneratedAsset } from "@/providers/types";

export type SmartCreationTone = "casual" | "professional" | "playful" | "luxury" | "urgent";
export type SmartCreationLanguage = "id" | "en";

export interface SmartCreationPayload {
  projectId: string;
  generationId: string;
  productUrl: string;
  language: SmartCreationLanguage;
  tone: SmartCreationTone;
  numVariants: number;
  generateImages: boolean;
  imageProvider?: string;
  imageModel?: string;
  imageStyle?: string;
  numImages?: number;
  llmProvider: string;
  llmModel: string;
  customInstructions?: string;
  audience?: string;
  hashtagStyle?: string;
}

export interface CopyVariant {
  id: string;
  hook: string;
  caption: string;
  cta: string;
  hashtags: string[];
  platform_hint: string;
}

export interface SmartCreationResult {
  product: ScrapedProduct;
  variants: CopyVariant[];
  imagePrompts: string[];
  images: GeneratedAsset[];
  rawCopyJson: string;
}

const COPY_SYSTEM_PROMPT = `You are an elite social-media marketing copywriter.
You write punchy, scroll-stopping content for product launches and ads. You are
fluent in both Indonesian (Bahasa Indonesia) and English. When the requested
language is "id" you reply ONLY in fluent natural Bahasa Indonesia.

Your output MUST be a single JSON object matching exactly this TypeScript type:

{
  "summary": string,           // 1-2 sentences describing the product in the target language
  "variants": [                // EXACTLY the requested number of variants
    {
      "id": string,            // short slug like "v1", "v2"
      "hook": string,          // 1-line attention-grabbing hook
      "caption": string,       // 2-5 sentence caption suitable for Instagram/TikTok
      "cta": string,           // single short call-to-action
      "hashtags": string[],    // 5-10 hashtags WITHOUT the # symbol
      "platform_hint": string  // best-suited platform: tiktok | instagram | facebook | x | youtube_shorts | linkedin
    }
  ],
  "image_prompts": string[]    // EXACTLY the requested number of image generation prompts in English
}

Rules:
- Output ONLY the JSON. No markdown fences, no commentary.
- Image prompts must always be in English (image models work best in English).
- Hooks must be unique across variants.
- Hashtags must be relevant to the product's category.`;

function buildUserPrompt(input: SmartCreationPayload, product: ScrapedProduct) {
  const langLabel = input.language === "id" ? "Indonesian (Bahasa Indonesia)" : "English";
  const lines: string[] = [];
  lines.push(`Generate ${input.numVariants} marketing copy variants in ${langLabel}.`);
  lines.push(`Tone: ${input.tone}.`);
  if (input.audience) lines.push(`Target audience: ${input.audience}.`);
  if (input.hashtagStyle) lines.push(`Hashtag style: ${input.hashtagStyle}.`);
  lines.push(
    `Number of image generation prompts to produce: ${input.generateImages ? input.numImages ?? input.numVariants : 0}.`,
  );
  if (input.customInstructions) lines.push(`Extra instructions: ${input.customInstructions}.`);

  lines.push("\n--- PRODUCT ---");
  lines.push(`Title: ${product.title}`);
  if (product.brand) lines.push(`Brand: ${product.brand}`);
  if (product.price) lines.push(`Price: ${product.currency ?? ""} ${product.price}`.trim());
  if (product.rating) lines.push(`Rating: ${product.rating} (${product.reviewCount ?? "?"} reviews)`);
  lines.push(`URL: ${product.url}`);
  lines.push(`Description: ${product.description.slice(0, 1500)}`);
  if (product.features.length) {
    lines.push("Features:");
    for (const f of product.features.slice(0, 10)) lines.push(`  - ${f}`);
  }
  if (input.imageStyle && input.generateImages) {
    lines.push(`\nDesired image style for image_prompts: ${input.imageStyle}`);
  }
  return lines.join("\n");
}

interface RawCopyResponse {
  summary?: string;
  variants?: Partial<CopyVariant>[];
  image_prompts?: string[];
}

function safeParseJson(text: string): RawCopyResponse {
  // tolerate ```json fences
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned) as RawCopyResponse;
  } catch {
    // try to extract first { ... } block
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]) as RawCopyResponse;
      } catch {
        /* fall through */
      }
    }
    throw new Error("LLM returned non-JSON content for smart creation copy");
  }
}

export async function runSmartCreation(payload: SmartCreationPayload): Promise<SmartCreationResult> {
  const project = await db.project.findUnique({ where: { id: payload.projectId } });
  if (!project) throw new Error(`Project ${payload.projectId} not found`);
  const userId = project.userId;

  // 1) scrape product
  const product = await scrapeProductUrl(payload.productUrl);

  await db.project.update({
    where: { id: project.id },
    data: { productData: product as unknown as Prisma.InputJsonValue },
  });

  // 2) llm copy
  const llm = getLLM(payload.llmProvider);
  const llmCreds = await resolveCredentials(userId, payload.llmProvider);
  const userPrompt = buildUserPrompt(payload, product);
  const { text } = await llm.generate(
    {
      model: payload.llmModel,
      messages: [
        { role: "system", content: COPY_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.85,
      maxTokens: 2200,
    },
    llmCreds,
  );

  const parsed = safeParseJson(text);
  const variants: CopyVariant[] = (parsed.variants ?? []).map((v, i) => ({
    id: v.id ?? `v${i + 1}`,
    hook: v.hook ?? "",
    caption: v.caption ?? "",
    cta: v.cta ?? "",
    hashtags: Array.isArray(v.hashtags) ? v.hashtags.slice(0, 12) : [],
    platform_hint: v.platform_hint ?? "instagram",
  }));
  const imagePrompts: string[] = Array.isArray(parsed.image_prompts) ? parsed.image_prompts : [];

  // 3) optional images
  let images: GeneratedAsset[] = [];
  if (payload.generateImages && payload.imageProvider && payload.imageModel && imagePrompts.length) {
    const imageProvider = getImage(payload.imageProvider);
    const imageCreds = await resolveCredentials(userId, payload.imageProvider);
    const numImages = Math.min(payload.numImages ?? imagePrompts.length, imagePrompts.length);
    const collected: GeneratedAsset[] = [];
    for (let i = 0; i < numImages; i++) {
      const prompt = imagePrompts[i];
      try {
        const r = await imageProvider.generate(
          {
            model: payload.imageModel,
            prompt,
            aspectRatio: "1:1",
            numImages: 1,
          },
          imageCreds,
        );
        for (const a of r.assets) {
          try {
            const stored = await persistRemoteUrl({ userId, url: a.url });
            collected.push({ ...a, url: stored.url, mimeType: stored.contentType });
          } catch {
            collected.push(a);
          }
        }
      } catch (err) {
        console.warn(`[smart-creation] image ${i} failed:`, err);
      }
    }
    images = collected;

    for (const img of images) {
      await db.asset.create({
        data: {
          userId,
          generationId: payload.generationId,
          kind: "IMAGE",
          url: img.url,
          mimeType: img.mimeType ?? "image/png",
          width: img.width ?? null,
          height: img.height ?? null,
          metadata: { source: "smart-creation" } as unknown as Prisma.InputJsonValue,
        },
      });
    }
  }

  return { product, variants, imagePrompts, images, rawCopyJson: text };
}
