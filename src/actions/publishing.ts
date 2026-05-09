"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { cancelPublishJob, enqueuePublishJob } from "@/lib/queue";
import { listPlatforms } from "@/social/registry";

const inputSchema = z.object({
  socialAccountIds: z.string().min(1), // comma-separated
  caption: z.string().min(1).max(5000),
  hashtags: z.string().optional(),
  assetUrls: z.string().optional(),
  scheduledFor: z.string().min(1),
  title: z.string().optional(),
});

export async function schedulePosts(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");

  const raw = Object.fromEntries(formData.entries());
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error("Invalid input: " + parsed.error.errors.map((e) => e.message).join(", "));
  }
  const input = parsed.data;
  const accountIds = input.socialAccountIds
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!accountIds.length) throw new Error("Pick at least one social account");

  const scheduledFor = new Date(input.scheduledFor);
  if (Number.isNaN(scheduledFor.getTime())) throw new Error("Invalid scheduledFor");

  const hashtags = input.hashtags
    ? input.hashtags
        .split(/\s+|,/)
        .map((h) => h.replace(/^#/, "").trim())
        .filter(Boolean)
    : [];
  const assetUrls = input.assetUrls
    ? input.assetUrls
        .split(/\s+|,|\n/)
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  const accounts = await db.socialAccount.findMany({
    where: { id: { in: accountIds }, userId: session.user.id },
  });
  if (!accounts.length) throw new Error("No matching social accounts found");

  const created: string[] = [];
  for (const account of accounts) {
    const post = await db.scheduledPost.create({
      data: {
        userId: session.user.id,
        socialAccountId: account.id,
        caption: input.caption,
        hashtags,
        assetUrls,
        scheduledFor,
        status: "SCHEDULED",
        ...(input.title ? { title: input.title } : {}),
      },
    });
    await enqueuePublishJob({
      userId: session.user.id,
      scheduledPostId: post.id,
      scheduledFor,
    });
    created.push(post.id);
  }
  revalidatePath("/publishing");
  redirect("/publishing");
}

export async function cancelScheduledPost(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Missing id");
  const post = await db.scheduledPost.findUnique({ where: { id } });
  if (!post || post.userId !== session.user.id) throw new Error("Not found");
  if (post.status !== "SCHEDULED") return; // already published / failed / canceled
  await cancelPublishJob(id).catch(() => undefined);
  await db.scheduledPost.update({
    where: { id },
    data: { status: "CANCELED" },
  });
  revalidatePath("/publishing");
}

export async function listScheduledPosts() {
  const session = await auth();
  if (!session?.user?.id) return [];
  return db.scheduledPost.findMany({
    where: { userId: session.user.id },
    orderBy: { scheduledFor: "desc" },
    take: 100,
    include: {
      socialAccount: { select: { platform: true, username: true } },
    },
  });
}

export async function listSocialAccounts() {
  const session = await auth();
  if (!session?.user?.id) return [];
  return db.socialAccount.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      platform: true,
      username: true,
      externalId: true,
      expiresAt: true,
      createdAt: true,
    },
  });
}

export async function disconnectSocialAccount(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Missing id");
  const acc = await db.socialAccount.findUnique({ where: { id } });
  if (!acc || acc.userId !== session.user.id) throw new Error("Not found");
  await db.socialAccount.delete({ where: { id } });
  revalidatePath("/publishing");
}

export async function getPlatformInfos() {
  return listPlatforms();
}
