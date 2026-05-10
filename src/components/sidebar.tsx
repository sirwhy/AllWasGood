"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Sparkles,
  ImageIcon,
  Video,
  Link as LinkIcon,
  User2,
  Send,
  Folder,
  Palette,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  labelKey: string;
  icon: LucideIcon;
  comingSoon?: boolean;
}

const PRIMARY: NavItem[] = [
  { href: "/dashboard", labelKey: "dashboard", icon: Home },
  { href: "/smart-creation", labelKey: "smart_creation", icon: Sparkles },
  { href: "/link-to-video", labelKey: "link_to_video", icon: LinkIcon },
  { href: "/image-agent", labelKey: "image_agent", icon: ImageIcon, comingSoon: true },
  { href: "/video-agent", labelKey: "video_agent", icon: Video, comingSoon: true },
  { href: "/avatars", labelKey: "avatars", icon: User2 },
  { href: "/publishing", labelKey: "publishing", icon: Send, comingSoon: true },
];

const SECONDARY: NavItem[] = [
  { href: "/projects", labelKey: "projects", icon: Folder, comingSoon: true },
  { href: "/brand-kit", labelKey: "brand_kit", icon: Palette, comingSoon: true },
  { href: "/settings", labelKey: "settings", icon: Settings },
];

export function Sidebar() {
  const t = useTranslations("nav");
  const pathname = usePathname();

  return (
    <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r bg-card">
      <Link href="/dashboard" className="flex items-center gap-2 px-6 py-5 text-lg font-semibold">
        <Sparkles className="h-5 w-5 text-primary" />
        AllWasGood
      </Link>
      <nav className="flex flex-col gap-1 px-3 py-2">
        {PRIMARY.map((item) => (
          <NavLink key={item.href} item={item} active={pathname === item.href} t={t} />
        ))}
      </nav>
      <div className="mt-auto px-3 py-2">
        <nav className="flex flex-col gap-1">
          {SECONDARY.map((item) => (
            <NavLink key={item.href} item={item} active={pathname === item.href} t={t} />
          ))}
        </nav>
      </div>
    </aside>
  );
}

function NavLink({
  item,
  active,
  t,
}: {
  item: NavItem;
  active: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  const Icon = item.icon;
  const inner = (
    <span
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
        active ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground",
        item.comingSoon && "opacity-60",
      )}
    >
      <Icon className="h-4 w-4" />
      <span className="flex-1">{t(item.labelKey)}</span>
      {item.comingSoon ? (
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">soon</span>
      ) : null}
    </span>
  );
  if (item.comingSoon) {
    return <div className="cursor-default">{inner}</div>;
  }
  return <Link href={item.href}>{inner}</Link>;
}
