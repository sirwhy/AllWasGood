import { Sparkles } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between bg-gradient-to-br from-primary/90 via-primary to-fuchsia-600 p-12 text-primary-foreground">
        <Link href="/" className="flex items-center gap-2 text-xl font-semibold">
          <Sparkles className="h-6 w-6" />
          AllWasGood
        </Link>
        <Marketing />
        <p className="text-sm text-primary-foreground/80">
          Provider-agnostic. Self-hosted. Your domain, your keys, your data.
        </p>
      </div>
      <div className="flex items-center justify-center p-8">{children}</div>
    </div>
  );
}

function Marketing() {
  const t = useTranslations("app");
  return (
    <div className="space-y-4">
      <h1 className="text-4xl font-bold tracking-tight">{t("tagline")}</h1>
      <ul className="space-y-2 text-primary-foreground/90">
        <li>• Smart Creation — link → marketing copy + visuals</li>
        <li>• AI Image & Video Agent</li>
        <li>• Talking AI avatars (HeyGen, D-ID, &amp; more)</li>
        <li>• Auto-publish to TikTok, Instagram, YouTube, Facebook</li>
        <li>• Bring any LLM gateway (9router, OpenRouter, vLLM, Ollama, …)</li>
      </ul>
    </div>
  );
}
