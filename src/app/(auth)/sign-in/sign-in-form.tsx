"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { signIn } from "next-auth/react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SignInForm({ callbackUrl, error }: { callbackUrl?: string; error?: string }) {
  const t = useTranslations("auth");
  const [pending, setPending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(error ?? null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setErrorMsg(null);
    const data = new FormData(e.currentTarget);
    const res = await signIn("credentials", {
      email: data.get("email") as string,
      password: data.get("password") as string,
      redirect: true,
      redirectTo: callbackUrl ?? "/dashboard",
    });
    if (res && "error" in res && res.error) {
      setErrorMsg(res.error);
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">{t("email")}</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">{t("password")}</Label>
        <Input id="password" name="password" type="password" required autoComplete="current-password" />
      </div>
      {errorMsg ? (
        <p className="text-sm text-destructive">Invalid email or password</p>
      ) : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "…" : t("sign_in")}
      </Button>
    </form>
  );
}
