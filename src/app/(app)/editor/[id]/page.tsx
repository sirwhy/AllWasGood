import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Download, Loader2, RefreshCw } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface EditorOutputs {
  kind?: string;
  video?: { url?: string; contentType?: string };
  composition?: {
    aspect?: string;
    clips?: { id: string; src: string; kind: string; overlays?: { text: string }[] }[];
  };
}

export default async function EditorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  const t = await getTranslations("editor");

  const generation = await db.generation.findUnique({
    where: { id },
    include: {
      project: true,
      assets: {
        select: { id: true, url: true, kind: true, mimeType: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!generation || generation.userId !== session.user.id) notFound();

  const isRunning = ["PENDING", "QUEUED", "RUNNING"].includes(generation.status);
  const outputs = (generation.outputs as EditorOutputs | null) ?? null;
  const composition = outputs?.composition;
  const videoAsset = generation.assets.find((a) => a.kind === "VIDEO");
  const aspectClass = aspectClassFor(composition?.aspect);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/editor">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {generation.project?.name ?? generation.prompt ?? t("untitled")}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={generation.status} />
          {isRunning ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/editor/${generation.id}`}>
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
              <Link href={`/editor/${generation.id}`}>{t("refresh")}</Link>
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
        <div className="grid gap-6 lg:grid-cols-[480px_1fr]">
          <div className="flex flex-col gap-3">
            {videoAsset ? (
              <Card className="overflow-hidden">
                <video
                  src={videoAsset.url}
                  controls
                  preload="metadata"
                  className={`${aspectClass} w-full bg-black`}
                />
                <CardContent className="pt-3">
                  <Button asChild>
                    <a href={videoAsset.url} download>
                      <Download className="h-4 w-4" /> {t("download")}
                    </a>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  {t("no_video")}
                </CardContent>
              </Card>
            )}
          </div>
          {composition ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("composition_section")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="text-xs text-muted-foreground">
                  {t("aspect")}: {composition.aspect}
                </p>
                <div className="space-y-2">
                  {(composition.clips ?? []).map((c, i) => (
                    <div
                      key={c.id}
                      className="flex items-center gap-2 rounded border bg-muted/30 p-2 text-xs"
                    >
                      <span className="text-muted-foreground">#{i + 1}</span>
                      <span className="rounded bg-background px-2 py-0.5">{c.kind}</span>
                      <span className="line-clamp-1 flex-1 font-mono">{c.src}</span>
                      {(c.overlays ?? []).slice(0, 1).map((o, j) => (
                        <span key={j} className="rounded bg-primary/10 px-2 py-0.5 text-primary">
                          {o.text}
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      )}
    </div>
  );
}

function aspectClassFor(raw: string | undefined): string {
  switch (raw) {
    case "16:9":
      return "aspect-video";
    case "1:1":
      return "aspect-square";
    case "4:5":
      return "aspect-[4/5]";
    case "9:16":
    default:
      return "aspect-[9/16]";
  }
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
