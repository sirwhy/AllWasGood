import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { auth } from "@/lib/auth";
import { listUserCredentials } from "@/lib/credentials";
import { listProviders } from "@/providers/registry";

import { LinkToVideoForm } from "./form";

export default async function NewLinkToVideoPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  const t = await getTranslations("link_to_video");

  const userCreds = await listUserCredentials(session.user.id);
  const llmProviders = listProviders("llm");
  const imageProviders = listProviders("image");
  const ttsProviders = listProviders("tts");
  const configuredIds = new Set(userCreds.map((c) => c.provider));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("new_title")}</h1>
        <p className="text-sm text-muted-foreground">{t("new_subtitle")}</p>
      </div>
      <LinkToVideoForm
        llmProviders={llmProviders.map((p) => ({
          id: p.id,
          name: p.label,
          configured: configuredIds.has(p.id),
        }))}
        imageProviders={imageProviders.map((p) => ({
          id: p.id,
          name: p.label,
          configured: configuredIds.has(p.id),
        }))}
        ttsProviders={ttsProviders.map((p) => ({
          id: p.id,
          name: p.label,
          configured: configuredIds.has(p.id),
        }))}
      />
    </div>
  );
}
