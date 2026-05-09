import type {
  PlatformAdapter,
  PlatformInfo,
  PublishedPost,
  SocialOAuth,
  SocialPublisher,
} from "./types";

const YOUTUBE_INFO: PlatformInfo = {
  id: "YOUTUBE",
  label: "YouTube",
  configured: !!process.env.YOUTUBE_CLIENT_ID && !!process.env.YOUTUBE_CLIENT_SECRET,
  requiredEnv: ["YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET"],
  docsUrl: "https://console.cloud.google.com/apis/credentials",
  capabilities: ["video"],
};

class YoutubeOAuth implements SocialOAuth {
  buildAuthorizeUrl(req: { redirectUri: string; state: string }): string {
    const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    u.searchParams.set("client_id", process.env.YOUTUBE_CLIENT_ID ?? "");
    u.searchParams.set("redirect_uri", req.redirectUri);
    u.searchParams.set("response_type", "code");
    u.searchParams.set(
      "scope",
      "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly openid",
    );
    u.searchParams.set("access_type", "offline");
    u.searchParams.set("prompt", "consent");
    u.searchParams.set("state", req.state);
    return u.toString();
  }
  async exchangeCode(opts: { code: string; redirectUri: string }) {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: opts.code,
      redirect_uri: opts.redirectUri,
      client_id: process.env.YOUTUBE_CLIENT_ID ?? "",
      client_secret: process.env.YOUTUBE_CLIENT_SECRET ?? "",
    });
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) throw new Error(`YouTube token exchange failed: ${res.status} ${await res.text()}`);
    const j = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };
    const ch = await fetch(
      "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
      { headers: { Authorization: `Bearer ${j.access_token}` } },
    );
    let externalId = "me";
    let username: string | undefined;
    if (ch.ok) {
      const cj = (await ch.json()) as { items?: { id: string; snippet?: { title?: string } }[] };
      if (cj.items?.[0]) {
        externalId = cj.items[0].id;
        username = cj.items[0].snippet?.title;
      }
    }
    return {
      externalId,
      username,
      accessToken: j.access_token,
      refreshToken: j.refresh_token,
      expiresAt: new Date(Date.now() + j.expires_in * 1000),
    };
  }
  async refresh(opts: { refreshToken: string }) {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: opts.refreshToken,
      client_id: process.env.YOUTUBE_CLIENT_ID ?? "",
      client_secret: process.env.YOUTUBE_CLIENT_SECRET ?? "",
    });
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) throw new Error(`YouTube refresh failed: ${res.status}`);
    const j = (await res.json()) as { access_token: string; expires_in: number };
    return {
      accessToken: j.access_token,
      expiresAt: new Date(Date.now() + j.expires_in * 1000),
    };
  }
}

class YoutubePublisher implements SocialPublisher {
  async publish(opts: {
    accessToken: string;
    post: { caption: string; hashtags: string[]; assetUrls: string[]; title?: string };
  }): Promise<PublishedPost> {
    const videoUrl = opts.post.assetUrls.find((u) => /\.(mp4|webm|mov)(\?|$)/i.test(u));
    if (!videoUrl) throw new Error("YouTube publish requires a video asset URL");

    // Download the video to memory (small marketing videos only — for big ones
    // we'd want to stream, but the resumable upload protocol is more involved).
    const videoRes = await fetch(videoUrl);
    if (!videoRes.ok) throw new Error(`Failed to fetch video for upload: ${videoRes.status}`);
    const videoBytes = Buffer.from(await videoRes.arrayBuffer());
    const contentType = videoRes.headers.get("content-type") ?? "video/mp4";

    const meta = {
      snippet: {
        title: (opts.post.title ?? opts.post.caption.split("\n")[0] ?? "Video").slice(0, 95),
        description: [opts.post.caption, ...opts.post.hashtags.map((h) => `#${h}`)]
          .filter(Boolean)
          .join("\n"),
        tags: opts.post.hashtags.slice(0, 30),
        categoryId: "22", // People & Blogs
      },
      status: { privacyStatus: "private" as const, selfDeclaredMadeForKids: false },
    };

    // Resumable upload — step 1: initiate.
    const initRes = await fetch(
      "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${opts.accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Type": contentType,
          "X-Upload-Content-Length": String(videoBytes.length),
        },
        body: JSON.stringify(meta),
      },
    );
    if (!initRes.ok) {
      throw new Error(`YouTube upload init failed: ${initRes.status} ${await initRes.text()}`);
    }
    const uploadUrl = initRes.headers.get("location");
    if (!uploadUrl) throw new Error("YouTube upload init returned no Location header");

    // Step 2: upload bytes.
    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: new Uint8Array(videoBytes),
    });
    if (!uploadRes.ok) {
      throw new Error(`YouTube upload failed: ${uploadRes.status} ${await uploadRes.text()}`);
    }
    const j = (await uploadRes.json()) as { id?: string };
    if (!j.id) throw new Error("YouTube upload: missing video id in response");
    return {
      externalPostId: j.id,
      url: `https://youtu.be/${j.id}`,
    };
  }
}

export const YOUTUBE: PlatformAdapter = {
  info: YOUTUBE_INFO,
  oauth: new YoutubeOAuth(),
  publisher: new YoutubePublisher(),
};
