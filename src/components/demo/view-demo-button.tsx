"use client";

import { Button } from "@/components/ui/button";
import { setDemoCookie } from "@/lib/demo/cookie";

// Shown on the auth pages when no Supabase project is connected: opens the
// CRM on sample data (see src/lib/demo). A full navigation, so middleware
// and the Supabase client both see the new cookie.
export function ViewDemoButton({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="mt-3 flex flex-col items-start gap-2 sm:flex-row sm:items-center">
      <Button
        size="sm"
        onClick={() => {
          setDemoCookie(true);
          window.location.href = "/dashboard";
        }}
      >
        {label}
      </Button>
      <span className="text-xs text-amber-900/80 dark:text-amber-100/80">{hint}</span>
    </div>
  );
}
