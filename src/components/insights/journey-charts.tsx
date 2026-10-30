"use client";

import { useLocale, useTranslations } from "next-intl";

export interface FunnelStage {
  stage: string;
  value: number;
}

/** Fill for stage `i` of `n`: the brand green fading toward the card colour. */
const fill = (i: number, n: number) => `color-mix(in oklab, var(--primary) ${Math.round(100 - (i / Math.max(1, n - 1)) * 62)}%, var(--card))`;

/**
 * A real funnel: each stage is a bar whose bottom edge narrows into the next
 * stage's width, so you see where people drop out. The step-to-step rate sits
 * on the right.
 */
export function FunnelChart({ stages }: { stages: FunnelStage[] }) {
  const t = useTranslations("Insights");
  const locale = useLocale();
  const top = stages[0]?.value || 1;
  return (
    <ol className="mt-4 space-y-1">
      {stages.map((f, i) => {
        const w = Math.max(8, (f.value / top) * 100);
        const next = stages[i + 1];
        const nextW = next ? Math.max(8, (next.value / top) * 100) : w * 0.85;
        const inset = ((w - nextW) / 2 / w) * 100;
        const step = i > 0 ? Math.round((f.value / stages[i - 1].value) * 100) : null;
        const light = i >= 3;
        return (
          <li key={f.stage} className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_3.5rem] items-center gap-3">
            <span className="text-sm font-medium text-foreground">{t(`stage_${f.stage}`)}</span>
            <div className="flex h-12 justify-center">
              <div
                className="funnel-step flex h-full items-center justify-center text-sm font-bold"
                style={{
                  width: `${w}%`,
                  background: fill(i, stages.length),
                  color: light ? "var(--foreground)" : "#fff",
                  clipPath: `polygon(0 0, 100% 0, ${100 - inset}% 100%, ${inset}% 100%)`,
                  animationDelay: `${i * 90}ms`,
                }}
              >
                {f.value.toLocaleString(locale)}
              </div>
            </div>
            <span className="text-right text-xs font-semibold text-muted-foreground">{step !== null ? `${step}%` : ""}</span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The customer's route: stops along a winding path, one per stage, with the
 * share that made it to each stop. The line draws itself in.
 */
export function RouteCard({ stages }: { stages: FunnelStage[] }) {
  const t = useTranslations("Insights");
  const locale = useLocale();
  const n = stages.length;
  const W = 880;
  const H = 184;
  const pts = stages.map((_, i) => ({ x: 90 + (i * (W - 180)) / Math.max(1, n - 1), y: i % 2 === 0 ? 108 : 64 }));
  const path = pts.reduce((d, p, i) => {
    if (i === 0) return `M ${p.x} ${p.y}`;
    const q = pts[i - 1];
    const mx = (q.x + p.x) / 2;
    return `${d} C ${mx} ${q.y}, ${mx} ${p.y}, ${p.x} ${p.y}`;
  }, "");
  const top = stages[0]?.value || 1;
  return (
    <div className="mt-2 overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("routeTitle")} className="mx-auto h-auto w-full min-w-[560px] max-w-[880px]">
        <path d={path} fill="none" stroke="var(--border)" strokeWidth="6" strokeLinecap="round" />
        <path d={path} fill="none" stroke="var(--primary)" strokeWidth="6" strokeLinecap="round" strokeDasharray="1 14" pathLength={1} className="route-line" />
        {pts.map((p, i) => (
          <g key={stages[i].stage}>
            <circle cx={p.x} cy={p.y} r="25" fill="var(--card)" stroke="var(--primary)" strokeWidth="3" />
            <text x={p.x} y={p.y + 4.5} textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--foreground)">
              {Math.round((stages[i].value / top) * 100)}%
            </text>
            <text x={p.x} y={i % 2 === 0 ? p.y + 46 : p.y - 34} textAnchor="middle" fontSize="14" fontWeight="600" fill="var(--foreground)">
              {t(`stage_${stages[i].stage}`)}
            </text>
            <text x={p.x} y={i % 2 === 0 ? p.y + 63 : p.y - 51} textAnchor="middle" fontSize="12" fill="var(--muted-foreground)">
              {stages[i].value.toLocaleString(locale)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
