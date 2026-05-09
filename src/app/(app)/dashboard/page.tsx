import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Sparkles, ImageIcon, Video, User2, Send, Settings } from "lucide-react";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function DashboardPage() {
  const session = await auth();
  const userId = session!.user.id;

  const [tCommon, tDash, tNav] = await Promise.all([
    getTranslations("common"),
    getTranslations("dashboard"),
    getTranslations("nav"),
  ]);

  const recent = await db.generation.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 6,
  });
  const credentials = await db.credential.findMany({
    where: { userId },
    select: { id: true, provider: true },
  });

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{tDash("title")}, {session!.user.name ?? session!.user.email}</h1>
        <p className="text-muted-foreground">{tDash("subtitle")}</p>
      </div>

      {credentials.length === 0 ? (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Get started — connect your first AI provider
            </CardTitle>
            <CardDescription>
              All features below need at least one provider API key. Bring your own from OpenAI, Anthropic,
              Google Gemini, Replicate, fal.ai, ElevenLabs, HeyGen, Xiaomi MiMo, or any OpenAI-compatible
              gateway (9router, OpenRouter, vLLM, …).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/settings"
              className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Open Settings → API Keys
            </Link>
          </CardContent>
        </Card>
      ) : null}

      <section>
        <h2 className="mb-3 text-lg font-semibold">{tDash("quick_actions")}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <QuickAction icon={Sparkles} title={tNav("smart_creation")} description="Link → marketing copy + visuals" href="/smart-creation" disabled={credentials.length === 0} />
          <QuickAction icon={ImageIcon} title={tNav("image_agent")} description="Product posters, social posts" disabled />
          <QuickAction icon={Video} title={tNav("video_agent")} description="Text/link → marketing video" disabled />
          <QuickAction icon={User2} title={tNav("avatars")} description="Talking-head AI avatars" disabled />
          <QuickAction icon={Send} title={tNav("publishing")} description="Auto-post to social" href="/publishing" />
          <QuickAction icon={Settings} title={tNav("settings")} description="Add API keys, brand kit" href="/settings" />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">{tDash("recent_generations")}</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">{tDash("no_generations")}</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recent.map((g) => (
              <Card key={g.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">{g.type}</CardTitle>
                    <Badge variant={g.status === "SUCCEEDED" ? "default" : g.status === "FAILED" ? "destructive" : "secondary"}>
                      {g.status}
                    </Badge>
                  </div>
                  <CardDescription className="line-clamp-2">{g.prompt}</CardDescription>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">
                  {g.provider}/{g.model} · {new Date(g.createdAt).toLocaleString()}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        {tCommon("save") /* keep tCommon ref for tree-shake-friendly compilation */ ? null : null}
      </section>
    </div>
  );
}

function QuickAction({
  icon: Icon,
  title,
  description,
  href,
  disabled,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  href?: string;
  disabled?: boolean;
}) {
  const inner = (
    <Card className={disabled ? "opacity-60" : "transition-shadow hover:shadow-md"}>
      <CardHeader>
        <div className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </Card>
  );
  if (disabled || !href) return inner;
  return <Link href={href}>{inner}</Link>;
}
