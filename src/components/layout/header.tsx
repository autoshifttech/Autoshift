"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { LogOut, Settings as SettingsIcon, User } from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { WhatsAppHealthChip } from "@/components/dashboard/whatsapp-health-chip";
import { CreditsBadge } from "@/components/wallet/credits-badge";
import { SearchButton } from "@/components/layout/command-palette";

const pageTitles: Record<string, string> = {
  "/dashboard": "dashboard",
  "/inbox": "inbox",
  "/notifications": "notifications",
  "/contacts": "contacts",
  "/bookings": "bookings",
  "/pipelines": "pipelines",
  "/broadcasts": "broadcasts",
  "/automations": "automations",
  "/flows": "flows",
  "/agents": "aiAgents",
  "/wallet": "wallet",
  "/leads": "leads",
  "/segments": "segments",
  "/opt-ins": "optIns",
  "/drips": "drips",
  "/insights": "insights",
  "/files": "files",
  "/ai-tools": "aiTools",
  "/templates": "templates",
  "/support": "support",
  "/settings": "settings",
};

function getPageTitleKey(pathname: string): string {
  if (pageTitles[pathname]) return pageTitles[pathname];
  const match = Object.entries(pageTitles).find(([path]) =>
    pathname.startsWith(path),
  );
  return match ? match[1] : "dashboard";
}

import { useTranslations } from "next-intl";

export function Header() {
  const t = useTranslations("Header");
  const pathname = usePathname();
  const { profile, signOut } = useAuth();
  const titleKey = getPageTitleKey(pathname);

  const initial =
    profile?.full_name?.charAt(0)?.toUpperCase() ??
    profile?.email?.charAt(0)?.toUpperCase() ??
    "U";

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-3 px-4 pt-2 sm:px-6 lg:h-[4.5rem] lg:pt-3">
      <h1 key={titleKey} className="title-weight min-w-0 truncate text-xl font-bold tracking-[-0.03em] text-foreground sm:text-2xl">
        {t(titleKey as string)}
      </h1>

      <div className="flex items-center gap-2">
        <SearchButton />
        {/* The Inbox shows its own, fuller connection notice. */}
        {pathname !== "/inbox" && (
          <span className="hidden xl:inline-flex">
            <WhatsAppHealthChip />
          </span>
        )}
        <CreditsBadge />

        <DropdownMenu>
        <DropdownMenuTrigger
          className="flex items-center rounded-xl transition-transform focus-visible:ring-2 focus-visible:ring-ring focus:outline-none active:scale-95"
          aria-label={t("openAccountMenu")}
        >
          <Avatar className="size-10 rounded-xl after:rounded-xl">
            {profile?.avatar_url ? (
              <AvatarImage
                src={profile.avatar_url}
                alt={profile.full_name ?? t("defaultAvatar")}
              />
            ) : null}
            <AvatarFallback className="rounded-xl bg-gradient-to-br from-[#8b6fd6] to-[#6a4fc2] text-sm font-bold text-white">
              {initial}
            </AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={6}
          className="min-w-56 bg-popover text-popover-foreground ring-border"
        >
          <div className="px-2 py-1.5">
            <p className="truncate text-sm font-medium text-foreground">
              {profile?.full_name ?? t("defaultUser")}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {profile?.email ?? ""}
            </p>
          </div>
          <DropdownMenuSeparator className="bg-border" />
          <DropdownMenuItem
            render={
              <Link
                href="/settings?tab=profile"
                className="text-popover-foreground focus:bg-accent focus:text-accent-foreground"
              />
            }
          >
            <User className="size-4" />
            {t("menuProfile")}
          </DropdownMenuItem>
          <DropdownMenuItem
            render={
              <Link
                href="/settings?tab=whatsapp"
                className="text-popover-foreground focus:bg-accent focus:text-accent-foreground"
              />
            }
          >
            <SettingsIcon className="size-4" />
            {t("menuSettings")}
          </DropdownMenuItem>
          <DropdownMenuSeparator className="bg-border" />
          <DropdownMenuItem
            onClick={signOut}
            className="text-popover-foreground focus:bg-accent focus:text-accent-foreground"
          >
            <LogOut className="size-4" />
            {t("menuSignOut")}
          </DropdownMenuItem>
        </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
