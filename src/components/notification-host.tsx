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
        n.config({
          title: "AutoShift",
          nowLabel: "now",
          accent1: "#5fbf9f",
          accent2: "#1e4c41",
          accentInk: "#1e4c41",
          font: getComputedStyle(document.body).fontFamily,
        });
        flushNotifications();
      }}
    />
  );
}
