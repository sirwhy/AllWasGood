import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { generatePkcePair } from "@/social/pkce";
import { signOAuthState } from "@/social/oauth-state";
import { getPlatform } from "@/social/registry";
import type { PlatformId } from "@/social/types";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ platform: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { platform } = await params;
  const upper = platform.toUpperCase() as PlatformId;
  let adapter;
  try {
    adapter = getPlatform(upper);
  } catch {
    return NextResponse.json({ error: "unknown platform" }, { status: 400 });
  }
  if (!adapter.info.configured) {
    return NextResponse.json(
      {
        error: "platform not configured",
        requiredEnv: adapter.info.requiredEnv,
        docsUrl: adapter.info.docsUrl,
      },
      { status: 400 },
    );
  }

  // PKCE for platforms that require it (Twitter)
  const usePkce = upper === "TWITTER";
  const pkce = usePkce ? generatePkcePair() : null;
  const state = signOAuthState({
    userId: session.user.id,
    platform: upper,
    codeVerifier: pkce?.verifier,
  });
  const redirectUri = `${env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "")}/api/social/callback/${platform.toLowerCase()}`;
  // Stub adapters (TikTok / IG / FB / Threads) report configured=true once
  // their env vars are set but throw inside buildAuthorizeUrl since the
  // actual OAuth flow isn't implemented yet. Surface that as a 501 with the
  // adapter's own error message instead of a bare 500.
  let authorizeUrl: string;
  try {
    authorizeUrl = adapter.oauth.buildAuthorizeUrl({
      redirectUri,
      state,
      codeChallenge: pkce?.challenge,
      codeVerifier: pkce?.verifier,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 501 });
  }

  return NextResponse.redirect(authorizeUrl);
}
