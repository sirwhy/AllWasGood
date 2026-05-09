import Link from "next/link";
import { Plus, Send, Trash2, X } from "lucide-react";
import { getTranslations } from "next-intl/server";

import {
  cancelScheduledPost,
  disconnectSocialAccount,
  getPlatformInfos,
  listScheduledPosts,
  listSocialAccounts,
} from "@/actions/publishing";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function PublishingPage() {
  const t = await getTranslations("publishing");
  const [accounts, posts, platforms] = await Promise.all([
    listSocialAccounts(),
    listScheduledPosts(),
    getPlatformInfos(),
  ]);

  return (
    <div className="flex flex-col gap-8 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button asChild disabled={accounts.length === 0}>
          <Link href="/publishing/new">
            <Plus className="h-4 w-4" /> {t("new")}
          </Link>
        </Button>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("accounts_section")}</h2>
        {accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("accounts_empty")}</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {accounts.map((a) => (
              <Card key={a.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">{a.platform}</CardTitle>
                    <form action={disconnectSocialAccount}>
                      <input type="hidden" name="id" value={a.id} />
                      <Button
                        size="sm"
                        variant="ghost"
                        type="submit"
                        title={t("disconnect")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </form>
                  </div>
                  <p className="text-xs text-muted-foreground">{a.username ?? a.externalId}</p>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">
                  {t("connected_at")}: {new Date(a.createdAt).toLocaleString()}
                  {a.expiresAt ? (
                    <>
                      <br />
                      {t("expires_at")}: {new Date(a.expiresAt).toLocaleString()}
                    </>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <div className="rounded-lg border bg-muted/30 p-4">
          <h3 className="mb-2 text-sm font-medium">{t("connect_section")}</h3>
          <div className="flex flex-wrap gap-2">
            {platforms.map((p) => (
              <PlatformConnectButton key={p.id} info={p} />
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("scheduled_section")}</h2>
        {posts.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
              <Send className="h-10 w-10 text-primary" />
              <p className="text-lg font-medium">{t("scheduled_empty_title")}</p>
              <p className="max-w-md text-sm text-muted-foreground">{t("scheduled_empty_subtitle")}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {posts.map((p) => (
              <Card key={p.id}>
                <CardContent className="flex items-start justify-between gap-4 p-4">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge>{p.socialAccount.platform}</Badge>
                      <StatusBadge status={p.status} />
                      <span className="text-xs text-muted-foreground">
                        {new Date(p.scheduledFor).toLocaleString()}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-sm">{p.caption}</p>
                    {p.errorMessage ? (
                      <p className="text-xs text-destructive">{p.errorMessage}</p>
                    ) : null}
                    {p.externalPostId ? (
                      <p className="text-xs text-muted-foreground">
                        {t("external_id")}: {p.externalPostId}
                      </p>
                    ) : null}
                  </div>
                  {p.status === "SCHEDULED" ? (
                    <form action={cancelScheduledPost}>
                      <input type="hidden" name="id" value={p.id} />
                      <Button size="sm" variant="ghost" type="submit" title={t("cancel")}>
                        <X className="h-4 w-4" />
                      </Button>
                    </form>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function PlatformConnectButton({
  info,
}: {
  info: { id: string; label: string; configured: boolean; requiredEnv: string[]; docsUrl?: string };
}) {
  if (!info.configured) {
    return (
      <div
        className="rounded-md border border-dashed bg-background px-3 py-2 text-xs text-muted-foreground"
        title={`Set ${info.requiredEnv.join(", ")} on the server to enable ${info.label}.`}
      >
        <span className="font-medium text-foreground">{info.label}</span>
        <span className="ml-2">— set {info.requiredEnv.join(", ")}</span>
      </div>
    );
  }
  return (
    <Button asChild variant="outline" size="sm">
      <a href={`/api/social/connect/${info.id.toLowerCase()}`}>{info.label}</a>
    </Button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    PUBLISHED: "default",
    PUBLISHING: "secondary",
    SCHEDULED: "outline",
    FAILED: "destructive",
    CANCELED: "outline",
  };
  return (
    <Badge variant={variant[status] ?? "outline"} className="shrink-0">
      {status.toLowerCase()}
    </Badge>
  );
}
