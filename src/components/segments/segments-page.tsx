"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Copy, Megaphone, Pencil, Plus, Repeat, Trash2, Users, X } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import { formatMoney, RATES } from "@/lib/wallet/model";
import {
  AUDIENCE,
  CITIES,
  FIELD_OPS,
  SEGMENT_FIELDS,
  SOURCES,
  TAGS,
  defaultValue,
  members,
  segmentsStore,
  useSegments,
  type Segment,
  type SegmentField,
  type SegmentOp,
  type SegmentRule,
} from "@/lib/segments/model";

const MARKETING = RATES.find((r) => r.kind === "marketing")?.price ?? 0;

export function useRuleText() {
  const t = useTranslations("Segments");
  const tl = useTranslations("LeadsPage");
  return (r: SegmentRule) => {
    const value =
      r.field === "temp" ? t(`temp_${r.value}`) : r.field === "source" ? tl(`source_${r.value}`) : r.field === "opted_in" ? t(r.value === "no" ? "no" : "yes") : r.value;
    return t(`rule_${r.field}_${r.op}`, { value });
  };
}

export function SegmentsPage() {
  const t = useTranslations("Segments");
  const locale = useLocale();
  const segments = useSegments();
  const ruleText = useRuleText();
  const [editing, setEditing] = useState<Segment | "new" | null>(null);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("title")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <Button onClick={() => setEditing("new")} className="gap-1.5 self-start">
          <Plus className="size-4" />
          {t("newSegment")}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {segments.map((s) => {
          const list = members(s, AUDIENCE);
          const reachable = list.filter((c) => c.optedIn).length;
          return (
            <div key={s.id} className="flex flex-col rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-foreground">{s.name}</p>
                  {s.description && <p className="truncate text-sm text-muted-foreground">{s.description}</p>}
                </div>
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-[var(--tone-mint)] px-2.5 py-1 text-sm font-semibold text-primary">
                  <Users className="size-3.5" />
                  {list.length.toLocaleString(locale)}
                </span>
              </div>
              <ul className="mt-4 flex flex-1 flex-wrap content-start gap-1.5">
                {s.rules.map((r, i) => (
                  <li key={r.id} className="flex items-center gap-1.5">
                    {i > 0 && <span className="text-[10px] font-semibold text-muted-foreground uppercase">{t(s.match === "all" ? "and" : "or")}</span>}
                    <span className="rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs text-foreground">{ruleText(r)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-muted-foreground">{t("reachable", { count: reachable, cost: formatMoney(reachable * MARKETING, locale) })}</p>
              <div className="mt-3 flex flex-wrap gap-1 border-t border-border pt-3">
                <Button variant="ghost" size="sm" className="gap-1" onClick={() => setEditing(s)}>
                  <Pencil className="size-3.5" />
                  {t("edit")}
                </Button>
                <Link href="/broadcasts/new" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-1")}>
                  <Megaphone className="size-3.5" />
                  {t("broadcast")}
                </Link>
                <Link href={`/drips?segment=${s.id}`} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-1")}>
                  <Repeat className="size-3.5" />
                  {t("drip")}
                </Link>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="ml-auto"
                  aria-label={t("duplicate")}
                  onClick={() => {
                    segmentsStore.set((st) => ({ segments: [...st.segments, { ...structuredClone(s), id: `sg-${Date.now()}`, name: t("copyOf", { name: s.name }) }] }));
                    toast.success(t("duplicated"));
                  }}
                >
                  <Copy className="size-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {editing && <SegmentDialog segment={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ValueInput({ rule, onChange }: { rule: SegmentRule; onChange: (v: string) => void }) {
  const t = useTranslations("Segments");
  const tl = useTranslations("LeadsPage");
  const opts: [string, string][] | null =
    rule.field === "tag"
      ? TAGS.map((x) => [x, x])
      : rule.field === "city"
        ? CITIES.map((x) => [x, x])
        : rule.field === "temp"
          ? ["hot", "warm", "cold"].map((x) => [x, t(`temp_${x}`)])
          : rule.field === "source"
            ? SOURCES.map((x) => [x, tl(`source_${x}`)])
            : rule.field === "opted_in"
              ? [
                  ["yes", t("yes")],
                  ["no", t("no")],
                ]
              : null;
  if (rule.field === "bookings" && rule.op === "none") return <span />;
  if (opts) {
    return (
      <NativeSelect value={rule.value} aria-label={t("value")} onChange={(e) => onChange(e.target.value)}>
        {opts.map(([v, label]) => (
          <option key={v} value={v}>
            {label}
          </option>
        ))}
      </NativeSelect>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <Input type="number" min={0} value={rule.value} aria-label={t("value")} onChange={(e) => onChange(e.target.value)} />
      {rule.field !== "bookings" && <span className="shrink-0 text-sm text-muted-foreground">{t("days")}</span>}
    </div>
  );
}

function SegmentDialog({ segment, onClose }: { segment: Segment | null; onClose: () => void }) {
  const t = useTranslations("Segments");
  const locale = useLocale();
  const [draft, setDraft] = useState<Segment>(
    () =>
      segment ?? {
        id: `sg-${Date.now()}`,
        name: "",
        description: "",
        match: "all",
        rules: [{ id: "r1", field: "temp", op: "is", value: "hot" }],
        createdAt: new Date().toISOString(),
      },
  );
  const [tried, setTried] = useState(false);
  const list = members(draft, AUDIENCE);
  const reachable = list.filter((c) => c.optedIn).length;
  const setRule = (id: string, patch: Partial<SegmentRule>) => setDraft({ ...draft, rules: draft.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)) });

  const save = () => {
    setTried(true);
    if (!draft.name.trim()) return;
    segmentsStore.set((s) => ({ segments: segment ? s.segments.map((x) => (x.id === segment.id ? draft : x)) : [...s.segments, draft] }));
    toast.success(segment ? t("saved") : t("created"));
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] grid-cols-[minmax(0,1fr)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{segment ? t("editTitle") : t("newTitle")}</DialogTitle>
          <DialogDescription>{t("dialogDesc")}</DialogDescription>
        </DialogHeader>
        <div className="grid min-w-0 gap-6 md:grid-cols-[minmax(0,1fr)_240px]">
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="sg-name">{t("name")}</Label>
                <Input id="sg-name" value={draft.name} aria-invalid={tried && !draft.name.trim()} placeholder={t("namePh")} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="sg-desc">{t("descriptionLabel")}</Label>
                <Input id="sg-desc" value={draft.description} placeholder={t("optional")} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-foreground">{t("matchLead")}</span>
              <div className="inline-flex rounded-full bg-muted p-1">
                {(["all", "any"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={draft.match === m}
                    onClick={() => setDraft({ ...draft, match: m })}
                    className={cn("rounded-full px-3 py-1 text-xs font-medium", draft.match === m ? "bg-card text-foreground shadow-[var(--shadow-card)]" : "text-muted-foreground")}
                  >
                    {t(`match_${m}`)}
                  </button>
                ))}
              </div>
              <span className="text-foreground">{t("matchTail")}</span>
            </div>
            <div className="space-y-2">
              {draft.rules.map((r) => (
                <div key={r.id} className="grid items-center gap-2 rounded-xl bg-muted/50 p-2.5 sm:grid-cols-[minmax(0,1.35fr)_minmax(0,0.9fr)_minmax(0,1fr)_auto]">
                  <NativeSelect
                    value={r.field}
                    aria-label={t("field")}
                    onChange={(e) => {
                      const field = e.target.value as SegmentField;
                      setRule(r.id, { field, op: FIELD_OPS[field][0], value: defaultValue(field) });
                    }}
                  >
                    {SEGMENT_FIELDS.map((f) => (
                      <option key={f} value={f}>
                        {t(`field_${f}`)}
                      </option>
                    ))}
                  </NativeSelect>
                  <NativeSelect value={r.op} aria-label={t("condition")} onChange={(e) => setRule(r.id, { op: e.target.value as SegmentOp })}>
                    {FIELD_OPS[r.field].map((op) => (
                      <option key={op} value={op}>
                        {t(`op_${r.field}_${op}`)}
                      </option>
                    ))}
                  </NativeSelect>
                  <ValueInput rule={r} onChange={(value) => setRule(r.id, { value })} />
                  <Button variant="ghost" size="icon-sm" aria-label={t("removeRule")} disabled={draft.rules.length === 1} onClick={() => setDraft({ ...draft, rules: draft.rules.filter((x) => x.id !== r.id) })}>
                    <X className="size-4" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={() => setDraft({ ...draft, rules: [...draft.rules, { id: `r${Date.now()}`, field: "tag", op: "is", value: TAGS[0] }] })}
              >
                <Plus className="size-3.5" />
                {t("addRule")}
              </Button>
            </div>
          </div>
          <aside className="h-fit rounded-2xl border border-border bg-card p-4">
            <p className="text-3xl font-bold text-foreground">{list.length.toLocaleString(locale)}</p>
            <p className="text-sm text-muted-foreground">{t("matching")}</p>
            <p className="mt-2 text-xs text-muted-foreground">{t("reachable", { count: reachable, cost: formatMoney(reachable * MARKETING, locale) })}</p>
            <ul className="mt-4 space-y-2 border-t border-border pt-3">
              {list.slice(0, 6).map((c) => (
                <li key={c.id} className="text-sm">
                  <span className="block truncate font-medium text-foreground">{c.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {c.city} · {c.phone}
                  </span>
                </li>
              ))}
              {list.length > 6 && <li className="text-xs text-muted-foreground">{t("andMore", { count: list.length - 6 })}</li>}
            </ul>
          </aside>
        </div>
        <DialogFooter className="sm:justify-between">
          {segment ? (
            <Button
              variant="ghost"
              className="gap-1.5 text-destructive hover:text-destructive"
              onClick={() => {
                segmentsStore.set((s) => ({ segments: s.segments.filter((x) => x.id !== segment.id) }));
                toast.success(t("deleted"));
                onClose();
              }}
            >
              <Trash2 className="size-4" />
              {t("delete")}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button onClick={save}>{t("save")}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
