import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Download, Loader2, RefreshCw } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AvatarVideoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  const t = await getTranslations("avatars");

  const generation = await db.generation.findUnique({
    where: { id },
    include: { project: true, assets: true },
  });
  if (!generation || generation.userId !== session.user.id) notFound();

  const isRunning = ["PENDING", "QUEUED", "RUNNING"].includes(generation.status);
  const videoAsset = generation.assets.find((a) => a.kind === "VIDEO");
  const params2 = generation.parameters as
    | { aspectRatio?: string; avatarId?: string; avatarPhotoUrl?: string; voiceId?: string; language?: string }
    | null;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/avatars">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {generation.project?.name ?? t("untitled")}
            </h1>
            <p className="text-xs text-muted-foreground">
              {generation.provider}/{generation.model} · {new Date(generation.createdAt).toLocaleString()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={generation.status} />
          {isRunning ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/avatars/${generation.id}`}>
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
              <Link href={`/avatars/${generation.id}`}>{t("refresh")}</Link>
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
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <Card>
            <CardContent className="flex flex-col gap-3 p-3">
              {videoAsset ? (
                <>
                  <video
                    src={videoAsset.url}
                    controls
                    playsInline
                    className="w-full rounded-md bg-black"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <a href={videoAsset.url} download target="_blank" rel="noreferrer">
                        <Download className="h-4 w-4" /> {t("download")}
                      </a>
                    </Button>
                  </div>
                </>
              ) : (
                <p className="p-6 text-center text-sm text-muted-foreground">{t("no_video")}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("details")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <DetailRow label={t("aspect_ratio")} value={params2?.aspectRatio} />
              <DetailRow label={t("language")} value={params2?.language} />
              {params2?.avatarId ? <DetailRow label={t("avatar_id")} value={params2.avatarId} mono /> : null}
              {params2?.voiceId ? <DetailRow label={t("voice_id")} value={params2.voiceId} mono /> : null}
              <div className="mt-2 flex flex-col gap-1">
                <span className="text-xs uppercase tracking-wider text-muted-foreground">
                  {t("script")}
                </span>
                <p className="rounded bg-muted p-2 text-sm">{generation.prompt}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={mono ? "truncate text-right font-mono text-xs" : "text-right"}>{value}</span>
    </div>
  );
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
  return <Badge variant={variant[status] ?? "outline"}>{status.toLowerCase()}</Badge>;
}
