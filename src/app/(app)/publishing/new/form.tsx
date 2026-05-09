"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { schedulePosts } from "@/actions/publishing";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface AccountOption {
  id: string;
  platform: string;
  username: string | null;
}
interface AssetOption {
  id: string;
  url: string;
  kind: string;
}

export function ScheduleForm({
  accounts,
  recentAssets,
}: {
  accounts: AccountOption[];
  recentAssets: AssetOption[];
}) {
  const t = useTranslations("publishing");
  const [isPending, startTransition] = useTransition();
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set());
  const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set());
  const [extraUrls, setExtraUrls] = useState("");
  const [error, setError] = useState<string | null>(null);

  const defaultDateTime = useMemo(() => {
    const d = new Date(Date.now() + 30 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }, []);

  const assetUrlMap = useMemo(
    () => new Map(recentAssets.map((a) => [a.id, a.url])),
    [recentAssets],
  );

  function toggle<T>(set: Set<T>, val: T): Set<T> {
    const next = new Set(set);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    return next;
  }

  async function handleSubmit(formData: FormData) {
    setError(null);
    if (!selectedAccounts.size) {
      setError(t("err_no_account"));
      return;
    }
    const pickedUrls = [...selectedAssets].map((id) => assetUrlMap.get(id)).filter(Boolean) as string[];
    const allUrls = [...pickedUrls, ...extraUrls.split(/\s+|\n/).map((s) => s.trim()).filter(Boolean)].join("\n");
    formData.set("socialAccountIds", [...selectedAccounts].join(","));
    formData.set("assetUrls", allUrls);
    // The <input type="datetime-local"> emits a TZ-naive string. Parse it
    // here (in the browser, which interprets it in the user's local zone)
    // and forward as a UTC ISO so the server can compute the correct
    // BullMQ delay regardless of where it runs (Railway containers are
    // typically UTC).
    const local = formData.get("scheduledFor");
    if (typeof local === "string" && local) {
      const dt = new Date(local);
      if (!Number.isNaN(dt.getTime())) {
        formData.set("scheduledFor", dt.toISOString());
      }
    }
    startTransition(async () => {
      try {
        await schedulePosts(formData);
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-6">
      <Card>
        <CardContent className="space-y-4 p-4">
          <h3 className="text-sm font-medium">{t("step_accounts")}</h3>
          <div className="flex flex-wrap gap-2">
            {accounts.map((a) => {
              const active = selectedAccounts.has(a.id);
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setSelectedAccounts(toggle(selectedAccounts, a.id))}
                  className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "bg-background hover:bg-accent"
                  }`}
                >
                  {a.platform}
                  {a.username ? ` · @${a.username}` : ""}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <label className="text-sm font-medium" htmlFor="caption">
            {t("caption")}
          </label>
          <textarea
            name="caption"
            id="caption"
            required
            rows={5}
            className="w-full rounded-md border bg-background p-3 text-sm"
            placeholder={t("caption_placeholder")}
          />
          <label className="text-sm font-medium" htmlFor="hashtags">
            {t("hashtags")}
          </label>
          <input
            name="hashtags"
            id="hashtags"
            className="w-full rounded-md border bg-background p-2 text-sm"
            placeholder="ai marketing pippit"
          />
          <label className="text-sm font-medium" htmlFor="title">
            {t("title_field")}
          </label>
          <input
            name="title"
            id="title"
            className="w-full rounded-md border bg-background p-2 text-sm"
            placeholder={t("title_placeholder")}
          />
        </CardContent>
      </Card>

      {recentAssets.length > 0 ? (
        <Card>
          <CardContent className="space-y-3 p-4">
            <h3 className="text-sm font-medium">{t("step_assets")}</h3>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
              {recentAssets.map((a) => {
                const active = selectedAssets.has(a.id);
                const isVideo = /\.(mp4|webm|mov)(\?|$)/i.test(a.url) || a.kind === "VIDEO";
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setSelectedAssets(toggle(selectedAssets, a.id))}
                    className={`relative aspect-square overflow-hidden rounded-md border-2 transition-colors ${
                      active ? "border-primary" : "border-transparent hover:border-border"
                    }`}
                  >
                    {isVideo ? (
                      <div className="flex h-full w-full items-center justify-center bg-muted text-xs text-muted-foreground">
                        Video
                      </div>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.url} alt="" className="h-full w-full object-cover" />
                    )}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="space-y-3 p-4">
          <label className="text-sm font-medium" htmlFor="extraUrls">
            {t("extra_urls")}
          </label>
          <textarea
            id="extraUrls"
            rows={2}
            value={extraUrls}
            onChange={(e) => setExtraUrls(e.target.value)}
            className="w-full rounded-md border bg-background p-2 text-sm"
            placeholder="https://..."
          />
          <label className="text-sm font-medium" htmlFor="scheduledFor">
            {t("scheduled_for")}
          </label>
          <input
            type="datetime-local"
            id="scheduledFor"
            name="scheduledFor"
            required
            defaultValue={defaultDateTime}
            className="w-full rounded-md border bg-background p-2 text-sm"
          />
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Button type="submit" disabled={isPending} size="lg">
        {isPending ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}
