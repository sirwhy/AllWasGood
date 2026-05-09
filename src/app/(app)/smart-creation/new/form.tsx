"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";

import { startSmartCreation } from "@/actions/smart-creation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

interface ProviderOption {
  id: string;
  name: string;
  configured: boolean;
}

interface Props {
  llmProviders: ProviderOption[];
  imageProviders: ProviderOption[];
}

export function SmartCreationForm({ llmProviders, imageProviders }: Props) {
  const t = useTranslations("smart_creation");
  const [generateImages, setGenerateImages] = useState(false);
  const [pending, setPending] = useState(false);

  return (
    <form
      action={async (formData) => {
        setPending(true);
        try {
          await startSmartCreation(formData);
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
            <Sparkles className="h-4 w-4" /> {t("step_product")}
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("step_copy")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
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
              <Label htmlFor="tone">{t("tone")}</Label>
              <select
                id="tone"
                name="tone"
                defaultValue="casual"
                className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
              >
                <option value="casual">{t("tone_casual")}</option>
                <option value="professional">{t("tone_professional")}</option>
                <option value="playful">{t("tone_playful")}</option>
                <option value="luxury">{t("tone_luxury")}</option>
                <option value="urgent">{t("tone_urgent")}</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="numVariants">{t("num_variants")}</Label>
              <Input id="numVariants" name="numVariants" type="number" defaultValue={3} min={1} max={10} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="audience">{t("audience")}</Label>
              <Input
                id="audience"
                name="audience"
                placeholder={t("audience_placeholder")}
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="customInstructions">{t("custom_instructions")}</Label>
            <Input id="customInstructions" name="customInstructions" placeholder={t("custom_placeholder")} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("step_llm")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="llmProvider">{t("llm_provider")}</Label>
              <select
                id="llmProvider"
                name="llmProvider"
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
                required
                placeholder="gpt-4o-mini, claude-sonnet-4, mimo-v2.5-pro, ..."
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            {t("step_images")}
            <label className="flex items-center gap-2 text-sm font-normal">
              <input
                type="checkbox"
                name="generateImages"
                checked={generateImages}
                onChange={(e) => setGenerateImages(e.target.checked)}
                className="h-4 w-4"
              />
              {t("generate_images")}
            </label>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!generateImages ? (
            <p className="text-sm text-muted-foreground">{t("images_off_hint")}</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="imageProvider">{t("image_provider")}</Label>
                  <select
                    id="imageProvider"
                    name="imageProvider"
                    required={generateImages}
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
                    required={generateImages}
                    placeholder="dall-e-3, black-forest-labs/flux-schnell, ..."
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="numImages">{t("num_images")}</Label>
                  <Input id="numImages" name="numImages" type="number" defaultValue={2} min={0} max={10} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="imageStyle">{t("image_style")}</Label>
                  <Input id="imageStyle" name="imageStyle" placeholder={t("image_style_placeholder")} />
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Separator />

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{t("submit_hint")}</p>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? t("submitting") : t("submit")}
        </Button>
      </div>
    </form>
  );
}
