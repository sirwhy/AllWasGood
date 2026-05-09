import { getTranslations } from "next-intl/server";

import { listProviders } from "@/providers/registry";
import { listCredentialsForCurrentUser } from "@/actions/credentials";
import { ApiKeyForm } from "./api-key-form";
import { ApiKeyList } from "./api-key-list";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export async function ApiKeysSection() {
  const t = await getTranslations("settings.api_keys");
  const providers = listProviders().map((p) => ({
    id: p.id,
    label: p.label,
    capabilities: p.capabilities,
    supportsBaseUrl: p.supportsBaseUrl ?? false,
    apiKeyHelpUrl: p.apiKeyHelpUrl,
    apiKeyPlaceholder: p.apiKeyPlaceholder,
    website: p.website,
  }));
  const credentials = await listCredentialsForCurrentUser();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ApiKeyForm providers={providers} />
        </CardContent>
      </Card>

      <ApiKeyList credentials={credentials} providers={providers} />
    </div>
  );
}
