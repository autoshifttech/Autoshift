import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A phone-style WhatsApp chat used to preview what customers will see. */
export function WhatsAppPreview({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-2xl border border-border bg-[#efeae2] dark:bg-[#0b141a]", className)}>
      <div className="flex items-center gap-2.5 bg-[#1E4C41] px-4 py-2.5 text-white">
        <span className="flex size-7 items-center justify-center rounded-full bg-white/20 text-xs font-semibold">{title.charAt(0)}</span>
        <span className="text-sm font-medium">{title}</span>
      </div>
      <div className="space-y-2 p-3">{children}</div>
    </div>
  );
}

export function Bubble({ from, children, time }: { from: "business" | "customer"; children: ReactNode; time?: string }) {
  return (
    <div className={cn("flex", from === "business" ? "justify-start" : "justify-end")}>
      <div
        className={cn(
          "max-w-[85%] rounded-lg px-3 py-2 text-[13px] leading-snug whitespace-pre-line text-[#111b21] shadow-sm dark:text-[#e9edef]",
          from === "business" ? "rounded-tl-none bg-white dark:bg-[#202c33]" : "rounded-tr-none bg-[#d9fdd3] dark:bg-[#005c4b]",
        )}
      >
        {children}
        {time && <span className="mt-1 block text-right text-[10px] text-[#667781] dark:text-[#8696a0]">{time}</span>}
      </div>
    </div>
  );
}

/** Reply buttons under a business message (WhatsApp interactive message). */
export function QuickButtons({ labels }: { labels: string[] }) {
  return (
    <div className="flex max-w-[85%] flex-col gap-1">
      {labels.map((l) => (
        <span key={l} className="rounded-lg bg-white py-1.5 text-center text-[13px] font-medium text-[#027eb5] shadow-sm dark:bg-[#202c33] dark:text-[#53bdeb]">
          {l}
        </span>
      ))}
    </div>
  );
}
