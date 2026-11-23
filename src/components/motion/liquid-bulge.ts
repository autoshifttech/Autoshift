/**
 * Liquid bulge for menu bars (from the Liquid Glass top menu): one glass pill
 * slides to the hovered, focused or pressed item and rests on the current one.
 * Its leading edge runs ahead and the trailing edge follows, so it stretches
 * like liquid; it thins a little while it moves fast; a long jump drops a
 * droplet that travels to the new item; pressing squishes it.
 *
 * Plain DOM, no React state: attach() adds two aria-hidden spans to the box and
 * only writes their inline styles. The items keep their own markup.
 * axis "x" is a horizontal bar, "y" a vertical list (the phone menu).
 */

import { useEffect } from "react";

type Spring = { v: number; t: number; vel: number; k: number; c: number };
const spring = (v: number, k = 260, c = 22): Spring => ({ v, t: v, vel: 0, k, c });

export interface LiquidBulgeOptions {
  axis?: "x" | "y";
  /** Items the bulge can sit on. */
  item: string;
  /** The item it rests on when nothing is hovered (e.g. the current page). */
  current?: string;
  /** "hover" (default): it follows the pointer and focus, resting on the current item.
      "current": it only moves when the current item changes (tab bars, where the current
      item's text changes colour with it). */
  follow?: "hover" | "current";
}

