"use client";

import type { ReactNode } from "react";
import { Check, Upload } from "lucide-react";

import { cn } from "@/lib/utils";

export type UploadPhase = "idle" | "connecting" | "uploading" | "done";

/**
 * Upload button whose body fills with liquid as the upload goes (a wavy
 * surface rises from the bottom; the label turns white where the liquid
 * covers it), then shows a tick. The caption under it says what is
 * happening: connecting, how much is sent, and the total time when done.
 */
export function UploadButton({
  phase,
  progress,
  labels,
  caption,
  onClick,
  className,
}: {
  phase: UploadPhase;
  /** 0..1 */
  progress: number;
  labels: { idle: string; uploading: string; done: string };
  caption?: ReactNode;
  onClick: () => void;
  className?: string;
}) {
  const busy = phase === "connecting" || phase === "uploading";
  const level = phase === "done" ? 1 : phase === "uploading" ? Math.max(0.04, Math.min(1, progress)) : 0;
  const text = phase === "done" ? labels.done : busy ? labels.uploading : labels.idle;
  const icon = phase === "done" ? <Check className="size-4" /> : busy ? null : <Upload className="size-4" />;
  const face = (
    <span className="flex items-center justify-center gap-1.5">
      {icon}
      <span className="text-[13px] font-semibold tracking-[0.14em] uppercase">{text}</span>
    </span>
  );
  return (
    <span className={cn("inline-flex flex-col items-center gap-1.5", className)}>
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        aria-busy={busy || undefined}
        data-phase={phase}
        className="upload-btn relative isolate h-10 min-w-36 overflow-hidden rounded-xl border border-primary/40 bg-card px-5 text-primary shadow-[0_6px_18px_-10px_var(--primary)] outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-progress"
        style={{ ["--level" as string]: level }}
      >
        {/* Liquid: a block that rises with a moving wave on top. */}
        <span aria-hidden className="upload-liquid absolute inset-x-0 bottom-0 -z-0 h-full">
          <svg className="upload-wave absolute -top-[7px] left-0 h-2 w-[200%]" viewBox="0 0 120 8" preserveAspectRatio="none">
            <path d="M0 4 Q 7.5 0 15 4 T 30 4 T 45 4 T 60 4 T 75 4 T 90 4 T 105 4 T 120 4 V 8 H 0 Z" fill="currentColor" />
          </svg>
          <span className="absolute inset-0 bg-current" />
        </span>
        <span className="relative">{face}</span>
        {/* The same label in white, shown only where the liquid is. */}
        <span aria-hidden className="upload-ink absolute inset-0 flex items-center justify-center text-white">
          {face}
        </span>
      </button>
      {caption && (
        <span role="status" aria-live="polite" className="min-h-4 text-xs text-muted-foreground tabular-nums">
          {caption}
        </span>
      )}
    </span>
  );
}
