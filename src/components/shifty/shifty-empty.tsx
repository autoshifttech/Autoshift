"use client";

import type { ReactNode } from "react";

import { ShiftyFigure } from "@/components/shifty/shifty";
import { useShiftyPrefs } from "@/lib/shifty/prefs";

/**
 * Shifty in an empty state: napping until something arrives, or pointing at what to do first.
 * Shows `fallback` (the usual icon) when the person has turned Shifty off.
 */
export function ShiftyEmpty({ pose, fallback }: { pose: "sleep" | "point" | "wave"; fallback: ReactNode }) {
  const { prefs, loaded } = useShiftyPrefs();
  if (!loaded || prefs.mode === "off") return <>{fallback}</>;
  return (
    <span aria-hidden className="block w-24">
      <ShiftyFigure level="calm" sound={false} onReady={(a) => { if (pose === "sleep") void a.sleep(); else if (pose === "point") void a.point(); else void a.wave(); }} />
    </span>
  );
}
