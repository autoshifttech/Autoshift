"use client";

import dynamic from "next/dynamic";

/**
 * The charts library (recharts, ~115 KB compressed) loads after the page has
 * appeared instead of before it: pages paint first, a soft placeholder holds
 * the chart's place, and the chart fills in a moment later.
 */
const Placeholder = () => <div aria-hidden className="skeleton h-full min-h-32 w-full rounded-xl" />;

export const BarChart = dynamic(() => import("./bar-chart").then((m) => m.BarChart), { ssr: false, loading: Placeholder });

export const Sparkline = dynamic(() => import("@/components/dashboard/sparkline").then((m) => m.Sparkline), {
  ssr: false,
  loading: () => <div aria-hidden className="skeleton mt-3 h-10 w-full rounded-lg" />,
});
