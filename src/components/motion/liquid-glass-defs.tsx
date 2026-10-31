"use client";

import { useEffect } from "react";

/**
 * A displacement map for the glass "lens": the centre is neutral and the
 * edges push the backdrop sideways/up/down, so what sits behind the rim of
 * a glass panel looks bent, like light through thick glass. Red drives the
 * horizontal shift and green the vertical one.
 */
const LENS_MAP =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100" preserveAspectRatio="none">` +
      `<defs>` +
      `<linearGradient id="x" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#f00"/><stop offset=".16" stop-color="#800000"/><stop offset=".84" stop-color="#800000"/><stop offset="1" stop-color="#000"/></linearGradient>` +
      `<linearGradient id="y" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#0f0"/><stop offset=".32" stop-color="#008000"/><stop offset=".68" stop-color="#008000"/><stop offset="1" stop-color="#000"/></linearGradient>` +
      `</defs>` +
      `<rect width="200" height="100" fill="#000"/>` +
      `<rect width="200" height="100" fill="url(#x)"/>` +
      `<rect width="200" height="100" fill="url(#y)" style="mix-blend-mode:screen"/>` +
      `</svg>`,
  );

/**
 * The SVG filter behind `.liquid-glass` (see globals.css), plus a flag on
 * <html> when the browser can run it. Only Chromium applies SVG filters to
 * a backdrop; elsewhere the glass is the same blur and rim without the lens.
 */
/** Storage key for the "reduce transparency" choice: "1" solid, "0" glass even if the system asks for less. */
export const SOLID_KEY = "autoshift-solid";

export function LiquidGlassDefs() {
  useEffect(() => {
    const brands = (navigator as Navigator & { userAgentData?: { brands: { brand: string }[] } }).userAgentData?.brands ?? [];
    const root = document.documentElement;
    if (brands.some((b) => b.brand === "Chromium")) root.dataset.lens = "1";
    // Older or low-memory devices get the cheap glass.
    const nav = navigator as Navigator & { deviceMemory?: number };
    if ((nav.hardwareConcurrency && nav.hardwareConcurrency <= 4) || (nav.deviceMemory && nav.deviceMemory <= 4)) root.dataset.lite = "1";
    try {
      const pref = localStorage.getItem(SOLID_KEY);
      if (pref === "1") root.dataset.solid = "1";
      else if (pref === "0") root.dataset.solid = "off";
    } catch {}
    return () => {
      delete root.dataset.lens;
      delete root.dataset.lite;
    };
  }, []);

  return (
    <svg aria-hidden width="0" height="0" style={{ position: "absolute" }} focusable="false">
      <filter id="liquid-lens" x="0" y="0" width="1" height="1" primitiveUnits="objectBoundingBox" colorInterpolationFilters="sRGB">
        <feImage href={LENS_MAP} x="0" y="0" width="1" height="1" preserveAspectRatio="none" result="map" />
        <feDisplacementMap in="SourceGraphic" in2="map" scale="0.12" xChannelSelector="R" yChannelSelector="G" />
      </filter>
      <filter id="liquid-lens-water" x="0" y="0" width="1" height="1" primitiveUnits="objectBoundingBox" colorInterpolationFilters="sRGB">
        <feImage href={LENS_MAP} x="0" y="0" width="1" height="1" preserveAspectRatio="none" result="map" />
        <feDisplacementMap in="SourceGraphic" in2="map" scale="0.34" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  );
}
