"use client";

import { useEffect, useState } from "react";

import { backend, backendUrl } from "@/lib/backend/client";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useAdminT } from "@/lib/admin/strings";
import { Panel } from "./admin-ui";

type BilledTo = "business" | "autoshift";

const OPTIONS: { value: BilledTo; title: string; detail: string }[] = [
  {
    value: "business",
    title: "Each business pays Meta",
    detail: "Tech Provider. Businesses add their own card in WhatsApp Manager. The wallet charges only for AI replies, so nobody pays twice.",
  },
  {
    value: "autoshift",
    title: "AutoShift pays Meta (credit line)",
    detail: "Solution Partner. Meta bills AutoShift; the wallet recovers each message fee at your rate card. Switch on only after Meta approves your credit line.",
  },
];

/** Who Meta bills for WhatsApp message fees. Super admins change it; the server records who did. */
export function MetaFeesSwitch() {
  const tr = useAdminT();
  const [value, setValue] = useState<BilledTo | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!backendUrl()) return;
    backend<{ meta_fees_billed_to: BilledTo }>("/v1/platform/settings").then(
      (s) => setValue(s.meta_fees_billed_to),
      () => {},
    );
  }, []);

  if (!backendUrl() || value === null) return null;

  const choose = (next: BilledTo) => {
    if (next === value || saving) return;
    setSaving(true);
    backend<{ meta_fees_billed_to: BilledTo }>("/v1/platform/settings/meta-fees", { method: "PUT", body: { billed_to: next } })
      .then((s) => {
        setValue(s.meta_fees_billed_to);
        toast.success(tr(next === "autoshift" ? "The wallet now charges for WhatsApp messages" : "The wallet no longer charges for WhatsApp messages"));
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : tr("Could not change it")))
      .finally(() => setSaving(false));
  };

  return (
    <Panel title="WhatsApp message fees" description="Who Meta bills for the messages businesses send.">
      <div role="radiogroup" aria-label={tr("Who Meta bills for WhatsApp messages")} className="grid gap-3 p-4 sm:grid-cols-2">
        {OPTIONS.map((o) => {
          const on = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={saving}
              onClick={() => choose(o.value)}
              className={cn(
                "min-h-11 rounded-2xl border p-4 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                on ? "border-primary bg-primary/5" : "border-border hover:bg-muted",
              )}
            >
              <span className="block text-sm font-semibold text-foreground">{tr(o.title)}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{tr(o.detail)}</span>
            </button>
          );
        })}
      </div>
    </Panel>
  );
}
