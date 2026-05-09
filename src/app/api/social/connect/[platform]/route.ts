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
  const authorizeUrl = adapter.oauth.buildAuthorizeUrl({
    redirectUri,
    state,
    codeChallenge: pkce?.challenge,
    codeVerifier: pkce?.verifier,
  });

  return NextResponse.redirect(authorizeUrl);
}
