import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { listProviders } from "@/providers/registry";
import { ComposerForm } from "./form";

export default async function NewEditorPage() {
  const t = await getTranslations("editor");
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const [credentials, recentAssets] = await Promise.all([
    db.credential.findMany({
      where: { userId: session.user.id },
      select: { provider: true, label: true },
    }),
    db.asset.findMany({
      where: { userId: session.user.id, kind: { in: ["IMAGE", "VIDEO", "AUDIO"] } },
      orderBy: { createdAt: "desc" },
      take: 60,
      select: { id: true, url: true, kind: true, mimeType: true, createdAt: true },
    }),
  ]);

  const llmProviders = listProviders("llm");

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("new_title")}</h1>
        <p className="text-sm text-muted-foreground">{t("new_subtitle")}</p>
      </div>
      <ComposerForm
        recentAssets={recentAssets.map((a) => ({
          id: a.id,
          url: a.url,
          kind: a.kind,
        }))}
        llmProviders={llmProviders.map((p) => ({
          id: p.id,
          label: p.label,
          configured: credentials.some((c) => c.provider === p.id),
        }))}
      />
    </div>
  );
}
