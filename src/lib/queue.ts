/**
 * BullMQ queues — long-running AI generation jobs run in a separate worker
 * process so the web tier can return quickly. Each queue corresponds to a
 * coarse-grained job category.
 */
import { Queue, type JobsOptions } from "bullmq";

import { db } from "@/lib/db";
import { createRedisConnection } from "@/lib/redis";

export const QUEUE_NAMES = {
  generation: "generation",
  publish: "publish",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

const queueCache = new Map<QueueName, Queue>();

export function getQueue(name: QueueName): Queue {
  if (!queueCache.has(name)) {
    queueCache.set(
      name,
      new Queue(name, {
        connection: createRedisConnection(),
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: "exponential", delay: 5000 },
          removeOnComplete: { count: 1000, age: 60 * 60 * 24 * 7 },
          removeOnFail: { count: 1000, age: 60 * 60 * 24 * 14 },
        },
      }),
    );
  }
  return queueCache.get(name)!;
}

export interface EnqueueGenerationOptions {
  userId: string;
  type: string; // "image.generate" | "video.generate" | "avatar.generate" | "tts.generate" | "stt.transcribe" | "llm.generate"
  payload: Record<string, unknown>;
  generationId?: string;
  jobOptions?: JobsOptions;
}

export interface EnqueuePublishOptions {
  userId: string;
  scheduledPostId: string;
  /** Absolute time the post should fire. */
  scheduledFor: Date;
  jobOptions?: JobsOptions;
}

export async function enqueuePublishJob(opts: EnqueuePublishOptions) {
  const queue = getQueue(QUEUE_NAMES.publish);
  const delay = Math.max(0, opts.scheduledFor.getTime() - Date.now());
  return queue.add(
    "publish-post",
    { scheduledPostId: opts.scheduledPostId, userId: opts.userId },
    { jobId: opts.scheduledPostId, delay, ...opts.jobOptions },
  );
}

export async function cancelPublishJob(scheduledPostId: string) {
  const queue = getQueue(QUEUE_NAMES.publish);
  const job = await queue.getJob(scheduledPostId);
  if (job) await job.remove();
}

export async function enqueueGenerationJob(opts: EnqueueGenerationOptions) {
  const job = await db.job.create({
    data: {
      userId: opts.userId,
      queue: QUEUE_NAMES.generation,
      type: opts.type,
      payload: opts.payload as object,
      status: "QUEUED",
    },
  });
  const queue = getQueue(QUEUE_NAMES.generation);
  const bullJob = await queue.add(
    opts.type,
    {
      jobId: job.id,
      generationId: opts.generationId,
      userId: opts.userId,
      payload: opts.payload,
    },
    {
      jobId: job.id,
      ...opts.jobOptions,
    },
  );
  await db.job.update({
    where: { id: job.id },
    data: { bullJobId: bullJob.id ?? null },
  });
  return job;
}
