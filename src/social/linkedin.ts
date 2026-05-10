import type {
  PlatformAdapter,
  PlatformInfo,
  PublishedPost,
  SocialOAuth,
  SocialPublisher,
} from "./types";

const LINKEDIN_INFO: PlatformInfo = {
  id: "LINKEDIN",
  label: "LinkedIn",
  configured: !!process.env.LINKEDIN_CLIENT_ID && !!process.env.LINKEDIN_CLIENT_SECRET,
  requiredEnv: ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"],
  docsUrl: "https://www.linkedin.com/developers/apps",
  capabilities: ["text", "image"],
};

class LinkedInOAuth implements SocialOAuth {
  buildAuthorizeUrl(req: { redirectUri: string; state: string }): string {
    const u = new URL("https://www.linkedin.com/oauth/v2/authorization");
    u.searchParams.set("response_type", "code");
    u.searchParams.set("client_id", process.env.LINKEDIN_CLIENT_ID ?? "");
    u.searchParams.set("redirect_uri", req.redirectUri);
    u.searchParams.set("state", req.state);
    u.searchParams.set("scope", "openid profile email w_member_social");
    return u.toString();
  }
  async exchangeCode(opts: { code: string; redirectUri: string }) {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: opts.code,
      redirect_uri: opts.redirectUri,
      client_id: process.env.LINKEDIN_CLIENT_ID ?? "",
      client_secret: process.env.LINKEDIN_CLIENT_SECRET ?? "",
    });
    const res = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok)
      throw new Error(`LinkedIn token exchange failed: ${res.status} ${await res.text()}`);
    const j = (await res.json()) as {
      access_token: string;
      expires_in: number;
      refresh_token?: string;
    };
    const meRes = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${j.access_token}` },
    });
    if (!meRes.ok) throw new Error(`LinkedIn /userinfo failed: ${meRes.status}`);
    const me = (await meRes.json()) as { sub: string; name?: string; email?: string };
    return {
      externalId: me.sub,
      username: me.name ?? me.email,
      accessToken: j.access_token,
      refreshToken: j.refresh_token,
      expiresAt: new Date(Date.now() + j.expires_in * 1000),
    };
  }
}

class LinkedInPublisher implements SocialPublisher {
  async publish(opts: {
    accessToken: string;
    externalId: string;
    post: { caption: string; hashtags: string[]; assetUrls: string[] };
  }): Promise<PublishedPost> {
    const text = [opts.post.caption, ...opts.post.hashtags.map((h) => `#${h}`)]
      .filter(Boolean)
      .join(" ");
    const author = `urn:li:person:${opts.externalId}`;
    const body = {
      author,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text },
          shareMediaCategory: opts.post.assetUrls[0] ? "ARTICLE" : "NONE",
          ...(opts.post.assetUrls[0]
            ? {
                media: [
                  {
                    status: "READY",
                    originalUrl: opts.post.assetUrls[0],
                  },
                ],
              }
            : {}),
        },
      },
      visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
    };
    const res = await fetch("https://api.linkedin.com/v2/ugcPosts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.accessToken}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`LinkedIn publish failed: ${res.status} ${await res.text()}`);
    const j = (await res.json()) as { id?: string };
    if (!j.id) throw new Error("LinkedIn publish: missing post id in response");
    return { externalPostId: j.id };
  }
}

export const LINKEDIN: PlatformAdapter = {
  info: LINKEDIN_INFO,
  oauth: new LinkedInOAuth(),
  publisher: new LinkedInPublisher(),
};