export function attachLiquidBulge(box: HTMLElement, { axis = "x", item, current, follow = "hover" }: LiquidBulgeOptions): () => void {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const bulge = document.createElement("span");
  bulge.className = "lq-bulge";
  bulge.setAttribute("aria-hidden", "true");
  const drop = document.createElement("span");
  drop.className = "lq-bulge-drop";
  drop.setAttribute("aria-hidden", "true");
  box.prepend(drop);
  box.prepend(bulge);
  box.classList.add("lq-bulge-on");
  // The bulge is placed inside the box: give it a position only if it has none (a dropdown panel
  // is already absolute and must stay where it is).
  const setPos = getComputedStyle(box).position === "static";
  if (setPos) box.style.position = "relative";
  if (axis === "y") box.classList.add("lq-bulge-y");
  if (follow === "hover") box.classList.add("lq-bulge-hover");

  const lo = spring(0), hi = spring(0); // the two edges along the axis
  const press = spring(1, 420, 18);
  const dropT = spring(1, 90, 14);
  let cross = { start: 0, size: 0 }; // position across the axis
  let shown = false, raf = 0, last = 0, hover: HTMLElement | null = null;
  let dropFrom = 0, dropTo = 0;
  const X = axis === "x";

  const step = (s: Spring, dt: number) => {
    if (reduce) { s.v = s.t; s.vel = 0; return; }
    const n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n;
    for (let i = 0; i < n; i++) { s.vel += (s.k * (s.t - s.v) - s.c * s.vel) * h; s.v += s.vel * h; }
  };
  const settled = () => [lo, hi, press, dropT].every((s) => Math.abs(s.t - s.v) < 0.2 && Math.abs(s.vel) < 0.5) || reduce;

  function paint() {
    const len = Math.max(0, hi.v - lo.v);
    const speed = Math.abs(lo.vel) + Math.abs(hi.vel);
    const thin = reduce ? 1 : 1 - Math.min(X ? 0.14 : 0.06, speed / 9000); // liquid thins as it runs (less across a wide list row)
    const p = press.v;
    const along = lo.v - (len * (p - 1)) / 2, alongSize = len * (2 - p); // a press widens a touch...
    const crossSize = cross.size * thin * p, crossStart = cross.start + (cross.size - crossSize) / 2; // ...and flattens
    Object.assign(bulge.style, X
      ? { transform: `translate(${along.toFixed(2)}px, ${crossStart.toFixed(2)}px)`, width: `${alongSize.toFixed(2)}px`, height: `${crossSize.toFixed(2)}px` }
      : { transform: `translate(${crossStart.toFixed(2)}px, ${along.toFixed(2)}px)`, height: `${alongSize.toFixed(2)}px`, width: `${crossSize.toFixed(2)}px` });
    bulge.style.opacity = shown ? "1" : "0";
    const t = Math.min(1, Math.max(0, dropT.v));
    if (t < 0.98) {
      const f = Math.sin(Math.PI * t), r = 4 + 5 * f;
      const a = dropFrom + (dropTo - dropFrom) * t - r;
      const c = X ? cross.start + cross.size + 4 * f - r + r * 0.4 : cross.start + 14 - r;
      drop.style.width = drop.style.height = `${(2 * r).toFixed(2)}px`;
      drop.style.transform = X ? `translate(${a.toFixed(2)}px, ${c.toFixed(2)}px)` : `translate(${c.toFixed(2)}px, ${a.toFixed(2)}px)`;
      drop.style.opacity = "1";
    } else drop.style.opacity = "0";
  }
  function loop(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    [lo, hi, press, dropT].forEach((s) => step(s, dt));
    paint();
    raf = settled() ? 0 : requestAnimationFrame(loop);
    if (!raf) paint();
  }
  const kick = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop); } };

  function place() {
    const el = hover ?? (current ? box.querySelector<HTMLElement>(current) : null);
    if (!el || el.offsetParent === null) {
      if (shown) { const m = (lo.t + hi.t) / 2; lo.t = hi.t = m; shown = false; }
      kick();
      return;
    }
    // In the box's content coordinates, so it stays on its item while the box scrolls.
    const b = box.getBoundingClientRect(), r = el.getBoundingClientRect();
    const ox = box.scrollLeft - b.left - box.clientLeft, oy = box.scrollTop - b.top - box.clientTop;
    const L = X ? r.left + ox : r.top + oy, R = X ? r.right + ox : r.bottom + oy;
    cross = X ? { start: r.top + oy, size: r.height } : { start: r.left + ox, size: r.width };
    if (!shown || hi.v - lo.v < 1) { // appear where the item is, from its middle
      const m = (L + R) / 2;
      lo.v = hi.v = m; lo.vel = hi.vel = 0;
    }
    const from = (lo.t + hi.t) / 2, to = (L + R) / 2;
    if (shown && Math.abs(to - from) > (X ? 110 : 90) && !reduce) { dropFrom = from; dropTo = to; dropT.v = 0; dropT.vel = 0; dropT.t = 1; }
    // the leading edge runs ahead, the trailing edge follows
    const forward = to > from;
    const lead = forward ? hi : lo, tail = forward ? lo : hi;
    lead.k = 300; lead.c = 24; tail.k = 120; tail.c = 17;
    lo.t = L; hi.t = R;
    shown = true;
    kick();
  }

  const itemOf = (e: Event) => (e.target as Element | null)?.closest?.<HTMLElement>(item) ?? null;
  const hovers = follow === "hover";
  const onOver = (e: PointerEvent) => { if (!hovers) return; const el = itemOf(e); if (el && el !== hover) { hover = el; place(); } };
  const onLeave = () => { hover = null; place(); };
  const onFocus = (e: FocusEvent) => { if (!hovers) return; const el = itemOf(e); if (el) { hover = el; place(); } };
  const onBlur = (e: FocusEvent) => { if (!box.contains(e.relatedTarget as Node | null)) { hover = null; place(); } };
  const onDown = (e: PointerEvent) => {
    const el = itemOf(e);
    if (!el) return;
    if (hovers) { hover = el; place(); }
    press.t = 0.9; kick();
  };
  const onUp = () => { if (press.t !== 1) { press.t = 1; press.vel += 1.2; kick(); } };
  box.addEventListener("pointerover", onOver);
  box.addEventListener("pointerleave", onLeave);
  box.addEventListener("focusin", onFocus);
  box.addEventListener("focusout", onBlur);
  box.addEventListener("pointerdown", onDown);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
  window.addEventListener("resize", place);
  // The current item can change without a pointer (a menu opens, the page changes).
  const mo = new MutationObserver(() => { if (!hover) place(); });
  mo.observe(box, { subtree: true, attributes: true, attributeFilter: ["aria-current", "aria-expanded", "class"] });
  // A sidebar opening or closing resizes its rows: follow them.
  const ro = new ResizeObserver(() => place());
  ro.observe(box);
  requestAnimationFrame(place);

  return () => {
    cancelAnimationFrame(raf);
    mo.disconnect();
    ro.disconnect();
    box.removeEventListener("pointerover", onOver);
    box.removeEventListener("pointerleave", onLeave);
    box.removeEventListener("focusin", onFocus);
    box.removeEventListener("focusout", onBlur);
    box.removeEventListener("pointerdown", onDown);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
    window.removeEventListener("resize", place);
    bulge.remove();
    drop.remove();
    box.classList.remove("lq-bulge-on", "lq-bulge-y", "lq-bulge-hover");
    if (setPos) box.style.position = "";
  };
}

/** React: attach the bulge to the element this ref points at, for as long as it is mounted. */
export function useLiquidBulge<T extends HTMLElement>(ref: { current: T | null }, options: LiquidBulgeOptions, enabled = true) {
  const { axis, item, current, follow } = options;
  useEffect(() => (enabled && ref.current ? attachLiquidBulge(ref.current, { axis, item, current, follow }) : undefined), [ref, axis, item, current, follow, enabled]);
}
