"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, User2 } from "lucide-react";

import { startAvatarVideo } from "@/actions/avatar-video";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ModelOption {
  id: string;
  label: string;
}

interface ProviderOption {
  id: string;
  name: string;
  configured: boolean;
  models: ModelOption[];
}

interface AvatarPickerEntry {
  id: string;
  name?: string;
  preview?: string;
  gender?: string;
}

interface VoiceEntry {
  id: string;
  name?: string;
  language?: string;
  gender?: string;
  preview?: string;
}

export function AvatarVideoForm({ providers }: { providers: ProviderOption[] }) {
  const t = useTranslations("avatars");
  const firstConfigured = providers.find((p) => p.configured) ?? providers[0];
  const [provider, setProvider] = useState(firstConfigured?.id ?? "");
  const [pending, setPending] = useState(false);

  const [avatars, setAvatars] = useState<AvatarPickerEntry[]>([]);
  const [voices, setVoices] = useState<VoiceEntry[]>([]);
  const [loadingPickers, setLoadingPickers] = useState(false);

  useEffect(() => {
    if (!provider) return;
    setLoadingPickers(true);
    Promise.all([
      fetch(`/api/avatar-providers/${provider}/avatars`).then((r) => r.json()).catch(() => []),
      fetch(`/api/avatar-providers/${provider}/voices`).then((r) => r.json()).catch(() => []),
    ])
      .then(([a, v]) => {
        setAvatars(Array.isArray(a) ? a : []);
        setVoices(Array.isArray(v) ? v : []);
      })
      .finally(() => setLoadingPickers(false));
  }, [provider]);

  const providerEntry = providers.find((p) => p.id === provider);
  const requiresPhoto = provider === "did";

  return (
    <form
      action={async (formData) => {
        setPending(true);
        try {
          await startAvatarVideo(formData);
        } catch (e) {
          setPending(false);
          alert((e as Error).message);
        }
      }}
      className="flex flex-col gap-6"
    >
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <User2 className="h-4 w-4" /> {t("step_script")}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">{t("name")}</Label>
            <Input id="name" name="name" placeholder={t("name_placeholder")} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="text">{t("script")}</Label>
            <textarea
              id="text"
              name="text"
              required
              rows={6}
              className="rounded-md border border-input bg-background p-3 text-sm"
              placeholder={t("script_placeholder")}
            />
            <p className="text-xs text-muted-foreground">{t("script_hint")}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("step_provider")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="provider">{t("provider")}</Label>
              <select
                id="provider"
                name="provider"
                required
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
              >
                {providers.map((p) => (
                  <option key={p.id} value={p.id} disabled={!p.configured}>
                    {p.name} {p.configured ? "" : `(${t("not_configured")})`}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="model">{t("model")}</Label>
              <select
                id="model"
                name="model"
                required
                className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
              >
                {(providerEntry?.models ?? []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="aspectRatio">{t("aspect_ratio")}</Label>
              <select
                id="aspectRatio"
                name="aspectRatio"
                defaultValue="16:9"
                className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
              >
                <option value="16:9">16:9 (landscape)</option>
                <option value="9:16">9:16 (vertical / Reels / TikTok)</option>
                <option value="1:1">1:1 (square)</option>
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="language">{t("language")}</Label>
              <Input id="language" name="language" placeholder="id, en, en-US, ..." />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2 text-base">
            {t("step_avatar")}
            {loadingPickers ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {requiresPhoto ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="avatarPhotoUrl">{t("avatar_photo_url")}</Label>
              <Input
                id="avatarPhotoUrl"
                name="avatarPhotoUrl"
                type="url"
                required
                placeholder="https://example.com/photo.jpg"
              />
              <p className="text-xs text-muted-foreground">{t("avatar_photo_url_hint")}</p>
            </div>
          ) : avatars.length ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="avatarId">{t("avatar_id")}</Label>
              <select
                id="avatarId"
                name="avatarId"
                required
                className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
              >
                <option value="">{t("avatar_pick")}</option>
                {avatars.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name ?? a.id} {a.gender ? `(${a.gender})` : ""}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">{t("avatar_id_hint_with_picker")}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Label htmlFor="avatarId">{t("avatar_id")}</Label>
              <Input id="avatarId" name="avatarId" required placeholder="avatar id from your provider" />
              <p className="text-xs text-muted-foreground">{t("avatar_id_hint")}</p>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="voiceId">{t("voice_id")}</Label>
            {voices.length ? (
              <select
                id="voiceId"
                name="voiceId"
                className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
              >
                <option value="">{t("voice_default")}</option>
                {voices.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name ?? v.id}
                    {v.language ? ` — ${v.language}` : ""}
                    {v.gender ? ` (${v.gender})` : ""}
                  </option>
                ))}
              </select>
            ) : (
              <Input id="voiceId" name="voiceId" placeholder={t("voice_placeholder")} />
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{t("submit_hint")}</p>
        <Button type="submit" size="lg" disabled={pending || !providerEntry?.configured}>
          {pending ? t("submitting") : t("submit")}
        </Button>
      </div>
    </form>
  );
}
