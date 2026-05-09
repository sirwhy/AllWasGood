import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { SignUpForm } from "./sign-up-form";

export default async function SignUpPage() {
  const t = await getTranslations("auth");
  return (
    <div className="w-full max-w-sm space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("sign_up")}</h1>
        <p className="text-sm text-muted-foreground">AllWasGood</p>
      </div>
      <SignUpForm />
      <p className="text-sm text-muted-foreground">
        {t("have_account")}{" "}
        <Link href="/sign-in" className="font-medium text-primary hover:underline">
          {t("sign_in")}
        </Link>
      </p>
    </div>
  );
}
