"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function LocaleSwitcher() {
  const router = useRouter();
  const [, startTransition] = useTransition();

  function setLocale(locale: string) {
    document.cookie = `locale=${locale}; path=/; max-age=${60 * 60 * 24 * 365}`;
    startTransition(() => router.refresh());
  }

  const current = typeof document !== "undefined" ? document.cookie.split("; ").find((c) => c.startsWith("locale="))?.split("=")[1] : "en";

  return (
    <Select defaultValue={current ?? "en"} onValueChange={setLocale}>
      <SelectTrigger className="h-8 w-[110px] text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="en">English</SelectItem>
        <SelectItem value="id">Indonesia</SelectItem>
      </SelectContent>
    </Select>
  );
}
