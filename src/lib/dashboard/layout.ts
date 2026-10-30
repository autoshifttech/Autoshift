"use client";

import { useCallback, useSyncExternalStore } from "react";

/** The sections of the overview a person can hide or move (the bento at the top is always first). */
export const DASH_SECTIONS = ["nextSteps", "summary", "attention", "kpis", "queue", "team", "pipeline", "campaigns", "activity"] as const;
export type DashSection = (typeof DASH_SECTIONS)[number];
/** Sections that fill the whole row; the rest sit two to a row on wide screens. */
export const FULL_WIDTH: DashSection[] = ["nextSteps", "summary", "attention", "kpis", "activity"];

interface Layout {
  order: DashSection[];
  hidden: DashSection[];
}

const KEY = "autoshift-dashboard-layout";
const DEFAULT: Layout = { order: [...DASH_SECTIONS], hidden: [] };
const listeners = new Set<() => void>();
let cache: { raw: string | null; value: Layout } | null = null;

function read(): Layout {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {}
  if (cache && cache.raw === raw) return cache.value;
  let value = DEFAULT;
  if (raw) {
    try {
      const j = JSON.parse(raw) as Partial<Layout>;
      const known = (a: unknown) => (Array.isArray(a) ? (a.filter((x) => (DASH_SECTIONS as readonly string[]).includes(x as string)) as DashSection[]) : []);
      const order = known(j.order);
      // Sections added later still show up, at the end.
      value = { order: [...order, ...DASH_SECTIONS.filter((s) => !order.includes(s))], hidden: known(j.hidden) };
    } catch {}
  }
  cache = { raw, value };
  return value;
}

function write(next: Layout) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
  cache = null;
  listeners.forEach((l) => l());
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

export function useDashboardLayout() {
  const layout = useSyncExternalStore(subscribe, read, () => DEFAULT);
  const toggle = useCallback((s: DashSection) => {
    const cur = read();
    write({ ...cur, hidden: cur.hidden.includes(s) ? cur.hidden.filter((x) => x !== s) : [...cur.hidden, s] });
  }, []);
  const move = useCallback((s: DashSection, by: -1 | 1) => {
    const cur = read();
    const i = cur.order.indexOf(s);
    const j = i + by;
    if (i < 0 || j < 0 || j >= cur.order.length) return;
    const order = [...cur.order];
    [order[i], order[j]] = [order[j], order[i]];
    write({ ...cur, order });
  }, []);
  const reset = useCallback(() => write(DEFAULT), []);
  return { ...layout, toggle, move, reset };
}
