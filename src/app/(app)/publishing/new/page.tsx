import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { listSocialAccounts } from "@/actions/publishing";
import { ScheduleForm } from "./form";

export default async function NewPublishingPage() {
  const t = await getTranslations("publishing");
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  const accounts = await listSocialAccounts();
  if (!accounts.length) redirect("/publishing");

  // Show the user's recent assets so they can pick from prior generations.
  const recentAssets = await db.asset.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 24,
    select: { id: true, url: true, kind: true, createdAt: true },
  });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("new_title")}</h1>
        <p className="text-sm text-muted-foreground">{t("new_subtitle")}</p>
      </div>
      <ScheduleForm
        accounts={accounts.map((a) => ({
          id: a.id,
          platform: a.platform,
          username: a.username,
        }))}
        recentAssets={recentAssets.map((a) => ({
          id: a.id,
          url: a.url,
          kind: a.kind,
        }))}
      />
    </div>
  );
}
