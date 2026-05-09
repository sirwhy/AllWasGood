"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { saveCredentialAction } from "@/actions/credentials";

export interface ProviderOption {
  id: string;
  label: string;
  capabilities: string[];
  supportsBaseUrl: boolean;
  apiKeyHelpUrl?: string;
  apiKeyPlaceholder?: string;
  website?: string;
}

export function ApiKeyForm({ providers }: { providers: ProviderOption[] }) {
  const t = useTranslations("settings.api_keys");
  const router = useRouter();
  const [provider, setProvider] = useState(providers[0]?.id ?? "openai");
  const [pending, startTransition] = useTransition();
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const selected = providers.find((p) => p.id === provider);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSavedMsg(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await saveCredentialAction(fd);
        setSavedMsg(t("saved"));
        (e.target as HTMLFormElement).reset();
        router.refresh();
      } catch (err) {
        setSavedMsg((err as Error).message);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="provider">{t("provider")}</Label>
        <Select name="provider" value={provider} onValueChange={setProvider}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {providers.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.label} <span className="ml-2 text-xs text-muted-foreground">({p.capabilities.join(", ")})</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <input type="hidden" name="provider" value={provider} />
        {selected?.apiKeyHelpUrl ? (
          <p className="text-xs text-muted-foreground">
            Get a key:{" "}
            <a className="underline" href={selected.apiKeyHelpUrl} target="_blank" rel="noreferrer">
              {selected.apiKeyHelpUrl}
            </a>
          </p>
        ) : null}
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="label">{t("label")}</Label>
          <Input id="label" name="label" placeholder="e.g. work" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="apiKey">{t("api_key")}</Label>
          <Input
            id="apiKey"
            name="apiKey"
            type="password"
            required
            placeholder={selected?.apiKeyPlaceholder ?? "your API key"}
          />
        </div>
      </div>

      {selected?.supportsBaseUrl ? (
        <div className="grid gap-2">
          <Label htmlFor="baseUrl">{t("base_url")}</Label>
          <Input
            id="baseUrl"
            name="baseUrl"
            type="url"
            placeholder="https://9router.example.com/v1"
          />
          <p className="text-xs text-muted-foreground">{t("base_url_hint")}</p>
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "…" : t("save")}
        </Button>
        {savedMsg ? <span className="text-sm text-muted-foreground">{savedMsg}</span> : null}
      </div>
    </form>
  );
}
