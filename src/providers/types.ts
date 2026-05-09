/**
 * Provider abstraction — common types shared across all AI capability providers.
 *
 * The system supports the following capabilities:
 *   - llm:        text generation / chat completions / structured output
 *   - image:      text-to-image, image-to-image
 *   - video:      text-to-video, image-to-video
 *   - avatar:     talking-head video from text + avatar + voice
 *   - tts:        text-to-speech
 *   - stt:        speech-to-text (transcription)
 *
 * Each provider is a class that implements one or more capability interfaces.
 * Providers are instantiated per-request with credentials resolved from the
 * authenticated user's `Credential` rows (or from the global env fallback).
 */

export type Capability = "llm" | "image" | "video" | "avatar" | "tts" | "stt";

export interface ProviderCredentials {
  apiKey: string;
  baseUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface ProviderModelInfo {
  id: string;
  label: string;
  capability: Capability;
  description?: string;
  /** rough cost guidance, e.g. "$0.04 / image", purely informational */
  pricingHint?: string;
}

export interface ProviderInfo {
  id: string;                // stable identifier, e.g. "openai", "replicate"
  label: string;             // human-readable name
  website?: string;
  capabilities: Capability[];
  models: ProviderModelInfo[];
  /** how the user obtains an API key */
  apiKeyHelpUrl?: string;
  apiKeyPlaceholder?: string;
  /** whether this provider supports an OpenAI-compatible base URL override */
  supportsBaseUrl?: boolean;
}

// ---------- LLM ----------

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMGenerateInput {
  model: string;
  messages: LLMMessage[];
  temperature?: number;
  maxTokens?: number;
  jsonSchema?: unknown;
  signal?: AbortSignal;
}

export interface LLMGenerateOutput {
  text: string;
  raw?: unknown;
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
}

export interface LLMProvider {
  capability: "llm";
  generate(input: LLMGenerateInput, creds: ProviderCredentials): Promise<LLMGenerateOutput>;
}

// ---------- Image ----------

export interface ImageGenerateInput {
  model: string;
  prompt: string;
  negativePrompt?: string;
  /** optional reference image URL or data URI for image-to-image */
  inputImageUrl?: string;
  width?: number;
  height?: number;
  /** aspect ratio shortcut, e.g. "1:1", "16:9", "9:16", "3:4", "4:3" */
  aspectRatio?: string;
  steps?: number;
  guidanceScale?: number;
  seed?: number;
  numImages?: number;
  signal?: AbortSignal;
}

export interface GeneratedAsset {
  url: string;
  mimeType?: string;
  width?: number;
  height?: number;
  durationMs?: number;
}

export interface ImageGenerateOutput {
  assets: GeneratedAsset[];
  raw?: unknown;
}

export interface ImageProvider {
  capability: "image";
  generate(input: ImageGenerateInput, creds: ProviderCredentials): Promise<ImageGenerateOutput>;
}

// ---------- Video ----------

export interface VideoGenerateInput {
  model: string;
  prompt: string;
  negativePrompt?: string;
  /** image-to-video reference */
  inputImageUrl?: string;
  /** optional reference video for style/motion */
  inputVideoUrl?: string;
  durationSeconds?: number;
  aspectRatio?: string;
  fps?: number;
  seed?: number;
  signal?: AbortSignal;
}

export interface VideoGenerateOutput {
  assets: GeneratedAsset[];
  raw?: unknown;
}

export interface VideoProvider {
  capability: "video";
  generate(input: VideoGenerateInput, creds: ProviderCredentials): Promise<VideoGenerateOutput>;
}

// ---------- Avatar (talking head) ----------

export interface AvatarGenerateInput {
  model: string;
  /** the text the avatar should speak */
  text: string;
  /** provider-specific avatar id, OR a public photo URL the provider should animate */
  avatarId?: string;
  avatarPhotoUrl?: string;
  /** provider-specific voice id, OR a custom voice clone reference */
  voiceId?: string;
  voiceSampleUrl?: string;
  language?: string;
  aspectRatio?: string;
  signal?: AbortSignal;
}

export interface AvatarGenerateOutput {
  assets: GeneratedAsset[];
  raw?: unknown;
}

export interface AvatarProvider {
  capability: "avatar";
  generate(input: AvatarGenerateInput, creds: ProviderCredentials): Promise<AvatarGenerateOutput>;
}

// ---------- TTS ----------

export interface TTSGenerateInput {
  model: string;
  text: string;
  voiceId?: string;
  language?: string;
  speed?: number;
  format?: "mp3" | "wav" | "ogg";
  signal?: AbortSignal;
}

export interface TTSGenerateOutput {
  assets: GeneratedAsset[];
  raw?: unknown;
}

export interface TTSProvider {
  capability: "tts";
  generate(input: TTSGenerateInput, creds: ProviderCredentials): Promise<TTSGenerateOutput>;
}

// ---------- STT ----------

export interface STTTranscribeInput {
  model: string;
  audioUrl: string;
  language?: string;
  signal?: AbortSignal;
}

export interface STTTranscribeOutput {
  text: string;
  segments?: Array<{ start: number; end: number; text: string }>;
  raw?: unknown;
}

export interface STTProvider {
  capability: "stt";
  transcribe(input: STTTranscribeInput, creds: ProviderCredentials): Promise<STTTranscribeOutput>;
}

// ---------- Combined ----------

export type AnyProvider =
  | LLMProvider
  | ImageProvider
  | VideoProvider
  | AvatarProvider
  | TTSProvider
  | STTProvider;
