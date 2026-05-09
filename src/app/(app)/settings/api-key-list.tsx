"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { deleteCredentialAction } from "@/actions/credentials";
import type { ProviderOption } from "./api-key-form";

interface CredRow {
  id: string;
  provider: string;
  label: string | null;
  baseUrl: string | null;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export function ApiKeyList({ credentials, providers }: { credentials: CredRow[]; providers: ProviderOption[] }) {
  const t = useTranslations("settings.api_keys");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onDelete(id: string) {
    const fd = new FormData();
    fd.set("id", id);
    startTransition(async () => {
      await deleteCredentialAction(fd);
      router.refresh();
    });
  }

  if (credentials.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">{t("no_keys")}</CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-3">
      {credentials.map((c) => {
        const info = providers.find((p) => p.id === c.provider);
        return (
          <Card key={c.id}>
            <CardHeader className="flex-row items-start justify-between space-y-0 pb-3">
              <div>
                <CardTitle className="text-base">
                  {info?.label ?? c.provider}
                  {c.label ? <span className="ml-2 text-sm text-muted-foreground">({c.label})</span> : null}
                </CardTitle>
                <CardDescription>
                  Updated {new Date(c.updatedAt).toLocaleString()}
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="icon"
                disabled={pending}
                onClick={() => onDelete(c.id)}
                aria-label="Delete"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary">key: ••••••</Badge>
              {c.baseUrl ? <Badge variant="outline">base: {c.baseUrl}</Badge> : null}
              {info ? (
                <Badge variant="outline">{info.capabilities.join(" · ")}</Badge>
              ) : null}
              {c.isDefault ? <Badge>default</Badge> : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
