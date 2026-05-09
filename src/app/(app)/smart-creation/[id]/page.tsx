import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

import { CopyButton } from "./copy-button";

interface CopyVariant {
  id: string;
  hook: string;
  caption: string;
  cta: string;
  hashtags: string[];
  platform_hint: string;
}

interface SmartCreationOutputs {
  kind: string;
  product?: {
    title?: string;
    description?: string;
    images?: string[];
    price?: string;
    currency?: string;
    brand?: string;
    url?: string;
  };
  variants?: CopyVariant[];
  imagePrompts?: string[];
  images?: { url: string; mimeType?: string; width?: number; height?: number }[];
}

export default async function SmartCreationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  const t = await getTranslations("smart_creation");

  const generation = await db.generation.findUnique({
    where: { id },
    include: { project: true },
  });
  if (!generation || generation.userId !== session.user.id) notFound();

  const isRunning = ["PENDING", "QUEUED", "RUNNING"].includes(generation.status);
  const outputs = (generation.outputs as SmartCreationOutputs | null) ?? null;
  const product = outputs?.product;
  const variants = outputs?.variants ?? [];
  const imagePrompts = outputs?.imagePrompts ?? [];
  const images = outputs?.images ?? [];

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/smart-creation">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {product?.title ?? generation.project?.name ?? t("untitled")}
            </h1>
            {generation.project?.productUrl ? (
              <a
                href={generation.project.productUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="h-3 w-3" />
                {generation.project.productUrl}
              </a>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={generation.status} />
          {isRunning ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/smart-creation/${generation.id}`}>
                <RefreshCw className="h-4 w-4" /> {t("refresh")}
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      {isRunning ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-lg font-medium">{t("running_title")}</p>
            <p className="max-w-md text-sm text-muted-foreground">{t("running_subtitle")}</p>
            <Button variant="outline" asChild>
              <Link href={`/smart-creation/${generation.id}`}>{t("refresh")}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : generation.status === "FAILED" ? (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-base">{t("failed_title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-muted p-3 text-xs">
              {generation.errorMessage ?? "Unknown error"}
            </pre>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
          {/* product summary */}
          <Card className="lg:sticky lg:top-6 lg:self-start">
            <CardHeader>
              <CardTitle className="text-base">{t("product_section")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              {product?.images?.[0] ? (
                <div className="relative aspect-square w-full overflow-hidden rounded-md bg-muted">
                  <Image
                    src={product.images[0]}
                    alt={product.title ?? "product"}
                    fill
                    sizes="300px"
                    className="object-cover"
                    unoptimized
                  />
                </div>
              ) : null}
              {product?.brand ? (
                <p>
                  <span className="text-muted-foreground">{t("brand")}:</span> {product.brand}
                </p>
              ) : null}
              {product?.price ? (
                <p>
                  <span className="text-muted-foreground">{t("price")}:</span>{" "}
                  {product.currency ?? ""} {product.price}
                </p>
              ) : null}
              {product?.description ? (
                <p className="line-clamp-6 text-muted-foreground">{product.description}</p>
              ) : null}
            </CardContent>
          </Card>

          {/* variants + images */}
          <div className="flex flex-col gap-6">
            <section>
              <h2 className="mb-3 text-lg font-semibold">{t("variants_section")}</h2>
              {variants.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("no_variants")}</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {variants.map((v, i) => (
                    <Card key={v.id ?? i}>
                      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0 pb-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">#{i + 1}</Badge>
                          <Badge variant="outline" className="text-xs">
                            {v.platform_hint}
                          </Badge>
                        </div>
                        <CopyButton
                          text={`${v.hook}\n\n${v.caption}\n\n${v.cta}\n\n${v.hashtags.map((h) => "#" + h).join(" ")}`}
                        />
                      </CardHeader>
                      <CardContent className="flex flex-col gap-2 text-sm">
                        <p className="font-semibold">{v.hook}</p>
                        <p className="whitespace-pre-line">{v.caption}</p>
                        <p className="font-medium text-primary">{v.cta}</p>
                        {v.hashtags.length ? (
                          <p className="text-xs text-muted-foreground">
                            {v.hashtags.map((h) => "#" + h).join(" ")}
                          </p>
                        ) : null}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </section>

            {images.length ? (
              <section>
                <Separator className="mb-4" />
                <h2 className="mb-3 text-lg font-semibold">{t("images_section")}</h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {images.map((img, i) => (
                    <a
                      key={i}
                      href={img.url}
                      target="_blank"
                      rel="noreferrer"
                      className="group relative aspect-square overflow-hidden rounded-md bg-muted"
                    >
                      <Image
                        src={img.url}
                        alt={`generated ${i + 1}`}
                        fill
                        sizes="200px"
                        className="object-cover transition-transform group-hover:scale-105"
                        unoptimized
                      />
                    </a>
                  ))}
                </div>
              </section>
            ) : imagePrompts.length ? (
              <section>
                <Separator className="mb-4" />
                <h2 className="mb-3 text-lg font-semibold">{t("image_prompts_section")}</h2>
                <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
                  {imagePrompts.map((p, i) => (
                    <li key={i} className="rounded border p-2">
                      {p}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    SUCCEEDED: "default",
    RUNNING: "secondary",
    QUEUED: "outline",
    PENDING: "outline",
    FAILED: "destructive",
    CANCELED: "outline",
  };
  return <Badge variant={variant[status] ?? "outline"}>{status.toLowerCase()}</Badge>;
}
