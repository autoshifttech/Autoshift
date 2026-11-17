"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";

import { Shifty as Engine } from "@/lib/shifty/engine";
import type { ShiftyApi, ShiftyLevel, ShiftyOptions } from "@/lib/shifty/engine";
import { playShiftySound } from "@/lib/shifty/sound";
import { cn } from "@/lib/utils";

export type { ShiftyApi, ShiftyLevel };

/** The built-in lines Shifty says during his moves, in the person's language. */
export function useShiftyText(): NonNullable<ShiftyOptions["text"]> {
  const t = useTranslations("Shifty.lines");
  return {
    yay: t("yay"), aha: t("aha"), searching: t("searching"), yawn: t("yawn"), hello: t("hello"),
    phew: t("phew"), thanks: t("thanks"), goLive: t("goLive"), live: t("live"), tap: t("tap"),
  };
}

/**
 * Shifty in a page. He is decorative (screen readers get his words through the bubble's
 * live region, not his movements). `onReady` hands over his API for actions: wave(), think()...
 */
export function ShiftyFigure({
  level = "calm",
  draggable = false,
  sound = false,
  bubbleSide,
  className,
  onReady,
}: {
  level?: ShiftyLevel;
  draggable?: boolean;
  sound?: boolean;
  bubbleSide?: "top" | "right";
  className?: string;
  onReady?: (api: ShiftyApi) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const text = useShiftyText();
  const ready = useRef(onReady);
  ready.current = onReady;
  const soundOn = useRef(sound);
  soundOn.current = sound;

  useEffect(() => {
    if (!host.current) return;
    const api = Engine.create(host.current, {
      level,
      draggable,
      bubbleSide,
      text,
      onSound: (kind) => { if (soundOn.current) playShiftySound(kind); },
    });
    ready.current?.(api);
    return () => api.destroy();
    // The rig is built once; level changes go through api.level().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={host} className={cn("sh-host", className)} />;
}
