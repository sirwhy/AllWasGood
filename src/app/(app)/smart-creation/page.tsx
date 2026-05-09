import Link from "next/link";
import { Plus, Sparkles } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { listSmartCreations } from "@/actions/smart-creation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function SmartCreationListPage() {
  const t = await getTranslations("smart_creation");
  const items = await listSmartCreations();
  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button asChild>
          <Link href="/smart-creation/new">
            <Plus className="h-4 w-4" /> {t("new")}
          </Link>
        </Button>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Sparkles className="h-10 w-10 text-primary" />
            <p className="text-lg font-medium">{t("empty_title")}</p>
            <p className="max-w-md text-sm text-muted-foreground">{t("empty_subtitle")}</p>
            <Button asChild>
              <Link href="/smart-creation/new">
                <Plus className="h-4 w-4" /> {t("new")}
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((g) => {
            const product = g.project?.productData as
              | { title?: string; images?: string[] }
              | null
              | undefined;
            const thumb = product?.images?.[0];
            return (
              <Link key={g.id} href={`/smart-creation/${g.id}`} className="group">
                <Card className="h-full overflow-hidden transition-shadow group-hover:shadow-md">
                  {thumb ? (
                    <div
                      className="aspect-video w-full bg-cover bg-center bg-muted"
                      style={{ backgroundImage: `url(${thumb})` }}
                    />
                  ) : (
                    <div className="flex aspect-video w-full items-center justify-center bg-muted text-muted-foreground">
                      <Sparkles className="h-8 w-8" />
                    </div>
                  )}
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="line-clamp-2 text-base">
                        {product?.title ?? g.project?.name ?? g.prompt}
                      </CardTitle>
                      <StatusBadge status={g.status} />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="line-clamp-1 text-xs text-muted-foreground">
                      {g.project?.productUrl}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {new Date(g.createdAt).toLocaleString()}
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
  return (
    <Badge variant={variant[status] ?? "outline"} className="shrink-0">
      {status.toLowerCase()}
    </Badge>
  );
}
