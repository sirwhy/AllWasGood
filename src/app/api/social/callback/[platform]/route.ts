import { NextResponse } from "next/server";

import { encryptString } from "@/lib/crypto";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { verifyOAuthState } from "@/social/oauth-state";
import { getPlatform } from "@/social/registry";
import type { PlatformId } from "@/social/types";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ platform: string }> },
) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");
  const { platform } = await params;
  const upper = platform.toUpperCase() as PlatformId;

  if (errorParam) {
    return NextResponse.redirect(
      `${env.NEXT_PUBLIC_APP_URL}/publishing?error=${encodeURIComponent(errorParam)}`,
    );
  }
  if (!code || !state) {
    return NextResponse.json({ error: "missing code or state" }, { status: 400 });
  }

  let payload;
  try {
    payload = verifyOAuthState(state);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
  if (payload.platform !== upper) {
    return NextResponse.json({ error: "platform mismatch" }, { status: 400 });
  }

  let adapter;
  try {
    adapter = getPlatform(upper);
  } catch {
    return NextResponse.json({ error: "unknown platform" }, { status: 400 });
  }

  const redirectUri = `${env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "")}/api/social/callback/${platform.toLowerCase()}`;
  let result;
  try {
    result = await adapter.oauth.exchangeCode({
      code,
      redirectUri,
      codeVerifier: payload.codeVerifier,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }

  await db.socialAccount.upsert({
    where: {
      userId_platform_externalId: {
        userId: payload.userId,
        platform: upper,
        externalId: result.externalId,
      },
    },
    create: {
      userId: payload.userId,
      platform: upper,
      externalId: result.externalId,
      username: result.username ?? null,
      accessToken: encryptString(result.accessToken),
      refreshToken: result.refreshToken ? encryptString(result.refreshToken) : null,
      expiresAt: result.expiresAt ?? null,
      metadata: (result.metadata ?? {}) as object,
    },
    update: {
      username: result.username ?? null,
      accessToken: encryptString(result.accessToken),
      refreshToken: result.refreshToken ? encryptString(result.refreshToken) : null,
      expiresAt: result.expiresAt ?? null,
      metadata: (result.metadata ?? {}) as object,
    },
  });

  return NextResponse.redirect(`${env.NEXT_PUBLIC_APP_URL}/publishing?connected=${platform}`);
}
