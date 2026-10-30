"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Toaster, useSonner } from "sonner";

import { useTheme } from "@/hooks/use-theme";
import { DEFAULT_MODE } from "@/lib/themes";

// Returns false during SSR and the first hydration render, true after —
// the sanctioned (warning-free, no setState-in-effect) way to diverge
// server vs client. Lets us match the server-rendered default on first
// paint, then adopt the real mode.
const noopSubscribe = () => () => {};
function useIsClient() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

/**
 * Toaster wrapper that tracks the active light/dark mode.
 *
 * Lives inside <ThemeProvider> (see layout.tsx) so it can read the
 * current mode and hand it to sonner. Colors are driven off the same
 * CSS tokens as the rest of the app, so a toast looks at home in
 * either mode without a second palette to maintain.
 *
 * The theme is gated behind `useIsClient`: the server renders
 * DEFAULT_MODE, so first client paint must too, otherwise a light-mode
 * user hydrates with a different sonner `theme` attribute than the
 * server emitted and React logs a hydration mismatch.
 */
/** How long a message stays when the caller doesn't say. */
const DEFAULT_MS = 5000;
/** Time the closing beat (text fades, pill folds, circle rises) needs. */
const CLOSE_MS = 1500;

/**
 * Tells each message when to start folding away. The closing animation is
 * pure CSS, so it needs to know the message's own duration (some callers
 * keep errors up for 10 seconds); sonner lists its toasts in the same
 * order as their `data-index`, so the two are matched by that.
 */
function useCloseTimes() {
  const { toasts } = useSonner();
  useEffect(() => {
    document.querySelectorAll<HTMLElement>("[data-sonner-toast]").forEach((el) => {
      const t = toasts[Number(el.dataset.index)];
      if (!t) return;
      const ms = t.type === "loading" || t.duration === Infinity ? 1e9 : Math.max((t.duration ?? DEFAULT_MS) - CLOSE_MS, 1400);
      el.style.setProperty("--island-out-delay", `${ms}ms`);
    });
  }, [toasts]);
}

export function ThemedToaster() {
  const { mode } = useTheme();
  const isClient = useIsClient();
  useCloseTimes();
  return (
    <Toaster
      duration={DEFAULT_MS}
      theme={isClient ? mode : DEFAULT_MODE}
      // Messages open like Apple's Dynamic Island: a black pill at the top
      // centre that grows out to fit the message (styles in globals.css).
      position="top-center"
      offset={14}
      gap={8}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: "island-toast liquid-glass",
          content: "island-content",
          title: "island-title",
          description: "island-desc",
          icon: "island-icon",
          actionButton: "island-action",
          cancelButton: "island-action island-cancel",
          closeButton: "island-close",
        },
      }}
    />
  );
}
