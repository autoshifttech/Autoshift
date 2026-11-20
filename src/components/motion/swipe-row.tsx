"use client";

import { useRef, useState, type ReactNode } from "react";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Phones: drag a row left to run its action (swipe_3). A green strip with a
 * tick slides out from behind the row; let go past 35% and it springs on,
 * otherwise it springs back. Mouse and pen are ignored, and the row's own
 * click still works, so this is only a shortcut, never the only way.
 */
export function SwipeRow({ children, onSwipe, enabled = true, className }: { children: ReactNode; onSwipe: () => void; enabled?: boolean; className?: string }) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; w: number; locked: boolean | null } | null>(null);
  const moved = useRef(false);

  const reset = () => {
    start.current = null;
    setDragging(false);
    setDx(0);
  };

  return (
    <div className={cn("relative overflow-hidden rounded-xl", className)}>
      {enabled && dx < 0 && (
        <div aria-hidden className="absolute inset-0 flex items-center justify-end rounded-xl bg-primary pr-5 text-primary-foreground">
          <Check className="size-5" style={{ scale: String(Math.min(1.2, 0.6 + -dx / 160)) }} />
        </div>
      )}
      <div
        style={{ translate: `${dx}px 0`, touchAction: "pan-y" }}
        className={cn("relative", !dragging && "transition-[translate] duration-300 ease-[cubic-bezier(0.3,1.3,0.5,1)] motion-reduce:transition-none")}
        onPointerDown={(e) => {
          if (!enabled || e.pointerType !== "touch") return;
          moved.current = false;
          start.current = { x: e.clientX, y: e.clientY, w: e.currentTarget.offsetWidth, locked: null };
        }}
        onPointerMove={(e) => {
          const s = start.current;
          if (!s) return;
          const x = e.clientX - s.x;
          const y = e.clientY - s.y;
          if (s.locked === null && Math.hypot(x, y) > 8) s.locked = Math.abs(x) > Math.abs(y);
          if (!s.locked) return;
          moved.current = true;
          setDragging(true);
          setDx(Math.min(0, x));
        }}
        onPointerUp={() => {
          const s = start.current;
          if (s && dx < -s.w * 0.35) onSwipe();
          reset();
        }}
        onPointerCancel={reset}
        onClickCapture={(e) => {
          // A swipe is not a tap.
          if (moved.current) {
            e.preventDefault();
            e.stopPropagation();
            moved.current = false;
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}
