/**
 * Publish worker — handles the BullMQ "publish" queue. Each job ID is the
 * ScheduledPost ID; the job fires at the requested time (set via `delay`),
 * we look up the post + connected social account, decrypt the access token,
 * and call the platform adapter's publisher.
 *
 * Started alongside the generation worker in src/worker/index.ts.
 */
import type { Job } from "bullmq";
import { Worker } from "bullmq";

import { decryptString, encryptString } from "@/lib/crypto";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { QUEUE_NAMES } from "@/lib/queue";
import { createRedisConnection } from "@/lib/redis";
import { getPlatform } from "@/social/registry";
import type { PlatformId } from "@/social/types";

interface PublishJobData {
  scheduledPostId: string;
  userId: string;
}

async function runPublish(job: Job<PublishJobData>) {
  const { scheduledPostId } = job.data;
  console.log(`[publish-worker] firing scheduled post ${scheduledPostId}`);

  const post = await db.scheduledPost.findUnique({
    where: { id: scheduledPostId },
    include: { socialAccount: true },
  });
  if (!post) {
    console.warn(`[publish-worker] post ${scheduledPostId} not found, skipping`);
    return;
  }
  // Allow SCHEDULED (first try) or PUBLISHING (retry of a job that was
  // mid-flight when it threw). Anything terminal (PUBLISHED / CANCELED /
  // FAILED-after-final-retry) is skipped to avoid double-posting.
  if (post.status !== "SCHEDULED" && post.status !== "PUBLISHING") {
    console.log(
      `[publish-worker] post ${scheduledPostId} status=${post.status}, skipping`,
    );
    return;
  }
  await db.scheduledPost.update({
    where: { id: scheduledPostId },
    data: { status: "PUBLISHING" },
  });

  const adapter = getPlatform(post.socialAccount.platform as PlatformId);
  let accessToken = decryptString(post.socialAccount.accessToken);
  let refreshToken = post.socialAccount.refreshToken
    ? decryptString(post.socialAccount.refreshToken)
    : undefined;

  // Refresh if token is expired and platform supports refresh.
  if (
    post.socialAccount.expiresAt &&
    post.socialAccount.expiresAt.getTime() < Date.now() + 60_000 &&
    refreshToken &&
    adapter.oauth.refresh
  ) {
    try {
      const refreshed = await adapter.oauth.refresh({ refreshToken });
      accessToken = refreshed.accessToken;
      if (refreshed.refreshToken) refreshToken = refreshed.refreshToken;
      await db.socialAccount.update({
        where: { id: post.socialAccount.id },
        data: {
          accessToken: encryptString(refreshed.accessToken),
          ...(refreshed.refreshToken
            ? { refreshToken: encryptString(refreshed.refreshToken) }
            : {}),
          expiresAt: refreshed.expiresAt ?? null,
        },
      });
    } catch (e) {
      console.warn(`[publish-worker] refresh failed: ${(e as Error).message}`);
    }
  }

  try {
    const out = await adapter.publisher.publish({
      accessToken,
      refreshToken,
      externalId: post.socialAccount.externalId,
      metadata: (post.socialAccount.metadata ?? {}) as Record<string, unknown>,
      post: {
        caption: post.caption,
        hashtags: post.hashtags,
        assetUrls: post.assetUrls,
        title: post.title ?? undefined,
      },
    });
    await db.scheduledPost.update({
      where: { id: scheduledPostId },
      data: {
        status: "PUBLISHED",
        publishedAt: new Date(),
        externalPostId: out.externalPostId,
        errorMessage: null,
      },
    });
    console.log(`[publish-worker] published ${scheduledPostId} -> ${out.externalPostId}`);
  } catch (e) {
    console.error(`[publish-worker] publish failed for ${scheduledPostId}:`, e);
    // Distinguish transient (will retry) vs final (out of attempts) errors:
    // - On non-final attempts we keep status=PUBLISHING so the BullMQ retry
    //   passes the status guard above.
    // - On the final attempt we mark FAILED so the UI surfaces the failure.
    const totalAttempts = job.opts?.attempts ?? 1;
    const isFinalAttempt = job.attemptsMade + 1 >= totalAttempts;
    await db.scheduledPost.update({
      where: { id: scheduledPostId },
      data: {
        status: isFinalAttempt ? "FAILED" : "PUBLISHING",
        errorMessage: (e as Error).message,
      },
    });
    throw e;
  }
}

export function startPublishWorker(): Worker<PublishJobData> {
  console.log(`[publish-worker] starting (concurrency=${env.WORKER_CONCURRENCY})`);
  const worker = new Worker<PublishJobData>(QUEUE_NAMES.publish, runPublish, {
    connection: createRedisConnection(),
    concurrency: env.WORKER_CONCURRENCY,
  });
  worker.on("failed", (job, err) => {
    console.error(`[publish-worker] job ${job?.id} failed:`, err?.message ?? err);
  });
  worker.on("completed", (job) => {
    console.log(`[publish-worker] job ${job.id} completed`);
  });
  return worker;
}
