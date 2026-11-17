"use client";

import { useEffect, useRef } from "react";

import { ShiftyFigure, type ShiftyApi } from "@/components/shifty/shifty";

/** The 404 scene: Shifty walks across, looks around confused, then waves you back. */
export function ShiftyLost({ line }: { line: string }) {
  const stage = useRef<HTMLDivElement>(null);
  const api = useRef<ShiftyApi | null>(null);
  useEffect(() => {
    let alive = true;
    const run = async () => {
      const a = api.current, s = stage.current; if (!a || !s) return;
      const w = s.clientWidth - 110;
      await a.walk(Math.max(60, w * 0.5), 1700);
      if (!alive) return;
      await a.confused(line);
      await new Promise((r) => setTimeout(r, 1400));
      if (alive) await a.wave();
    };
    const id = setTimeout(run, 300);
    return () => { alive = false; clearTimeout(id); };
  }, [line]);
  return (
    <div ref={stage} className="relative h-40 w-full max-w-lg" aria-hidden>
      <div className="absolute bottom-2 left-0 w-[100px]">
        <ShiftyFigure level="calm" onReady={(a) => { api.current = a; }} />
      </div>
      <div className="absolute inset-x-0 bottom-0 h-px bg-border" />
    </div>
  );
}
