import Link from "next/link";
import { Plus, User2 } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { listAvatarVideos } from "@/actions/avatar-video";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AvatarsListPage() {
  const t = await getTranslations("avatars");
  const items = await listAvatarVideos();

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button asChild>
          <Link href="/avatars/new">
            <Plus className="h-4 w-4" /> {t("new")}
          </Link>
        </Button>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <User2 className="h-10 w-10 text-primary" />
            <p className="text-lg font-medium">{t("empty_title")}</p>
            <p className="max-w-md text-sm text-muted-foreground">{t("empty_subtitle")}</p>
            <Button asChild>
              <Link href="/avatars/new">
                <Plus className="h-4 w-4" /> {t("new")}
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((g) => {
            const videoUrl = g.assets.find((a) => a.kind === "VIDEO")?.url;
            return (
              <Link key={g.id} href={`/avatars/${g.id}`} className="group">
                <Card className="h-full overflow-hidden transition-shadow group-hover:shadow-md">
                  <div className="aspect-video w-full bg-muted">
                    {videoUrl ? (
                      <video
                        src={videoUrl}
                        className="h-full w-full object-cover"
                        muted
                        playsInline
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <User2 className="h-8 w-8 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="line-clamp-2 text-base">
                        {g.project?.name ?? t("untitled")}
                      </CardTitle>
                      <StatusBadge status={g.status} />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="line-clamp-2 text-xs text-muted-foreground">{g.prompt}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {g.provider}/{g.model} · {new Date(g.createdAt).toLocaleString()}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
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
