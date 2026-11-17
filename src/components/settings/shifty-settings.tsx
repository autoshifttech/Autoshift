"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import { Check, Volume2 } from "lucide-react";

import { Switch } from "@/components/ui/switch";
import { ShiftyFigure, type ShiftyApi } from "@/components/shifty/shifty";
import { saveShiftyPrefs, useShiftyPrefs, type ShiftyMode } from "@/lib/shifty/prefs";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

const MODES: ShiftyMode[] = ["lively", "calm", "off"];

/** Settings → Appearance: how lively Shifty is, his sounds, replaying the tour and page tips. Saved to the profile. */
export function ShiftySettings() {
  const t = useTranslations("Shifty.settings");
  const { prefs } = useShiftyPrefs();
  const previewRef = useRef<ShiftyApi | null>(null);
  const preview = { wave: () => previewRef.current?.wave(), nod: () => previewRef.current?.nod(), sleep: () => previewRef.current?.sleep(), jump: () => previewRef.current?.jump() };

  const pick = (m: ShiftyMode) => {
    void saveShiftyPrefs({ mode: m });
    if (m === "lively") preview.wave();
    else if (m === "calm") preview.nod();
    else preview.sleep();
  };
  const resetSeen = (keys: (k: string) => boolean, msg?: string) => {
    const seen = Object.fromEntries(Object.entries(prefs.seen).filter(([k]) => !keys(k)));
    void saveShiftyPrefs({ seen: {} }).then(() => (Object.keys(seen).length ? saveShiftyPrefs({ seen: seen as Record<string, true> }) : undefined));
    if (msg) toast.success(msg);
  };

  return (
    <div className="mt-8 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-start gap-4">
        <div className="hidden w-20 shrink-0 sm:block" aria-hidden>
          <ShiftyFigure level="calm" sound={prefs.sound} onReady={(a) => { previewRef.current = a; }} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-foreground">{t("title")}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{t("desc")}</p>
        </div>
      </div>

      <p id="shifty-mode" className="mt-5 text-sm font-semibold text-foreground">{t("mode")}</p>
      <div role="radiogroup" aria-labelledby="shifty-mode" className="mt-2 grid gap-2 sm:grid-cols-3">
        {MODES.map((m) => {
          const on = prefs.mode === m;
          return (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => pick(m)}
              className={cn("min-h-11 rounded-xl border p-3 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none", on ? "border-primary/60 bg-primary/5 ring-2 ring-primary/30" : "border-border hover:bg-muted/40")}
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                {t(m)} {on && <Check className="size-4 text-primary" aria-hidden />}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{t(`${m}Desc`)}</span>
            </button>
          );
        })}
      </div>

      <label className="mt-4 flex min-h-11 items-center justify-between gap-3 rounded-xl border border-border p-3">
        <span className="flex items-center gap-2">
          <Volume2 className="size-4 text-muted-foreground" aria-hidden />
          <span>
            <span className="block text-sm font-semibold text-foreground">{t("sound")}</span>
            <span className="block text-xs text-muted-foreground">{t("soundDesc")}</span>
          </span>
        </span>
        <Switch checked={prefs.sound} onCheckedChange={(v) => { void saveShiftyPrefs({ sound: v }); if (v) preview.jump(); }} aria-label={t("sound")} />
      </label>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="min-h-11 rounded-full border border-border px-4 text-sm font-semibold hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" onClick={() => { resetSeen((k) => k.startsWith("tour:")); window.location.assign("/dashboard"); }}>
          {t("replay")}
        </button>
        <button type="button" className="min-h-11 rounded-full border border-border px-4 text-sm font-semibold hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" onClick={() => resetSeen((k) => k.startsWith("page:"), t("tipsReset"))}>
          {t("resetTips")}
        </button>
      </div>
    </div>
  );
}
