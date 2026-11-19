"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CheckCircle2, Clock, Loader2, Plus, RefreshCw, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { isLive } from "@/lib/workspace/live";
import { TEMPLATE_FIELDS } from "@/lib/assistants/model";

interface Row {
  name: string;
  language: string | null;
  status: string | null;
  category: string;
  body_text: string;
  header_type: string | null;
  header_content: string | null;
  buttons: { type?: string; url?: string }[] | null;
}

/** How many {{n}} a template body uses (the highest n). */
export const varCount = (body: string) => Math.max(0, ...[...body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => Number(m[1])));

/** Templates AutoShift can fill: body variables only (no media header, no header or link variables). */
export const usable = (r: Row) =>
  !["image", "video", "document"].includes(String(r.header_type ?? "")) &&
  !/\{\{/.test(r.header_content ?? "") &&
  !(r.buttons ?? []).some((b) => /\{\{/.test(b.url ?? ""));

function fetchTemplates() {
  return createClient()
    .from("message_templates")
    .select("name, language, status, category, body_text, header_type, header_content, buttons")
    .order("created_at", { ascending: false })
    .then(({ data, error }) => ({ data, error }));
}

const KNOWN_STATUSES = ["approved", "pending", "rejected", "draft"] as const;

/** What can fill a {{n}} in an appointment reminder template. */
export const REMINDER_FIELDS = ["customer_name", "service", "when", "date", "time", "number"] as const;

/** The two places a business picks its own template: order updates (Shop tab) and reminders (Appointments). */
const KINDS = {
  order: { fields: TEMPLATE_FIELDS, draft: "order_update" },
  reminder: { fields: REMINDER_FIELDS, draft: "appointment_reminder" },
} as const;
export type PickerKind = keyof typeof KINDS;

/** A chosen template: vars[0] fills {{1}}, vars[1] fills {{2}} … */
export interface TemplateChoice {
  name: string;
  language: string;
  vars: string[];
}
const key = (r: Pick<Row, "name" | "language">) => `${r.name}|${r.language ?? ""}`;

/**
 * "Order updates after 24 hours" (Shop tab) and "Reminders after 24 hours" (Appointments): WhatsApp only
 * allows free text within 24 hours of the customer's last message. The business picks one of its own
 * templates (or creates one on the Templates page) and says what fills each {{n}}.
 */
export function TemplatePicker<V extends TemplateChoice>({ kind, value, language, onChange, returnTo }: {
  kind: PickerKind;
  value: V | null | undefined;
  language: string;
  onChange: (v: V | null) => void;
  /** Where the Templates page sends the person back to; default: this page. */
  returnTo?: string;
}) {
  const fields = KINDS[kind].fields as readonly string[];
  const id = `${kind}-tpl`;
  const t = useTranslations("OrderTemplate");
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(() => (isLive() ? null : []));
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const apply = useCallback((out: { data: unknown; error: unknown }) => {
    setFailed(Boolean(out.error));
    if (!out.error) setRows((out.data ?? []) as Row[]);
  }, []);
  useEffect(() => {
    if (isLive()) void fetchTemplates().then(apply);
  }, [apply]);
  const load = async () => {
    if (!isLive()) return;
    setBusy(true);
    apply(await fetchTemplates());
    setBusy(false);
  };

  const options = useMemo(() => (rows ?? []).filter((r) => usable(r) && r.category !== "Authentication"), [rows]);
  const chosen = value ? options.find((r) => key(r) === key({ name: value.name, language: value.language })) ?? null : null;
  const count = chosen ? varCount(chosen.body_text) : 0;
  const vars: string[] = Array.from({ length: count }, (_, i) => value?.vars?.[i] ?? fields[i] ?? fields[0]);
  const status = String(chosen?.status ?? "").toUpperCase();

  const sample: Record<string, string> = {
    customer_name: "Asha",
    order_number: "1001",
    update: t("sampleUpdate"),
    total: "₹1,498",
    tracking: "https://track.example.com/AB123",
    service: t("sampleService"),
    when: t("sampleWhen"),
    date: t("sampleDate"),
    time: t("sampleTime"),
    number: "12",
  };
  const preview = chosen ? chosen.body_text.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n) => sample[vars[Number(n) - 1]] ?? `{{${n}}}`) : "";

  const statusLabel = (raw: string | null) => {
    const k = String(raw ?? "draft").toLowerCase();
    return (KNOWN_STATUSES as readonly string[]).includes(k) ? t(`status_${k as (typeof KNOWN_STATUSES)[number]}`) : String(raw);
  };
  const pick = (k: string) => {
    if (!k) return onChange(null);
    const r = options.find((o) => key(o) === k);
    if (r) onChange({ name: r.name, language: r.language ?? "en", vars: fields.slice(0, varCount(r.body_text)) } as V);
  };
  const setVar = (i: number, field: string) => value && onChange({ ...value, vars: vars.map((v, j) => (j === i ? field : v)) });
  // Built on click: the page address (where to come back to) only exists in the browser.
  const openCreate = () =>
    router.push(`/templates?new=${KINDS[kind].draft}&lang=${encodeURIComponent(language)}&back=${encodeURIComponent(returnTo ?? window.location.pathname + window.location.search)}`);

  const badge = !chosen ? null : status === "APPROVED" ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"><CheckCircle2 className="size-3.5" aria-hidden /> {t("approved")}</span>
  ) : status === "REJECTED" ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-2.5 py-1 text-xs font-medium text-rose-900 dark:bg-rose-950 dark:text-rose-200"><XCircle className="size-3.5" aria-hidden /> {t("rejected")}</span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200"><Clock className="size-3.5" aria-hidden /> {t("pending")}</span>
  );

  return (
    <section className="rounded-xl border border-border p-4" aria-labelledby={`${id}-title`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`${id}-title`} className="text-sm font-semibold text-foreground">{t(`title_${kind}`)}</h3>
        {badge}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{t(`help_${kind}`)}</p>

      {rows === null ? (
        <p role="status" className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden /> {t("loading")}</p>
      ) : failed ? (
        <p role="alert" className="mt-3 text-sm text-rose-800 dark:text-rose-300">{t("loadFailed")}</p>
      ) : (
        <div className="mt-3 grid min-w-0 gap-1.5">
          <Label htmlFor={id}>{t(`pick_${kind}`)}</Label>
          <NativeSelect id={id} className="min-w-0" value={chosen ? key(chosen) : ""} onChange={(e) => pick(e.target.value)}>
            <option value="">{options.length ? t("none") : t("noTemplates")}</option>
            {options.map((r) => (
              <option key={key(r)} value={key(r)}>
                {r.name} · {r.language ?? "—"} · {statusLabel(r.status)}
              </option>
            ))}
          </NativeSelect>
          {value && !chosen && <p className="text-xs text-rose-800 dark:text-rose-300">{t("missing", { name: value.name })}</p>}
        </div>
      )}

      {chosen && (
        <div className="mt-3 space-y-3">
          {count > 0 && (
            <fieldset className="grid gap-2 sm:grid-cols-2">
              <legend className="mb-1 text-sm font-medium text-foreground">{t("fill")}</legend>
              {vars.map((v, i) => (
                <div key={i} className="grid gap-1">
                  <Label htmlFor={`${id}-var-${i}`} className="text-xs text-muted-foreground">{t("var", { n: i + 1 })}</Label>
                  <NativeSelect id={`${id}-var-${i}`} value={v} onChange={(e) => setVar(i, e.target.value)}>
                    {fields.map((f) => <option key={f} value={f}>{t(`field_${f}` as "field_customer_name")}</option>)}
                  </NativeSelect>
                </div>
              ))}
            </fieldset>
          )}
          <div>
            <p className="text-xs font-medium text-muted-foreground">{t("preview")}</p>
            <p className="mt-1 rounded-lg bg-muted/60 p-2.5 text-sm whitespace-pre-line text-foreground">{preview}</p>
          </div>
          {status !== "APPROVED" && (
            <p className={cn("text-xs", status === "REJECTED" ? "text-rose-800 dark:text-rose-300" : "text-amber-900 dark:text-amber-200")}>
              {status === "REJECTED" ? t("rejectedHelp") : t("pendingHelp")}
            </p>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button className="min-h-11 gap-1.5" onClick={openCreate}>
          <Plus className="size-4" aria-hidden /> {t("create")}
        </Button>
        <Button variant="outline" className="min-h-11 gap-1.5" disabled={busy} onClick={() => void load()}>
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />} {t("refresh")}
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{t(`cost_${kind}`)}</p>
    </section>
  );
}
