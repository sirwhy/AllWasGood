/**
 * Type-safe environment variable access.
 * Validates required env vars at startup and exposes them as a typed object.
 */
import { z } from "zod";

const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  APP_NAME: z.string().default("Pippit Clone"),

  AUTH_SECRET: z.string().min(16, "AUTH_SECRET must be at least 16 chars"),
  AUTH_TRUST_HOST: z.string().optional(),
  AUTH_GOOGLE_ID: z.string().optional(),
  AUTH_GOOGLE_SECRET: z.string().optional(),
  AUTH_GITHUB_ID: z.string().optional(),
  AUTH_GITHUB_SECRET: z.string().optional(),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().default("redis://localhost:6379"),

  CREDENTIAL_ENCRYPTION_KEY: z
    .string()
    .min(32, "CREDENTIAL_ENCRYPTION_KEY must be at least 32 chars (base64-encoded 32-byte key recommended)"),

  STORAGE_PROVIDER: z.enum(["local", "s3"]).default("local"),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("auto"),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_PUBLIC_URL: z.string().optional(),

  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  REPLICATE_API_TOKEN: z.string().optional(),
  FAL_API_KEY: z.string().optional(),
  STABILITY_API_KEY: z.string().optional(),
  ELEVENLABS_API_KEY: z.string().optional(),
  HEYGEN_API_KEY: z.string().optional(),
  DID_API_KEY: z.string().optional(),
  DEEPGRAM_API_KEY: z.string().optional(),

  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(4),

  SCRAPER_PROXY_URL: z.string().url().optional(),

  PORT: z.coerce.number().int().positive().default(3000),
});

const clientSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
});

function parseEnv() {
  if (typeof window !== "undefined") {
    const parsed = clientSchema.safeParse({
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    });
    if (!parsed.success) {
      throw new Error("Invalid client env: " + parsed.error.message);
    }
    return parsed.data as unknown as z.infer<typeof serverSchema>;
  }
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const formatted = parsed.error.flatten().fieldErrors;
    console.error("Invalid environment variables:", formatted);
    throw new Error("Invalid environment variables. See logs above.");
  }
  return parsed.data;
}

export const env = parseEnv();
export type Env = z.infer<typeof serverSchema>;
