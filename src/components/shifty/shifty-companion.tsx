"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ShiftyFigure, type ShiftyApi } from "@/components/shifty/shifty";
import { SHIFTY_EVENT, type ShiftyEvent } from "@/lib/shifty/events";
import { markSeen, saveShiftyPrefs, useShiftyPrefs } from "@/lib/shifty/prefs";
import { ADMIN_TIPS, ADMIN_TOUR, BUSINESS_TIPS, BUSINESS_TOUR, pageKey, placeCard, type TourStep } from "@/lib/shifty/tours";
import { cn } from "@/lib/utils";

type Area = "business" | "admin";
type Box = { x: number; y: number; w: number; h: number };

const SPRING = "transform .7s cubic-bezier(.34,1.3,.64,1)";
const isLite = () => typeof document !== "undefined" && document.documentElement.dataset.lite === "1";
const still = () => typeof window !== "undefined" && (document.documentElement.dataset.shifty === "still" || matchMedia("(prefers-reduced-motion: reduce)").matches);

/** Shifty is 200×208; his feet sit at 95% of his height. */
const FEET = 0.95, RATIO = 200 / 208;

/**
 * Shifty, the companion who travels with the person through the app: he hops along when they change
 * page, gives a tip the first time they open each page, runs the welcome tour, and reacts to real
 * moments (a paid order, a flow going live, a low wallet). Lives in the business and admin shells.
 */
