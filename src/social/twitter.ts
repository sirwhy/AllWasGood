import type {
  PlatformAdapter,
  PlatformInfo,
  PublishedPost,
  SocialOAuth,
  SocialPublisher,
} from "./types";

const TWITTER_INFO: PlatformInfo = {
  id: "TWITTER",
  label: "X (Twitter)",
  configured: !!process.env.TWITTER_CLIENT_ID && !!process.env.TWITTER_CLIENT_SECRET,
  requiredEnv: ["TWITTER_CLIENT_ID", "TWITTER_CLIENT_SECRET"],
  docsUrl: "https://developer.x.com/en/portal/dashboard",
  capabilities: ["text", "image", "video"],
};

class TwitterOAuth implements SocialOAuth {
  buildAuthorizeUrl(req: {
    redirectUri: string;
    state: string;
    codeChallenge?: string;
  }): string {
    if (!req.codeChallenge) throw new Error("Twitter OAuth requires PKCE codeChallenge");
    const u = new URL("https://twitter.com/i/oauth2/authorize");
    u.searchParams.set("response_type", "code");
    u.searchParams.set("client_id", process.env.TWITTER_CLIENT_ID ?? "");
    u.searchParams.set("redirect_uri", req.redirectUri);
    u.searchParams.set("scope", "tweet.read tweet.write users.read offline.access");
    u.searchParams.set("state", req.state);
    u.searchParams.set("code_challenge", req.codeChallenge);
    u.searchParams.set("code_challenge_method", "S256");
    return u.toString();
  }
  async exchangeCode(opts: {
    code: string;
    redirectUri: string;
    codeVerifier?: string;
  }) {
    if (!opts.codeVerifier) throw new Error("Twitter OAuth callback missing codeVerifier");
    const basic = Buffer.from(
      `${process.env.TWITTER_CLIENT_ID}:${process.env.TWITTER_CLIENT_SECRET}`,
    ).toString("base64");
    const body = new URLSearchParams({
      code: opts.code,
      grant_type: "authorization_code",
      redirect_uri: opts.redirectUri,
      code_verifier: opts.codeVerifier,
    });
    const res = await fetch("https://api.twitter.com/2/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basic}`,
      },
      body,
    });
    if (!res.ok) {
      throw new Error(`Twitter token exchange failed: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };

    const me = await fetch("https://api.twitter.com/2/users/me", {
      headers: { Authorization: `Bearer ${json.access_token}` },
    });
    let externalId = "unknown";
    let username: string | undefined;
    if (me.ok) {
      const meJson = (await me.json()) as { data?: { id: string; username: string } };
      externalId = meJson.data?.id ?? externalId;
      username = meJson.data?.username;
    }
    return {
      externalId,
      username,
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt: json.expires_in
        ? new Date(Date.now() + json.expires_in * 1000)
        : undefined,
    };
  }
  async refresh(opts: { refreshToken: string }) {
    const basic = Buffer.from(
      `${process.env.TWITTER_CLIENT_ID}:${process.env.TWITTER_CLIENT_SECRET}`,
    ).toString("base64");
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: opts.refreshToken,
    });
    const res = await fetch("https://api.twitter.com/2/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basic}`,
      },
      body,
    });
    if (!res.ok) throw new Error(`Twitter refresh failed: ${res.status}`);
    const j = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };
    return {
      accessToken: j.access_token,
      refreshToken: j.refresh_token,
      expiresAt: j.expires_in ? new Date(Date.now() + j.expires_in * 1000) : undefined,
    };
  }
}

class TwitterPublisher implements SocialPublisher {
  async publish(opts: {
    accessToken: string;
    post: { caption: string; hashtags: string[]; assetUrls: string[] };
  }): Promise<PublishedPost> {
    const text = [opts.post.caption, ...opts.post.hashtags.map((h) => `#${h}`)]
      .filter(Boolean)
      .join(" ")
      .slice(0, 280);
    // Note: media upload to Twitter requires the v1.1 media endpoint with
    // OAuth1 — for this MVP we post text-only and include the asset URL in
    // the tweet body so Twitter unfurls it as a card. Full media upload is a
    // follow-up.
    const tweetText = opts.post.assetUrls[0]
      ? `${text} ${opts.post.assetUrls[0]}`.slice(0, 280)
      : text;
    const res = await fetch("https://api.twitter.com/2/tweets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: tweetText }),
    });
    if (!res.ok) {
      throw new Error(`Twitter publish failed: ${res.status} ${await res.text()}`);
    }
    const j = (await res.json()) as { data?: { id: string; text: string } };
    if (!j.data?.id) throw new Error("Twitter publish: missing tweet id in response");
    return {
      externalPostId: j.data.id,
      url: `https://x.com/i/web/status/${j.data.id}`,
    };
  }
}

export const TWITTER: PlatformAdapter = {
  info: TWITTER_INFO,
  oauth: new TwitterOAuth(),
  publisher: new TwitterPublisher(),
};
