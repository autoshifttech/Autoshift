"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { CheckCircle2, Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "@/lib/toast";
import { BackendError } from "@/lib/backend/client";
import { isOn, pageForPath, requestPage, usePages, type OptionalPage } from "@/lib/workspace/pages";

/**
 * Shows the page, or, when the AutoShift team hasn't switched it on for this business, a calm
 * "not switched on" screen with a "Request access" button that opens a support ticket.
 */
export function PageGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const pages = usePages();
  const page = pageForPath(pathname);
  // While loading, show the page: every page is on unless the account says otherwise.
  if (!pages.loaded || isOn(pages, page) || !page) return <>{children}</>;
  return <PageOff page={page} />;
}

export function PageOff({ page }: { page: OptionalPage }) {
  const t = useTranslations("PageAccess");
  const ts = useTranslations("Sidebar");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const label = ts(LABEL_KEY[page]);

  const ask = async () => {
    setBusy(true);
    try {
      const out = await requestPage(page, note);
      setSent(out.ticket ?? "");
      if (out.already_requested) toast.info(t("alreadyRequested"));
      else toast.success(t("requested"));
    } catch (e) {
      toast.error(e instanceof BackendError ? e.message : t("failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mx-auto mt-6 max-w-lg rounded-2xl border border-border bg-card p-6 text-center shadow-[var(--shadow-card)]" aria-labelledby="page-off-title">
      <span aria-hidden className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
        {sent !== null ? <CheckCircle2 className="size-7" /> : <Lock className="size-6" />}
      </span>
      <h2 id="page-off-title" className="mt-4 text-lg font-semibold text-foreground">
        {sent !== null ? t("sentTitle") : t("title", { page: label })}
      </h2>
      <p className="mt-1.5 text-sm text-muted-foreground">{sent !== null ? t("sentHelp") : t("help", { page: label })}</p>
      {sent === null ? (
        <div className="mt-5 grid gap-1.5 text-left">
          <Label htmlFor="page-off-note">{t("noteLabel")}</Label>
          <Textarea id="page-off-note" rows={3} maxLength={1000} value={note} placeholder={t("notePlaceholder")} onChange={(e) => setNote(e.target.value)} />
          <Button className="mt-3 min-h-11" disabled={busy} onClick={() => void ask()}>
            {busy ? t("sending") : t("request")}
          </Button>
        </div>
      ) : (
        <Link href="/support" className="mt-5 inline-flex min-h-11 items-center font-medium text-primary hover:underline">
          {t("openSupport")}
        </Link>
      )}
      <Link href="/dashboard" className="mt-2 block text-sm text-muted-foreground hover:text-foreground">
        {t("back")}
      </Link>
    </section>
  );
}

const LABEL_KEY: Record<OptionalPage, string> = {
  leads: "leads",
  orders: "orders",
  insights: "insights",
  broadcasts: "broadcasts",
  templates: "templates",
  drips: "drips",
  segments: "segments",
  automations: "automations",
  flows: "flows",
  ai_tools: "aiTools",
};