export function ShiftyCompanion({ area }: { area: Area }) {
  const t = useTranslations("Shifty");
  const { prefs, loaded } = useShiftyPrefs();
  const pathname = usePathname() || "/";
  const api = useRef<ShiftyApi | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(76);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [tip, setTip] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [welcome, setWelcome] = useState(false);
  const [tour, setTour] = useState<{ steps: TourStep[]; i: number } | null>(null);
  const [spot, setSpot] = useState<Box | null>(null);
  const [cardPos, setCardPos] = useState<{ x: number; y: number }>({ x: 12, y: 12 });
  const firstPath = useRef(true);
  const off = prefs.mode === "off";
  const page = pageKey(pathname, area);
  const tips = (area === "admin" ? ADMIN_TIPS : BUSINESS_TIPS) as readonly string[];
  const tipText = tips.includes(page) ? t(`tips.${area}.${page}`) : t("tips.general");

  useEffect(() => { api.current?.level(isLite() ? "calm" : prefs.mode === "off" ? "off" : prefs.mode); }, [prefs.mode]);

  // ---------------------------------------------------------- corner position
  // Shifty's drawing is 208 wide and 200 tall; his feet (and shadow) sit at 95% of the height.
  /** Phones: standing on top of the bottom menu bar, at its right end. Computers: the bottom-right corner. */
  const corner = useCallback(() => {
    const bar = [...document.querySelectorAll<HTMLElement>("[data-mobile-nav]")].find((n) => n.getBoundingClientRect().height > 0);
    if (bar) {
      const r = bar.getBoundingClientRect(), w = 56;
      setSize(w);
      return { x: r.right - w - 14, y: r.top - w * RATIO * FEET + 3 };
    }
    const w = 76;
    setSize(w);
    return { x: innerWidth - w - 22, y: innerHeight - w * RATIO * FEET - 14 };
  }, []);
  const barTop = () => {
    const bar = [...document.querySelectorAll<HTMLElement>("[data-mobile-nav]")].find((n) => n.getBoundingClientRect().height > 0);
    return bar ? bar.getBoundingClientRect().top : innerHeight;
  };
  useEffect(() => {
    const onResize = () => { if (!tour) setPos(corner()); };
    onResize();
    const late = setTimeout(onResize, 400); // the bar can mount after Shifty
    addEventListener("resize", onResize);
    return () => { clearTimeout(late); removeEventListener("resize", onResize); };
  }, [corner, tour, pathname]);

  // ---------------------------------------------------------- travel with the person
  useEffect(() => {
    if (!loaded || off) return;
    const a = api.current;
    if (firstPath.current) { firstPath.current = false; }
    else if (a && wrap.current && !still() && !isLite() && !tour) {
      // a hop along: crouch, arc in from the side, squash on landing
      void a.pose({ sy: 0.82, sx: 1.12, y: 5 }, 120).then(() => a.pose({ sy: 1.1, sx: 0.92, y: 0, armR: "up", armL: "up" }, 160));
      wrap.current.animate(
        [{ translate: "-70px 0" }, { translate: "-35px -46px", offset: 0.5 }, { translate: "0 0" }],
        { duration: 640, easing: "cubic-bezier(.45,.05,.35,1)" },
      ).finished.then(async () => { await a.pose({ sy: 0.84, sx: 1.14, y: 4 }, 90); await a.pose({ sy: 1, sx: 1, y: 0, armR: "down", armL: "down" }, 280); }).catch(() => {});
    }
    // first visit to this page: one short tip
    const key = `page:${area}:${page}`;
    if (!prefs.seen[key] && !tour && !welcome && tips.includes(page)) {
      const id = setTimeout(() => { setTip(key); api.current?.point(); }, 900);
      return () => clearTimeout(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, loaded, off]);

  // ---------------------------------------------------------- welcome tour offer
  useEffect(() => {
    if (!loaded || off) return;
    const key = area === "admin" ? "tour:admin" : "tour:welcome";
    const home = area === "admin" ? pathname === "/admin" : pathname === "/dashboard";
    if (home && !prefs.seen[key]) { const id = setTimeout(() => setWelcome(true), 1200); return () => clearTimeout(id); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, off]);

  // ---------------------------------------------------------- real moments
  useEffect(() => {
    if (off) return;
    const onEvent = (e: Event) => {
      const { type, text } = (e as CustomEvent<ShiftyEvent>).detail;
      const a = api.current; if (!a) return;
      if (type === "paid") a.celebrate(text || t("events.paid"));
      else if (type === "lead") a.surprise(text || t("events.lead")).then(() => a.nod());
      else if (type === "flow-live") a.launch();
      else if (type === "saved") a.nod(text || t("events.saved"));
      else if (type === "error") a.shake(text || t("events.error"));
      else if (type === "wallet-low") a.worry(text || t("events.walletLow"));
      else if (type === "thinking") a.think(text);
      else if (type === "done") a.idea(text || t("events.done"));
    };
    addEventListener(SHIFTY_EVENT, onEvent);
    return () => removeEventListener(SHIFTY_EVENT, onEvent);
  }, [off, t]);

  // ---------------------------------------------------------- tour
  const steps = area === "admin" ? ADMIN_TOUR : BUSINESS_TOUR;
  const tourKey = area === "admin" ? "admin" : "business";
  const layout = useCallback(() => {
    if (!tour || !card.current) return;
    const step = tour.steps[tour.i];
    let target: Box | null = null;
    if (step.target) {
      const el = [...document.querySelectorAll(step.target)].find((n) => { const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight; });
      if (el) { const r = el.getBoundingClientRect(); target = { x: r.left - 6, y: r.top - 6, w: r.width + 12, h: r.height + 12 }; }
    }
    setSpot(target);
    const c = placeCard(target, { w: card.current.offsetWidth, h: card.current.offsetHeight }, { w: innerWidth, h: innerHeight }, innerWidth < 1024 ? 100 : 24);
    setCardPos(c);
    // Shifty stands next to the card
    const room = c.x > size + 16 ? c.x - size - 8 : Math.min(innerWidth - size - 8, c.x + card.current.offsetWidth + 8);
    const beside = c.x > size + 16 || innerWidth - (c.x + card.current.offsetWidth) > size + 16;
    setPos(beside ? { x: room, y: Math.min(innerHeight - size - 12, Math.max(8, c.y + 10)) } : { x: c.x + card.current.offsetWidth - size - 8, y: Math.max(8, c.y - size - 4) });
  }, [tour, size]);
  useEffect(() => {
    if (!tour) return;
    const step = tour.steps[tour.i];
    const id = setTimeout(() => {
      layout();
      const a = api.current; if (!a) return;
      if (step.act === "idea") void a.think().then(() => setTimeout(() => a.idea(), 900));
      else if (step.act) (a[step.act] as (s?: string) => Promise<void>)();
    }, 60);
    addEventListener("resize", layout);
    return () => { clearTimeout(id); removeEventListener("resize", layout); };
  }, [tour, layout]);
  useEffect(() => {
    if (!tour) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") endTour();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") back();
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  });

  function startTour() {
    setWelcome(false); setMenu(false); setTip(null);
    setTour({ steps, i: 0 });
    requestAnimationFrame(() => card.current?.querySelector<HTMLButtonElement>("[data-next]")?.focus());
  }
  function endTour() {
    setTour(null); setSpot(null); setPos(corner());
    void markSeen(area === "admin" ? "tour:admin" : "tour:welcome");
  }
  const next = () => (tour && tour.i < tour.steps.length - 1 ? setTour({ ...tour, i: tour.i + 1 }) : endTour());
  const back = () => tour && tour.i > 0 && setTour({ ...tour, i: tour.i - 1 });

  if (!loaded || off || !pos) return null;
  const step = tour?.steps[tour.i];

  return (
    <>
      {/* The companion */}
      <div
        className={cn("fixed top-0 left-0", tour ? "z-[60]" : "z-[45]")}
        style={{ transform: `translate(${Math.round(pos.x)}px, ${Math.round(pos.y)}px)`, transition: still() ? "none" : SPRING, width: size }}
      >
        <div ref={wrap}>
          <button
            type="button"
            onClick={() => { setMenu((m) => !m); api.current?.wink(); }}
            aria-label={t("ui.open")}
            aria-expanded={menu}
            className="block w-full rounded-2xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <ShiftyFigure level={isLite() ? "calm" : prefs.mode} sound={prefs.sound} onReady={(a) => { api.current = a; }} />
          </button>
        </div>
      </div>

      {/* First-visit tip, or the menu when Shifty is tapped */}
      {(tip || menu) && !tour && (
        <div
          role="dialog"
          aria-label={t("ui.tipTitle")}
          className="liquid-glass lg-floating fixed z-[46] w-[min(300px,calc(100vw-24px))] rounded-3xl p-4"
          style={{ right: 12, bottom: innerHeight - Math.min(barTop(), pos.y + size * RATIO * FEET) + size * RATIO + 10 }}
        >
          <div className="flex items-start gap-2">
            <p className="flex-1 text-sm font-medium">{tipText}</p>
            <button type="button" onClick={() => { if (tip) void markSeen(tip); setTip(null); setMenu(false); }} aria-label={t("ui.close")} className="-m-2 flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
              <X className="size-4" />
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {tip ? (
              <Button size="sm" className="min-h-11" onClick={() => { void markSeen(tip); setTip(null); api.current?.nod(); }}>{t("ui.gotIt")}</Button>
            ) : (
              <>
                <Button size="sm" className="min-h-11" onClick={startTour}>{t("ui.replayTour")}</Button>
                {area === "business" && (
                  <Link href="/settings?section=appearance" onClick={() => setMenu(false)} className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold hover:bg-black/5">
                    {t("ui.settings")}
                  </Link>
                )}
                <Button size="sm" variant="ghost" className="min-h-11" onClick={() => { setMenu(false); void saveShiftyPrefs({ mode: "off" }); }}>{t("ui.hide")}</Button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Welcome offer */}
      {welcome && !tour && (
        <div role="dialog" aria-labelledby="shifty-welcome" className="liquid-glass lg-frost fixed inset-x-3 bottom-32 z-[46] mx-auto flex max-w-md flex-wrap items-center gap-3 rounded-3xl p-4 lg:bottom-6">
          <div className="min-w-0 flex-1">
            <p id="shifty-welcome" className="font-semibold">{t(`tour.${tourKey}.offerTitle`)}</p>
            <p className="text-sm opacity-80">{t(`tour.${tourKey}.offerText`)}</p>
          </div>
          <Button variant="ghost" className="min-h-11" onClick={() => { setWelcome(false); void markSeen(area === "admin" ? "tour:admin" : "tour:welcome"); }}>{t("ui.notNow")}</Button>
          <Button className="min-h-11" onClick={startTour}>{t("ui.start")}</Button>
        </div>
      )}

      {/* Tour: spotlight and coach card */}
      {tour && step && (
        <>
          <div
            aria-hidden
            className="pointer-events-none fixed z-[58] rounded-2xl"
            style={spot
              ? { left: spot.x, top: spot.y, width: spot.w, height: spot.h, boxShadow: "0 0 0 9999px rgb(8 18 14 / .55), 0 0 0 3px rgb(201 242 122 / .9), 0 0 28px 6px rgb(201 242 122 / .35)", transition: still() ? "none" : "all .55s cubic-bezier(.22,1.2,.36,1)" }
              : { inset: 0, background: "rgb(8 18 14 / .55)" }}
          />
          <div
            ref={card}
            role="dialog"
            aria-modal="false"
            aria-labelledby="shifty-tour-title"
            className="liquid-glass lg-frost fixed z-[61] w-[min(340px,calc(100vw-24px))] rounded-3xl p-4"
            style={{ left: cardPos.x, top: cardPos.y, transition: still() ? "none" : "left .55s cubic-bezier(.22,1.2,.36,1), top .55s cubic-bezier(.22,1.2,.36,1)" }}
          >
            <p className="text-xs font-bold tracking-wider uppercase opacity-70">{t("ui.step", { n: tour.i + 1, total: tour.steps.length })}</p>
            <h2 id="shifty-tour-title" className="mt-1 text-lg font-bold">{t(`tour.${tourKey}.${step.key}.title`)}</h2>
            <p className="mt-1 text-sm opacity-85">{t(`tour.${tourKey}.${step.key}.text`)}</p>
            <div className="mt-3 flex items-center gap-1.5">
              <span className="mr-auto flex gap-1" aria-hidden>
                {tour.steps.map((s, i) => <i key={s.key} className={cn("block h-1.5 rounded-full bg-current transition-all", i === tour.i ? "w-5 opacity-90" : "w-1.5 opacity-30")} />)}
              </span>
              <Button variant="ghost" size="sm" className="min-h-11" onClick={endTour}>{t("ui.skip")}</Button>
              {tour.i > 0 && <Button variant="outline" size="sm" className="min-h-11" onClick={back}>{t("ui.back")}</Button>}
              <Button size="sm" className="min-h-11" data-next onClick={next}>{tour.i === tour.steps.length - 1 ? t("ui.finish") : t("ui.next")}</Button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
