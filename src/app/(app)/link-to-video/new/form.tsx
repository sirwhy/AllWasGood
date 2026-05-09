"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Video } from "lucide-react";

import { startLinkToVideo } from "@/actions/link-to-video";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ProviderOption {
  id: string;
  name: string;
  configured: boolean;
}

interface Props {
  llmProviders: ProviderOption[];
  imageProviders: ProviderOption[];
  ttsProviders: ProviderOption[];
}

const ASPECTS: { value: "16:9" | "9:16" | "1:1"; label: string }[] = [
  { value: "9:16", label: "9:16 (Reels / TikTok / Shorts)" },
  { value: "16:9", label: "16:9 (YouTube)" },
  { value: "1:1", label: "1:1 (Feed)" },
];

export function LinkToVideoForm({ llmProviders, imageProviders, ttsProviders }: Props) {
  const t = useTranslations("link_to_video");
  const [pending, setPending] = useState(false);

  const llmDefault = llmProviders.find((p) => p.configured) ?? llmProviders[0];
  const imageDefault = imageProviders.find((p) => p.configured) ?? imageProviders[0];
  const ttsDefault = ttsProviders.find((p) => p.configured) ?? ttsProviders[0];
  const ready = !!(llmDefault?.configured && imageDefault?.configured && ttsDefault?.configured);

  return (
    <form
      action={async (formData) => {
        setPending(true);
        try {
          await startLinkToVideo(formData);
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
            <Video className="h-4 w-4" /> {t("step_product")}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="productUrl">{t("product_url")}</Label>
            <Input
              id="productUrl"
              name="productUrl"
              type="url"
              required
              placeholder="https://www.tokopedia.com/..."
            />
            <p className="text-xs text-muted-foreground">{t("product_url_hint")}</p>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="language">{t("language")}</Label>
              <select
                id="language"
                name="language"
                defaultValue="id"
                className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
              >
                <option value="id">Bahasa Indonesia</option>
                <option value="en">English</option>
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="aspectRatio">{t("aspect_ratio")}</Label>
              <select
                id="aspectRatio"
                name="aspectRatio"
                defaultValue="9:16"
                className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
              >
                {ASPECTS.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="durationSeconds">{t("duration_seconds")}</Label>
              <Input
                id="durationSeconds"
                name="durationSeconds"
                type="number"
                min={10}
                max={60}
                defaultValue={20}
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="customInstructions">{t("custom_instructions")}</Label>
            <textarea
              id="customInstructions"
              name="customInstructions"
              rows={2}
              placeholder={t("custom_placeholder")}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("step_llm")}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="llmProvider">{t("llm_provider")}</Label>
            <select
              id="llmProvider"
              name="llmProvider"
              defaultValue={llmDefault?.id}
              required
              className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
            >
              {llmProviders.map((p) => (
                <option key={p.id} value={p.id} disabled={!p.configured}>
                  {p.name} {p.configured ? "" : `(${t("not_configured")})`}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="llmModel">{t("llm_model")}</Label>
            <Input
              id="llmModel"
              name="llmModel"
              defaultValue="gpt-4o-mini"
              placeholder="gpt-4o-mini, claude-3-5-haiku, mimo-v2…"
              required
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("step_image")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="imageProvider">{t("image_provider")}</Label>
              <select
                id="imageProvider"
                name="imageProvider"
                defaultValue={imageDefault?.id}
                required
                className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
              >
                {imageProviders.map((p) => (
                  <option key={p.id} value={p.id} disabled={!p.configured}>
                    {p.name} {p.configured ? "" : `(${t("not_configured")})`}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="imageModel">{t("image_model")}</Label>
              <Input
                id="imageModel"
                name="imageModel"
                defaultValue="black-forest-labs/flux-schnell"
                placeholder="black-forest-labs/flux-schnell, dall-e-3…"
                required
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="imageStyle">{t("image_style")}</Label>
            <Input
              id="imageStyle"
              name="imageStyle"
              placeholder={t("image_style_placeholder")}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("step_tts")}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="ttsProvider">{t("tts_provider")}</Label>
            <select
              id="ttsProvider"
              name="ttsProvider"
              defaultValue={ttsDefault?.id}
              required
              className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
            >
              {ttsProviders.map((p) => (
                <option key={p.id} value={p.id} disabled={!p.configured}>
                  {p.name} {p.configured ? "" : `(${t("not_configured")})`}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ttsModel">{t("tts_model")}</Label>
            <Input
              id="ttsModel"
              name="ttsModel"
              defaultValue="tts-1"
              placeholder="tts-1, eleven_multilingual_v2…"
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ttsVoiceId">{t("tts_voice_id")}</Label>
            <Input
              id="ttsVoiceId"
              name="ttsVoiceId"
              placeholder={t("tts_voice_placeholder")}
            />
          </div>
        </CardContent>
      </Card>

      <Button type="submit" disabled={pending || !ready} size="lg">
        {pending ? t("submitting") : t("submit")}
      </Button>
      <p className="text-center text-xs text-muted-foreground">{t("submit_hint")}</p>
    </form>
  );
}
