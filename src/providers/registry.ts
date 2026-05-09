/**
 * Provider registry — single source of truth for all known providers.
 *
 * To add a new provider:
 *   1. Implement one or more capability interfaces in `src/providers/<id>.ts`
 *   2. Register an entry below (info + factory functions)
 *   3. Add the provider id to `KNOWN_PROVIDER_IDS`
 *
 * The factory functions return a *capability handler* given the provider info.
 * Multiple capabilities may share state (one HTTP client) so factories are
 * grouped per provider.
 */
import type {
  AvatarProvider,
  Capability,
  ImageProvider,
  LLMProvider,
  ProviderInfo,
  STTProvider,
  TTSProvider,
  VideoProvider,
} from "./types";

import { OpenAICompatLLM, OpenAIImage, OpenAITTS, OpenAISTT, OPENAI_INFO } from "./openai";
import { OpenAICompatGenericLLM, OPENAI_COMPAT_INFO } from "./openai_compat";
import { AnthropicLLM, ANTHROPIC_INFO } from "./anthropic";
import { GoogleLLM, GOOGLE_INFO } from "./google";
import { GroqLLM, GROQ_INFO } from "./groq";
import { OllamaLLM, OLLAMA_INFO } from "./ollama";
import { XiaomiLLM, XIAOMI_INFO } from "./xiaomi";
import {
  ReplicateImage,
  ReplicateVideo,
  ReplicateTTS,
  REPLICATE_INFO,
} from "./replicate";
import { FalImage, FalVideo, FAL_INFO } from "./fal";
import { StabilityImage, STABILITY_INFO } from "./stability";
import { ElevenLabsTTS, ELEVENLABS_INFO } from "./elevenlabs";
import { HeyGenAvatar, HEYGEN_INFO } from "./heygen";
import { DIDAvatar, DID_INFO } from "./did";
import { DeepgramSTT, DEEPGRAM_INFO } from "./deepgram";

interface RegistryEntry {
  info: ProviderInfo;
  llm?: () => LLMProvider;
  image?: () => ImageProvider;
  video?: () => VideoProvider;
  avatar?: () => AvatarProvider;
  tts?: () => TTSProvider;
  stt?: () => STTProvider;
}

const REGISTRY: Record<string, RegistryEntry> = {
  "openai-compat": {
    info: OPENAI_COMPAT_INFO,
    llm: () => new OpenAICompatGenericLLM(),
  },
  openai: {
    info: OPENAI_INFO,
    llm: () => new OpenAICompatLLM("openai"),
    image: () => new OpenAIImage(),
    tts: () => new OpenAITTS(),
    stt: () => new OpenAISTT(),
  },
  anthropic: {
    info: ANTHROPIC_INFO,
    llm: () => new AnthropicLLM(),
  },
  google: {
    info: GOOGLE_INFO,
    llm: () => new GoogleLLM(),
  },
  xiaomi: {
    info: XIAOMI_INFO,
    llm: () => new XiaomiLLM(),
  },
  groq: {
    info: GROQ_INFO,
    llm: () => new GroqLLM(),
  },
  ollama: {
    info: OLLAMA_INFO,
    llm: () => new OllamaLLM(),
  },
  replicate: {
    info: REPLICATE_INFO,
    image: () => new ReplicateImage(),
    video: () => new ReplicateVideo(),
    tts: () => new ReplicateTTS(),
  },
  fal: {
    info: FAL_INFO,
    image: () => new FalImage(),
    video: () => new FalVideo(),
  },
  stability: {
    info: STABILITY_INFO,
    image: () => new StabilityImage(),
  },
  elevenlabs: {
    info: ELEVENLABS_INFO,
    tts: () => new ElevenLabsTTS(),
  },
  heygen: {
    info: HEYGEN_INFO,
    avatar: () => new HeyGenAvatar(),
  },
  did: {
    info: DID_INFO,
    avatar: () => new DIDAvatar(),
  },
  deepgram: {
    info: DEEPGRAM_INFO,
    stt: () => new DeepgramSTT(),
  },
};

export const KNOWN_PROVIDER_IDS = Object.keys(REGISTRY);

export function getProviderInfo(id: string): ProviderInfo | undefined {
  return REGISTRY[id]?.info;
}

export function listProviders(capability?: Capability): ProviderInfo[] {
  const entries = Object.values(REGISTRY);
  if (!capability) return entries.map((e) => e.info);
  return entries
    .filter((e) => e.info.capabilities.includes(capability))
    .map((e) => e.info);
}

export function getLLM(providerId: string): LLMProvider {
  const entry = REGISTRY[providerId];
  if (!entry?.llm) throw new Error(`Provider ${providerId} does not support llm`);
  return entry.llm();
}

export function getImage(providerId: string): ImageProvider {
  const entry = REGISTRY[providerId];
  if (!entry?.image) throw new Error(`Provider ${providerId} does not support image`);
  return entry.image();
}

export function getVideo(providerId: string): VideoProvider {
  const entry = REGISTRY[providerId];
  if (!entry?.video) throw new Error(`Provider ${providerId} does not support video`);
  return entry.video();
}

export function getAvatar(providerId: string): AvatarProvider {
  const entry = REGISTRY[providerId];
  if (!entry?.avatar) throw new Error(`Provider ${providerId} does not support avatar`);
  return entry.avatar();
}

export function getTTS(providerId: string): TTSProvider {
  const entry = REGISTRY[providerId];
  if (!entry?.tts) throw new Error(`Provider ${providerId} does not support tts`);
  return entry.tts();
}

export function getSTT(providerId: string): STTProvider {
  const entry = REGISTRY[providerId];
  if (!entry?.stt) throw new Error(`Provider ${providerId} does not support stt`);
  return entry.stt();
}
