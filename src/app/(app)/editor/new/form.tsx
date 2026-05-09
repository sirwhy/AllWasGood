"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2, Wand2 } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  aiSuggestTextOverlays,
  createEditorProject,
  type EditorCompositionInput,
} from "@/actions/editor";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface RecentAsset {
  id: string;
  url: string;
  kind: string;
}
interface LlmProvider {
  id: string;
  label: string;
  configured: boolean;
}

interface ClipDraft {
  id: string;
  src: string;
  kind: "image" | "video";
  durationSeconds: number;
  overlay: string;
  overlayPosition: "top" | "center" | "bottom";
}

const ASPECTS: EditorCompositionInput["aspect"][] = ["9:16", "16:9", "1:1", "4:5"];

export function ComposerForm({
  recentAssets,
  llmProviders,
}: {
  recentAssets: RecentAsset[];
  llmProviders: LlmProvider[];
}) {
  const t = useTranslations("editor");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [aspect, setAspect] = useState<EditorCompositionInput["aspect"]>("9:16");
  const [audioSrc, setAudioSrc] = useState("");
  const [audioVolume, setAudioVolume] = useState(0.4);
  const [clips, setClips] = useState<ClipDraft[]>([]);
  const [aiDescription, setAiDescription] = useState("");
  const [aiLanguage, setAiLanguage] = useState<"en" | "id">("en");
  const [llmProvider, setLlmProvider] = useState(llmProviders.find((p) => p.configured)?.id ?? "");
  const [llmModel, setLlmModel] = useState("");
  const [isFilling, setIsFilling] = useState(false);

  function addClip(asset?: RecentAsset) {
    const isVideo = asset
      ? /\.(mp4|webm|mov)(\?|$)/i.test(asset.url) || asset.kind === "VIDEO"
      : false;
    setClips((c) => [
      ...c,
      {
        id: `c${c.length + 1}-${Date.now()}`,
        src: asset?.url ?? "",
        kind: isVideo ? "video" : "image",
        durationSeconds: isVideo ? 0 : 4,
        overlay: "",
        overlayPosition: "bottom",
      },
    ]);
  }

  function updateClip(idx: number, patch: Partial<ClipDraft>) {
    setClips((cs) => cs.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  }

  function removeClip(idx: number) {
    setClips((cs) => cs.filter((_, i) => i !== idx));
  }

  async function handleAiFill() {
    setError(null);
    if (!aiDescription || !llmProvider || !llmModel) {
      setError(t("err_ai_inputs"));
      return;
    }
    setIsFilling(true);
    try {
      const fd = new FormData();
      fd.set("description", aiDescription);
      fd.set("language", aiLanguage);
      fd.set("numClips", String(Math.max(1, clips.length || 3)));
      fd.set("llmProvider", llmProvider);
      fd.set("llmModel", llmModel);
      const overlays = await aiSuggestTextOverlays(fd);
      setClips((cs) => {
        // Make sure clips array is at least the right length so users see the
        // suggestions even on a fresh form.
        const out = [...cs];
        while (out.length < overlays.length) {
          out.push({
            id: `c${out.length + 1}-${Date.now()}`,
            src: "",
            kind: "image",
            durationSeconds: 4,
            overlay: "",
            overlayPosition: "bottom",
          });
        }
        for (let i = 0; i < overlays.length; i++) out[i].overlay = overlays[i];
        return out;
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsFilling(false);
    }
  }

  async function handleSubmit() {
    setError(null);
    if (!clips.length) {
      setError(t("err_no_clips"));
      return;
    }
    const composition: EditorCompositionInput = {
      aspect,
      fps: 30,
      clips: clips
        .filter((c) => c.src.trim())
        .map((c) => ({
          id: c.id,
          src: c.src.trim(),
          kind: c.kind,
          durationSeconds: c.durationSeconds || (c.kind === "image" ? 4 : undefined),
          overlays: c.overlay.trim()
            ? [{ text: c.overlay.trim(), position: c.overlayPosition }]
            : [],
        })),
      audio: audioSrc.trim()
        ? { src: audioSrc.trim(), volume: audioVolume }
        : undefined,
    };
    if (!composition.clips.length) {
      setError(t("err_no_clips"));
      return;
    }
    startTransition(async () => {
      try {
        await createEditorProject({ name: name || "Untitled editor project", composition });
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-4 p-4">
          <label className="text-sm font-medium" htmlFor="name">
            {t("name")}
          </label>
          <input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-md border bg-background p-2 text-sm"
            placeholder={t("name_placeholder")}
          />
          <label className="text-sm font-medium">{t("aspect")}</label>
          <div className="flex flex-wrap gap-2">
            {ASPECTS.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAspect(a)}
                className={`rounded-md border px-3 py-1.5 text-xs ${
                  aspect === a ? "border-primary bg-primary text-primary-foreground" : "bg-background"
                }`}
              >
                {a}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">{t("clips_section")}</h3>
            <Button type="button" size="sm" variant="outline" onClick={() => addClip()}>
              <Plus className="h-4 w-4" /> {t("add_clip")}
            </Button>
          </div>

          {recentAssets.length > 0 ? (
            <div>
              <p className="mb-2 text-xs text-muted-foreground">{t("pick_from_assets")}</p>
              <div className="flex max-h-40 flex-wrap gap-2 overflow-auto">
                {recentAssets.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => addClip(a)}
                    className="h-16 w-16 overflow-hidden rounded border hover:border-primary"
                  >
                    {a.kind === "VIDEO" || /\.(mp4|webm|mov)(\?|$)/i.test(a.url) ? (
                      <div className="flex h-full w-full items-center justify-center bg-muted text-[10px] text-muted-foreground">
                        VID
                      </div>
                    ) : a.kind === "AUDIO" ? (
                      <div className="flex h-full w-full items-center justify-center bg-muted text-[10px] text-muted-foreground">
                        AUD
                      </div>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.url} alt="" className="h-full w-full object-cover" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="space-y-3">
            {clips.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("clips_empty")}</p>
            ) : null}
            {clips.map((c, i) => (
              <Card key={c.id} className="bg-muted/30">
                <CardContent className="grid gap-2 p-3 sm:grid-cols-[1fr_auto]">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>#{i + 1}</span>
                      <select
                        value={c.kind}
                        onChange={(e) =>
                          updateClip(i, { kind: e.target.value as "image" | "video" })
                        }
                        className="rounded border bg-background px-2 py-1 text-xs"
                      >
                        <option value="image">image</option>
                        <option value="video">video</option>
                      </select>
                      <input
                        type="number"
                        min={1}
                        max={60}
                        value={c.durationSeconds || ""}
                        placeholder={c.kind === "video" ? t("dur_optional") : "4"}
                        onChange={(e) =>
                          updateClip(i, { durationSeconds: Number(e.target.value) || 0 })
                        }
                        className="w-20 rounded border bg-background px-2 py-1 text-xs"
                      />
                      <span>s</span>
                    </div>
                    <input
                      value={c.src}
                      onChange={(e) => updateClip(i, { src: e.target.value })}
                      placeholder="https://..."
                      className="w-full rounded border bg-background p-2 text-sm"
                    />
                    <div className="flex gap-2">
                      <input
                        value={c.overlay}
                        onChange={(e) => updateClip(i, { overlay: e.target.value })}
                        placeholder={t("overlay_placeholder")}
                        className="flex-1 rounded border bg-background p-2 text-sm"
                      />
                      <select
                        value={c.overlayPosition}
                        onChange={(e) =>
                          updateClip(i, {
                            overlayPosition: e.target.value as "top" | "center" | "bottom",
                          })
                        }
                        className="rounded border bg-background px-2 py-1 text-xs"
                      >
                        <option value="top">top</option>
                        <option value="center">center</option>
                        <option value="bottom">bottom</option>
                      </select>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeClip(i)}
                    title={t("remove")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3 p-4">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <Wand2 className="h-4 w-4" /> {t("ai_section")}
          </h3>
          <p className="text-xs text-muted-foreground">{t("ai_subtitle")}</p>
          <textarea
            value={aiDescription}
            onChange={(e) => setAiDescription(e.target.value)}
            rows={2}
            className="rounded border bg-background p-2 text-sm"
            placeholder={t("ai_description_placeholder")}
          />
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <select
              value={aiLanguage}
              onChange={(e) => setAiLanguage(e.target.value as "en" | "id")}
              className="rounded border bg-background px-2 py-1 text-xs"
            >
              <option value="en">English</option>
              <option value="id">Bahasa Indonesia</option>
            </select>
            <select
              value={llmProvider}
              onChange={(e) => setLlmProvider(e.target.value)}
              className="rounded border bg-background px-2 py-1 text-xs"
            >
              <option value="">{t("pick_llm")}</option>
              {llmProviders.map((p) => (
                <option key={p.id} value={p.id} disabled={!p.configured}>
                  {p.label}
                  {p.configured ? "" : ` — ${t("not_configured")}`}
                </option>
              ))}
            </select>
            <input
              value={llmModel}
              onChange={(e) => setLlmModel(e.target.value)}
              placeholder={t("model_placeholder")}
              className="rounded border bg-background px-2 py-1 text-xs"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleAiFill}
              disabled={isFilling}
            >
              {isFilling ? t("ai_filling") : t("ai_fill")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3 p-4">
          <h3 className="text-sm font-medium">{t("audio_section")}</h3>
          <input
            value={audioSrc}
            onChange={(e) => setAudioSrc(e.target.value)}
            placeholder={t("audio_placeholder")}
            className="rounded border bg-background p-2 text-sm"
          />
          <label className="text-xs text-muted-foreground">
            {t("audio_volume")}: {audioVolume.toFixed(2)}
          </label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={audioVolume}
            onChange={(e) => setAudioVolume(Number(e.target.value))}
          />
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Button type="button" size="lg" disabled={isPending} onClick={handleSubmit}>
        {isPending ? t("submitting") : t("submit")}
      </Button>
    </div>
  );
}
