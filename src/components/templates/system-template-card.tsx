"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, Clock, Loader2, RefreshCw, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { BackendError, backendUrl } from "@/lib/backend/client";
import { getSystemTemplates, refreshSystemTemplates, submitSystemTemplate, type SystemTemplateKind, type SystemTemplates } from "@/lib/system-templates";

/**
 * "Updates after 24 hours": WhatsApp only allows free text within 24 hours of the customer's last
 * message. This card creates AutoShift's approved template for this kind of update in one click.
 */
export function SystemTemplateCard({ kind, language }: { kind: SystemTemplateKind; language: string }) {
  const t = useTranslations("SystemTemplates");
  const [all, setAll] = useState<SystemTemplates | null>(null);
  const [busy, setBusy] = useState<"submit" | "refresh" | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!backendUrl()) return;
    getSystemTemplates().then(setAll).catch(() => setError(t("loadFailed")));
  }, [t]);

  if (!backendUrl()) return null;
  const info = all?.[kind];
  const status = info?.status ?? "NONE";

  const run = async (what: "submit" | "refresh") => {
    setBusy(what);
    setError("");
    try {
      const next = what === "submit" ? await submitSystemTemplate(kind, language) : await refreshSystemTemplates();
      setAll(next);
      if (what === "submit") toast.success(t("submitted"));
    } catch (e) {
      setError(e instanceof BackendError ? e.message : t("failed"));
    } finally {
      setBusy(null);
    }
  };

  const badge =
    status === "APPROVED" ? (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"><CheckCircle2 className="size-3.5" aria-hidden /> {t("approved")}</span>
    ) : status === "PENDING" ? (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200"><Clock className="size-3.5" aria-hidden /> {t("pending")}</span>
    ) : status === "REJECTED" ? (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-2.5 py-1 text-xs font-medium text-rose-900 dark:bg-rose-950 dark:text-rose-200"><XCircle className="size-3.5" aria-hidden /> {t("rejected")}</span>
    ) : (
      <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">{t("none")}</span>
    );

  return (
    <section className="rounded-xl border border-border p-4" aria-labelledby={`systpl-${kind}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`systpl-${kind}`} className="text-sm font-semibold text-foreground">{t(`title_${kind}`)}</h3>
        {all ? badge : <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label={t("loading")} />}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{t(`help_${kind}`)}</p>
      <p className="mt-2 rounded-lg bg-muted/60 p-2 text-xs text-foreground">{t(`preview_${kind}`)}</p>
      {status === "REJECTED" && info?.rejection_reason && <p className="mt-2 text-xs text-rose-800 dark:text-rose-300">{t("reason", { reason: info.rejection_reason })}</p>}
      {error && <p role="alert" className="mt-2 text-xs text-rose-800 dark:text-rose-300">{error}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {(status === "NONE" || status === "REJECTED") && (
          <Button className="min-h-11" disabled={busy !== null || !all} onClick={() => void run("submit")}>
            {busy === "submit" && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {t("create")}
          </Button>
        )}
        {status !== "NONE" && status !== "APPROVED" && (
          <Button variant="outline" className="min-h-11 gap-1.5" disabled={busy !== null} onClick={() => void run("refresh")}>
            {busy === "refresh" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />}
            {t("refresh")}
          </Button>
        )}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{t("cost")}</p>
    </section>
  );
}
