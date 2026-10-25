import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { LogoMark } from "@/components/brand/logo-mark";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { ViewDemoButton } from "@/components/demo/view-demo-button";

// Shared metadata for auth pages (login / signup / forgot-password).
// None of these should be indexed — they'd compete with the marketing
// landing in SERPs and offer nothing to a searcher who hasn't already
// signed up. Each page still gets its own <title> via its own
// metadata.title override below the route group layout.
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

export default async function AuthLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("Setup");
  const configured = isSupabaseConfigured();
  return (
    <div className="relative">
      {!configured && (
        <>
          {/* Phones: in the flow under the logo. Larger screens: floating above the card. */}
          <div className="px-4 pt-20 sm:hidden">
            <SetupNotice title={t("notConfiguredTitle")} desc={t("notConfiguredDesc")} demo={<ViewDemoButton label={t("demoButton")} hint={t("demoHint")} />} />
          </div>
          <div className="absolute inset-x-4 top-24 z-10 mx-auto hidden max-w-md sm:block">
            <SetupNotice title={t("notConfiguredTitle")} desc={t("notConfiguredDesc")} demo={<ViewDemoButton label={t("demoButton")} hint={t("demoHint")} />} />
          </div>
        </>
      )}
      {/* Plain <a>: "/" is the static public site, not an app route. */}
      <a
        href="/"
        className="absolute top-5 left-5 z-10 inline-flex items-center gap-2 rounded-full bg-card px-3 py-1.5 text-sm font-semibold text-foreground shadow-[var(--shadow-card)] hover:text-primary sm:top-6 sm:left-8"
      >
        <LogoMark className="size-6" />
        AutoShift
      </a>
      {/* With the notice on a phone, the page below no longer needs a full screen of height. */}
      <div className={configured ? undefined : "max-sm:[&>div]:min-h-0 max-sm:[&>div]:py-6"}>{children}</div>
    </div>
  );
}

function SetupNotice({ title, desc, demo }: { title: string; desc: string; demo: ReactNode }) {
  return (
    <div
      role="status"
      className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-800"
    >
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-amber-900/80 dark:text-amber-100/80">{desc}</p>
      {demo}
    </div>
  );
}
