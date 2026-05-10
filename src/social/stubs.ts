/**
 * Stub adapters for platforms whose OAuth + publish flow we haven't fully
 * wired up yet. They show up in the UI as "configure to enable" so the user
 * knows they exist; attempting to publish throws a clear error.
 */
import type { PlatformAdapter, PlatformInfo } from "./types";

function makeStub(opts: {
  id: PlatformInfo["id"];
  label: string;
  envPrefix: string;
  docsUrl?: string;
  capabilities?: PlatformInfo["capabilities"];
}): PlatformAdapter {
  const requiredEnv = [`${opts.envPrefix}_CLIENT_ID`, `${opts.envPrefix}_CLIENT_SECRET`];
  const configured = requiredEnv.every((e) => !!process.env[e]);
  return {
    info: {
      id: opts.id,
      label: opts.label,
      configured,
      requiredEnv,
      docsUrl: opts.docsUrl,
      capabilities: opts.capabilities ?? ["text", "image", "video"],
    },
    oauth: {
      buildAuthorizeUrl() {
        throw new Error(
          `${opts.label} OAuth not yet implemented in this build — set ${requiredEnv.join(", ")} and add a full adapter.`,
        );
      },
      async exchangeCode() {
        throw new Error(`${opts.label} OAuth callback not yet implemented`);
      },
    },
    publisher: {
      async publish() {
        throw new Error(
          `${opts.label} publishing not yet implemented in this build. ` +
            `OAuth + Content Posting API integration is still pending.`,
        );
      },
    },
  };
}

export const TIKTOK = makeStub({
  id: "TIKTOK",
  label: "TikTok",
  envPrefix: "TIKTOK",
  docsUrl: "https://developers.tiktok.com/doc/login-kit-web/",
  capabilities: ["video"],
});

export const INSTAGRAM = makeStub({
  id: "INSTAGRAM",
  label: "Instagram",
  envPrefix: "INSTAGRAM",
  docsUrl: "https://developers.facebook.com/docs/instagram-api/",
  capabilities: ["image", "video"],
});

export const FACEBOOK = makeStub({
  id: "FACEBOOK",
  label: "Facebook",
  envPrefix: "FACEBOOK",
  docsUrl: "https://developers.facebook.com/docs/pages-api",
});

export const THREADS = makeStub({
  id: "THREADS",
  label: "Threads",
  envPrefix: "THREADS",
  docsUrl: "https://developers.facebook.com/docs/threads",
});
