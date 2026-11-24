"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/lib/toast";
import type { BusinessDetails } from "@/lib/legal-details";
import { ListSkeleton } from "@/components/ui/skeleton";

const FIELDS: { key: keyof BusinessDetails; multi?: boolean; type?: string }[] = [
  { key: "company" }, { key: "address", multi: true }, { key: "email", type: "email" }, { key: "whatsapp", type: "tel" },
  { key: "gstin" }, { key: "grievanceOfficer" }, { key: "supportHours" }, { key: "refundDays", type: "number" },
];

/** Admin → Settings: the business details shown on the Contact, Refund, Shipping and other legal pages. */
export function BusinessDetailsPanel() {
  const t = useTranslations("BusinessDetails");
  const [d, setD] = useState<BusinessDetails | null>(null);
  const [busy, setBusy] = useState(false);
  const [bad, setBad] = useState<string[]>([]);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    fetch("/api/admin/business-details").then(async (r) => {
      if (!r.ok) return setHidden(true);
      setD((await r.json()).details);
    }).catch(() => setHidden(true));
  }, []);

  if (hidden) return null;
  if (!d) return <ListSkeleton rows={3} compact label={t("loading")} className="px-0" />;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setBad([]);
    try {
      const r = await fetch("/api/admin/business-details", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setBad(j.fields ?? []); toast.error(j.error ?? t("failed")); return; }
      setD(j.details); toast.success(t("saved"));
    } finally { setBusy(false); }
  };

  return (
    <form onSubmit={save} className="rounded-2xl border border-border bg-card p-5" noValidate>
      <h2 className="text-base font-semibold text-foreground">{t("title")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("desc")}</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {FIELDS.map(({ key, multi, type }) => (
          <div key={key} className={multi ? "grid gap-1.5 sm:col-span-2" : "grid gap-1.5"}>
            <Label htmlFor={`bd-${key}`}>{t(`f.${key}`)}</Label>
            {multi ? (
              <Textarea id={`bd-${key}`} rows={2} value={String(d[key])} onChange={(e) => setD({ ...d, [key]: e.target.value })} aria-invalid={bad.includes(key)} />
            ) : (
              <Input id={`bd-${key}`} type={type ?? "text"} value={String(d[key])} onChange={(e) => setD({ ...d, [key]: type === "number" ? e.target.value : e.target.value } as BusinessDetails)} aria-invalid={bad.includes(key)} className="min-h-11" />
            )}
            {bad.includes(key) && <p className="text-xs text-destructive" role="alert">{t(`bad.${key}`)}</p>}
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{t("pages")}</p>
      <Button type="submit" className="mt-4 min-h-11" disabled={busy}>{busy && <Loader2 className="size-4 animate-spin" aria-hidden />}{t("save")}</Button>
    </form>
  );
}
