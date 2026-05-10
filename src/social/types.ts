/**
 * Social platform abstraction — OAuth + publish.
 *
 * Each platform implements a SocialPlatform descriptor. The framework handles
 * OAuth state, token storage (encrypted), and routing to the right publisher
 * at the scheduled time.
 */
import type { SocialPlatform as PrismaSocialPlatform } from "@prisma/client";

export type PlatformId = PrismaSocialPlatform;

export interface PlatformInfo {
  id: PlatformId;
  label: string;
  /** True if this platform's OAuth client is configured via env vars. */
  configured: boolean;
  /** Required env vars to enable this platform (shown in UI when not configured). */
  requiredEnv: string[];
  /** Documentation link for OAuth client setup. */
  docsUrl?: string;
  /** Capabilities — what kinds of posts this platform supports. */
  capabilities: PlatformCapability[];
}

export type PlatformCapability = "text" | "image" | "video";

export interface OAuthAuthorizeRequest {
  /** Absolute callback URL the platform should redirect to after the user authorizes. */
  redirectUri: string;
  /** Random opaque state we'll verify on the callback (HMAC-signed). */
  state: string;
  /** Some platforms use PKCE — if so, we generate a verifier/challenge pair. */
  codeChallenge?: string;
  codeVerifier?: string;
}

export interface OAuthCallbackResult {
  externalId: string;
  username?: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface SocialOAuth {
  /** Build the URL to redirect the user to for authorization. */
  buildAuthorizeUrl(req: OAuthAuthorizeRequest): string;
  /** Exchange the platform-returned `code` for an access token + user info. */
  exchangeCode(opts: {
    code: string;
    redirectUri: string;
    codeVerifier?: string;
  }): Promise<OAuthCallbackResult>;
  /** Refresh an access token (best-effort — not all platforms support refresh). */
  refresh?(opts: { refreshToken: string }): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresAt?: Date;
  }>;
}

export interface PostInput {
  caption: string;
  hashtags: string[];
  /** URLs to media to attach. May be image or video. */
  assetUrls: string[];
  /** Optional title (used by YouTube; ignored elsewhere). */
  title?: string;
  /** Privacy for video platforms — YouTube uses 'public' | 'unlisted' | 'private'. */
  privacy?: "public" | "unlisted" | "private";
}

export interface PublishedPost {
  externalPostId: string;
  url?: string;
  metadata?: Record<string, unknown>;
}

export interface SocialPublisher {
  /**
   * Publish to the platform using the supplied access token. Throws on failure
   * with a human-readable message.
   */
  publish(opts: {
    accessToken: string;
    refreshToken?: string;
    externalId: string;
    metadata?: Record<string, unknown>;
    post: PostInput;
  }): Promise<PublishedPost>;
}

export interface PlatformAdapter {
  info: PlatformInfo;
  oauth: SocialOAuth;
  publisher: SocialPublisher;
}
