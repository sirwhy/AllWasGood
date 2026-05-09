import { getTranslations } from "next-intl/server";

import { auth } from "@/lib/auth";
import { listUserCredentials } from "@/lib/credentials";
import { listProviders } from "@/providers/registry";
import { redirect } from "next/navigation";

import { SmartCreationForm } from "./form";

export default async function NewSmartCreationPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  const t = await getTranslations("smart_creation");

  const userCreds = await listUserCredentials(session.user.id);
  const llmProviders = listProviders("llm");
  const imageProviders = listProviders("image");

  // mark which providers the user has set up
  const configuredIds = new Set(userCreds.map((c) => c.provider));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("new_title")}</h1>
        <p className="text-sm text-muted-foreground">{t("new_subtitle")}</p>
      </div>
      <SmartCreationForm
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
      />
    </div>
  );
}
