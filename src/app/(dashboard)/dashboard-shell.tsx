"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { MobileNav, Sidebar, useNavCounts, type NavCounts } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { AccountAccessAlert } from "@/components/layout/account-access-alert";
import { PresenceHeartbeat } from "@/components/presence/presence-heartbeat";
import { BrowserNotificationsListener } from "@/components/notifications/browser-notifications-listener";
import { TrialBanner } from "@/components/billing/trial-banner";
import { LowBalanceBanner } from "@/components/wallet/credits-badge";
import { CommandPalette } from "@/components/layout/command-palette";
import { HelpButton } from "@/components/layout/help-button";
import { ViewAsBanner } from "@/components/admin/view-as-banner";

// Auth-gated dashboard shell. Extracted from the layout so the layout
// itself can stay a server component and export metadata (noindex) —
// client components can't export Next's metadata object.

function DashboardShellInner({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const t = useTranslations("DashboardShell");

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">{t("loading")}</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="app-canvas flex h-dvh overflow-hidden bg-background">
      {/* Reports this tab's online/away presence once we know a user is
          signed in. Headless — renders nothing. */}
      <PresenceHeartbeat />
      {/* Desktop alerts for new customer messages (opt-in via Settings →
          Your profile). Headless — renders nothing. */}
      <BrowserNotificationsListener />
      <CommandPalette />
      <HelpButton />
      <NavFrame />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <ViewAsBanner />
        <TrialBanner />
        <LowBalanceBanner />
        <Header />
        {/* Room at the bottom on phones for the floating nav bar. */}
        <main className="flex-1 overflow-y-auto px-4 pt-2 pb-24 sm:px-6 lg:pb-6">
          {/* Above every page: writes are being rejected and here's why.
              Renders nothing unless the account/role failed to resolve. */}
          <AccountAccessAlert />
          {children}
        </main>
      </div>
    </div>
  );
}

/** Both navs share one subscription to the unread counts. */
function NavFrame() {
  const counts: NavCounts = useNavCounts();
  return (
    <>
      <Sidebar counts={counts} />
      <MobileNav counts={counts} />
    </>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <DashboardShellInner>{children}</DashboardShellInner>
    </AuthProvider>
  );
}
