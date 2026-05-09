import { getTranslations } from "next-intl/server";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiKeysSection } from "./api-keys-section";

export default async function SettingsPage() {
  const t = await getTranslations("settings");
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>

      <Tabs defaultValue="api_keys" className="space-y-4">
        <TabsList>
          <TabsTrigger value="api_keys">{t("tabs.api_keys")}</TabsTrigger>
          <TabsTrigger value="brand_kit" disabled>{t("tabs.brand_kit")}</TabsTrigger>
          <TabsTrigger value="profile" disabled>{t("tabs.profile")}</TabsTrigger>
        </TabsList>

        <TabsContent value="api_keys">
          <ApiKeysSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
