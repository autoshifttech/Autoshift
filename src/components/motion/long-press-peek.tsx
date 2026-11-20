"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Phones: press and hold a row to peek at it (long-press preview, like
 * iOS). The row sinks a little while you hold; after ~0.45 s the page blurs
 * and a larger preview springs up. Tap the preview to open it, tap outside
 * to close. A normal tap still just opens the row; mouse and pen ignore this.
 */
export function LongPressPeek({ children, peek, onOpen, label }: { children: ReactNode; peek: ReactNode; onOpen: () => void; label: string }) {
  const [open, setOpen] = useState(false);
  const [holding, setHolding] = useState(false);
  const timer = useRef(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const cancel = () => {
    window.clearTimeout(timer.current);
    start.current = null;
    setHolding(false);
  };

  return (
    <>
      <div
        className="peek-host"
        data-holding={holding || undefined}
        onContextMenu={(e) => fired.current && e.preventDefault()}
        onPointerDown={(e) => {
          if (e.pointerType !== "touch") return;
          fired.current = false;
          start.current = { x: e.clientX, y: e.clientY };
          setHolding(true);
          timer.current = window.setTimeout(() => {
            fired.current = true;
            setHolding(false);
            navigator.vibrate?.(10);
            setOpen(true);
          }, 450);
        }}
        onPointerMove={(e) => {
          const s = start.current;
          if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > 8) cancel();
        }}
        onPointerUp={cancel}
        onPointerCancel={cancel}
        onClickCapture={(e) => {
          // The lift of a long press is not a tap.
          if (fired.current) {
            e.preventDefault();
            e.stopPropagation();
            fired.current = false;
          }
        }}
      >
        {children}
      </div>
      {open &&
        createPortal(
          <div className="peek-backdrop fixed inset-0 z-[70] flex items-center justify-center bg-black/25 p-6 backdrop-blur-md" onClick={() => setOpen(false)}>
            <button
              type="button"
              aria-label={label}
              autoFocus
              className="peek-card w-full max-w-sm overflow-hidden rounded-3xl bg-card text-left shadow-[0_30px_60px_-20px_rgb(0_0_0/0.45)] ring-1 ring-border"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                onOpen();
              }}
            >
              {peek}
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}
