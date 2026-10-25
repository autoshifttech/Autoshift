"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { isDemoMode } from "@/lib/supabase/client";
import { setDemoCookie } from "@/lib/demo/cookie";

const noSubscribe = () => () => {};

// Top-of-app strip while browsing the sample workspace.
export function DemoBanner() {
  const t = useTranslations("Setup");
  // The cookie only exists in the browser: off during server rendering.
  const demo = useSyncExternalStore(noSubscribe, isDemoMode, () => false);
  if (!demo) return null;
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-amber-50 px-4 py-1.5 text-center text-xs text-amber-900 sm:py-2 sm:text-sm ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-800"
    >
      <span>{t("demoBanner")}</span>
      <button
        type="button"
        className="font-semibold underline underline-offset-2 hover:no-underline"
        onClick={() => {
          setDemoCookie(false);
          window.location.href = "/login";
        }}
      >
        {t("demoExit")}
      </button>
    </div>
  );
}
