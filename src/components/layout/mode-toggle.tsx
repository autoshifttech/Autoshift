"use client";

import { Moon, Sun } from "lucide-react";
import { flushSync } from "react-dom";

import { useTheme } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";

import { useTranslations } from "next-intl";

/**
 * Light/dark mode toggle — a single icon button that flips the app
 * between the two modes. Sun shows in light mode (click → go dark),
 * moon shows in dark mode (click → go light); the label always names
 * the destination so screen-reader users hear what the click does.
 *
 * 40×40 hit target to match the header's other touch controls.
 */
export function ModeToggle({ className, tip, withLabel }: { className?: string; /** Show the label as a rail hover name. */ tip?: boolean; /** Text beside the icon (hidden until the rail opens). */ withLabel?: boolean }) {
  const t = useTranslations("ModeToggle");
  const { mode, toggleMode } = useTheme();
  const goingTo = mode === "dark" ? "light" : "dark";
  const switchLabel = t("switchMode", { mode: goingTo });

  // The new mode spreads out as a circle from the button (darkmode_1).
  // Browsers without view transitions, or with reduced motion, just switch.
  const onClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const doc = document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } };
    if (!doc.startViewTransition || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      toggleMode();
      return;
    }
    const r = e.currentTarget.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const root = document.documentElement;
    root.style.setProperty("--vt-x", `${x}px`);
    root.style.setProperty("--vt-y", `${y}px`);
    root.style.setProperty("--vt-r", `${Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))}px`);
    root.dataset.vtReveal = "";
    doc.startViewTransition(() => flushSync(toggleMode)).finished.finally(() => delete root.dataset.vtReveal);
  };
  
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={withLabel && !tip ? undefined : switchLabel}
      title={tip ? undefined : switchLabel}
      data-tip={tip ? switchLabel : undefined}
      className={cn(
        "flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        className,
      )}
    >
      {mode === "dark" ? (
        <Moon key="moon" className="mode-icon h-5 w-5" />
      ) : (
        <Sun key="sun" className="mode-icon h-5 w-5" />
      )}
      {withLabel && <span className="rail-label flex-1 truncate text-left text-[15px] font-medium text-foreground">{switchLabel}</span>}
    </button>
  );
}
