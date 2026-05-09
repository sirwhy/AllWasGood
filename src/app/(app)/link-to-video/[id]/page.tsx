import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Download, ExternalLink, Loader2, RefreshCw, Video as VideoIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

interface Scene {
  id: string;
  narration: string;
  image_prompt: string;
  duration_seconds: number;
}

interface LinkToVideoOutputs {
  kind: string;
  product?: {
    title?: string;
    images?: string[];
    price?: string;
    currency?: string;
    brand?: string;
    url?: string;
  };
  storyboard?: {
    title?: string;
    hook?: string;
    cta?: string;
    scenes?: Scene[];
  };
  video?: { url?: string; contentType?: string };
  sceneImages?: { url: string }[];
  sceneAudios?: { url: string }[];
}

export default async function LinkToVideoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  const t = await getTranslations("link_to_video");

  const generation = await db.generation.findUnique({
    where: { id },
    include: {
      project: true,
      assets: {
        select: { id: true, url: true, kind: true, mimeType: true, metadata: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!generation || generation.userId !== session.user.id) notFound();

  const isRunning = ["PENDING", "QUEUED", "RUNNING"].includes(generation.status);
  const outputs = (generation.outputs as LinkToVideoOutputs | null) ?? null;
  const product = outputs?.product;
  const storyboard = outputs?.storyboard;
  const params_ = (generation.parameters as Record<string, unknown> | null) ?? null;
  const videoAsset = generation.assets.find((a) => a.kind === "VIDEO");
  const sceneImages = sortBySceneIndex(generation.assets.filter((a) => a.kind === "IMAGE"));
  const sceneAudios = sortBySceneIndex(generation.assets.filter((a) => a.kind === "AUDIO"));

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/link-to-video">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {storyboard?.title ?? product?.title ?? generation.project?.name ?? t("untitled")}
            </h1>
            {generation.project?.productUrl ? (
              <a
                href={generation.project.productUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="h-3 w-3" />
                {generation.project.productUrl}
              </a>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={generation.status} />
          {isRunning ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/link-to-video/${generation.id}`}>
                <RefreshCw className="h-4 w-4" /> {t("refresh")}
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      {isRunning ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-lg font-medium">{t("running_title")}</p>
            <p className="max-w-md text-sm text-muted-foreground">{t("running_subtitle")}</p>
            <Button variant="outline" asChild>
              <Link href={`/link-to-video/${generation.id}`}>{t("refresh")}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : generation.status === "FAILED" ? (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-base">{t("failed_title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-muted p-3 text-xs">
              {generation.errorMessage ?? "Unknown error"}
            </pre>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
          <div className="flex flex-col gap-4">
            {videoAsset ? (
              <Card className="overflow-hidden">
                <video
                  src={videoAsset.url}
                  controls
                  preload="metadata"
                  className="aspect-[9/16] w-full bg-black"
                />
                <CardContent className="flex flex-col gap-2 pt-3">
                  <Button asChild>
                    <a href={videoAsset.url} download>
                      <Download className="h-4 w-4" /> {t("download")}
                    </a>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
                  <VideoIcon className="h-8 w-8" /> {t("no_video")}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("details")}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                <DetailRow label={t("language")} value={String(params_?.language ?? "")} />
                <DetailRow
                  label={t("aspect_ratio")}
                  value={String(params_?.aspectRatio ?? "")}
                />
                <DetailRow
                  label={t("duration_seconds")}
                  value={String(params_?.durationSeconds ?? "")}
                />
                <Separator />
                <DetailRow label={t("llm_provider")} value={generation.provider} />
                <DetailRow label={t("llm_model")} value={generation.model} />
                <DetailRow
                  label={t("image_provider")}
                  value={String(params_?.imageProvider ?? "")}
                />
                <DetailRow label={t("image_model")} value={String(params_?.imageModel ?? "")} />
                <DetailRow
                  label={t("tts_provider")}
                  value={String(params_?.ttsProvider ?? "")}
                />
                <DetailRow label={t("tts_model")} value={String(params_?.ttsModel ?? "")} />
                {params_?.ttsVoiceId ? (
                  <DetailRow
                    label={t("tts_voice_id")}
                    value={String(params_.ttsVoiceId)}
                  />
                ) : null}
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("storyboard_section")}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {storyboard?.hook ? (
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">
                      {t("hook")}
                    </p>
                    <p className="text-sm">{storyboard.hook}</p>
                  </div>
                ) : null}
                <div className="flex flex-col gap-3">
                  {(storyboard?.scenes ?? []).map((scene, i) => {
                    const img = sceneImages[i];
                    const aud = sceneAudios[i];
                    return (
                      <div
                        key={scene.id}
                        className="flex gap-3 rounded-md border p-3"
                      >
                        {img ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={img.url}
                            alt={`scene ${i + 1}`}
                            className="h-24 w-24 shrink-0 rounded-md object-cover"
                          />
                        ) : (
                          <div className="h-24 w-24 shrink-0 rounded-md bg-muted" />
                        )}
                        <div className="flex flex-1 flex-col gap-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{scene.id}</Badge>
                            <span className="text-xs text-muted-foreground">
                              {scene.duration_seconds}s
                            </span>
                          </div>
                          <p className="text-sm">{scene.narration}</p>
                          {aud ? (
                            <audio src={aud.url} controls className="h-8 w-full" />
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {storyboard?.cta ? (
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">
                      {t("cta")}
                    </p>
                    <p className="text-sm">{storyboard.cta}</p>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="text-right text-sm">{value}</span>
    </div>
  );
}

function sortBySceneIndex<T extends { metadata: unknown }>(assets: T[]): T[] {
  // Tagged in the worker with metadata.sceneIndex; fall back to insertion
  // order when older rows don't have the tag.
  return [...assets].sort((a, b) => {
    const ai = (a.metadata as { sceneIndex?: number } | null)?.sceneIndex;
    const bi = (b.metadata as { sceneIndex?: number } | null)?.sceneIndex;
    if (typeof ai === "number" && typeof bi === "number") return ai - bi;
    if (typeof ai === "number") return -1;
    if (typeof bi === "number") return 1;
    return 0;
  });
}

function StatusBadge({ status }: { status: string }) {
  const variant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    SUCCEEDED: "default",
    RUNNING: "secondary",
    QUEUED: "outline",
    PENDING: "outline",
    FAILED: "destructive",
    CANCELED: "outline",
  };
  return (
    <Badge variant={variant[status] ?? "outline"} className="shrink-0">
      {status.toLowerCase()}
    </Badge>
  );
}
