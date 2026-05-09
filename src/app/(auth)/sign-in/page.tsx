import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { SignInForm } from "./sign-in-form";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const t = await getTranslations("auth");
  return (
    <div className="w-full max-w-sm space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("sign_in")}</h1>
        <p className="text-sm text-muted-foreground">AllWasGood</p>
      </div>
      <SignInForm callbackUrl={sp.callbackUrl} error={sp.error} />
      <p className="text-sm text-muted-foreground">
        {t("no_account")}{" "}
        <Link href="/sign-up" className="font-medium text-primary hover:underline">
          {t("create_account")}
        </Link>
      </p>
    </div>
  );
}
