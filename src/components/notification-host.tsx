"use client";

import Script from "next/script";

import { flushNotifications, type NotifyEngine } from "@/lib/toast";

/**
 * Loads the liquid-glass notification engine (public/liquid-notify.js) and
 * dresses it in the AutoShift brand: green accents and the app's font.
 */
export function NotificationHost() {
  return (
    <Script
      src="/liquid-notify.js"
      strategy="afterInteractive"
      onLoad={() => {
        const n = (window as unknown as { Notify?: NotifyEngine }).Notify;
        if (!n) return;
        // The notification is drawn on a canvas, so the brand font (Plus Jakarta Sans, the
        // same one the website uses) must be loaded before the first message is drawn.
        const font = getComputedStyle(document.body).fontFamily;
        n.config({
          title: "AutoShift",
          nowLabel: "now",
          accent1: "#5fbf9f",
          accent2: "#1e4c41",
          accentInk: "#1e4c41",
          font,
          scale: 0.8,
        });
        const weights = ["500 16px", "600 15px", "650 19px", "700 14px"];
        Promise.all(weights.map((w) => document.fonts.load(`${w} ${font}`, "AutoShift Aa"))).then(
          flushNotifications,
          flushNotifications,
        );
      }}
    />
  );
}
