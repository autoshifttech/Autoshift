"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, Download, ExternalLink, FileLock2, Trash2, UserX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { useAuth } from "@/hooks/use-auth";
import { GRACE_DAYS, cancelDeletion, exportLocalData, scheduleDeletion, useDeletion } from "@/lib/account/deletion";
import { consentStore, isValidPhone, phoneKey } from "@/lib/consent/model";
import { SettingsPanelHead } from "./settings-panel-head";

const REASONS = ["price", "missing", "hard", "switching", "closing", "other"] as const;

export function DataPrivacyPanel() {
  const t = useTranslations("Privacy");
  const locale = useLocale();
  const { account } = useAuth();
  const deletion = useDeletion();
  const workspace = account?.name ?? "My workspace";
  const [customer, setCustomer] = useState("");
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [reason, setReason] = useState("");
  const day = (iso: string) => new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" });

  const download = () => {
    const url = URL.createObjectURL(exportLocalData());
    const a = document.createElement("a");
    a.href = url;
    a.download = `autoshift-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t("exported"));
  };

  return (
    <section className="space-y-6">
      <SettingsPanelHead title={t("title")} description={t("description")} />

      {deletion.eraseOn && (
        <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/5 p-4 sm:flex-row sm:items-center">
          <AlertTriangle className="size-5 shrink-0 text-rose-700 dark:text-rose-400" />
          <p className="flex-1 text-sm text-foreground">{t("scheduledBanner", { date: day(deletion.eraseOn) })}</p>
          <Button
            variant="outline"
            onClick={() => {
              cancelDeletion();
              toast.success(t("cancelled"));
            }}
          >
            {t("cancelDeletion")}
          </Button>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--tone-sky)] text-foreground">
            <Download className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-foreground">{t("exportTitle")}</h3>
            <p className="text-sm text-muted-foreground">{t("exportDesc")}</p>
            <Button variant="outline" className="mt-3 gap-1.5" onClick={download}>
              <Download className="size-4" />
              {t("exportButton")}
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--tone-peach)] text-foreground">
            <UserX className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-foreground">{t("customerTitle")}</h3>
            <p className="text-sm text-muted-foreground">{t("customerDesc")}</p>
            <form
              className="mt-3 flex flex-col gap-2 sm:flex-row"
              onSubmit={(e) => {
                e.preventDefault();
                if (!isValidPhone(customer)) return;
                const k = phoneKey(customer);
                consentStore.set((s) => ({ ...s, records: s.records.filter((r) => phoneKey(r.phone) !== k) }));
                toast.success(t("customerDeleted", { phone: customer.trim() }));
                setCustomer("");
              }}
            >
              <Input value={customer} onChange={(e) => setCustomer(e.target.value)} inputMode="tel" placeholder="+91 98765 43210" aria-label={t("customerPhone")} className="sm:max-w-64" />
              <Button type="submit" variant="outline" disabled={!isValidPhone(customer)}>
                {t("customerButton")}
              </Button>
            </form>
            <p className="mt-2 text-xs text-muted-foreground">{t("customerHint")}</p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--tone-mint)] text-primary">
            <FileLock2 className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-foreground">{t("policiesTitle")}</h3>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {[
                ["/privacy", t("privacyLink")],
                ["/terms", t("termsLink")],
                ["/data-deletion", t("deletionLink")],
              ].map(([href, label]) => (
                <Link key={href} href={href} target="_blank" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
                  {label}
                  <ExternalLink className="size-3" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-rose-500/30 bg-card p-5 shadow-[var(--shadow-card)]">
        <h3 className="font-semibold text-rose-700 dark:text-rose-400">{t("dangerTitle")}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t("deleteDesc", { days: GRACE_DAYS })}</p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>{t("deleteWhatsapp")}</li>
          <li>{t("deletePlan")}</li>
          <li>{t("deleteWallet")}</li>
          <li>{t("deleteInvoices")}</li>
        </ul>
        <Button variant="destructive" className="mt-4 gap-1.5" disabled={!!deletion.eraseOn} onClick={() => setOpen(true)}>
          <Trash2 className="size-4" />
          {t("deleteButton")}
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("confirmTitle", { name: workspace })}</DialogTitle>
            <DialogDescription>{t("confirmDesc", { days: GRACE_DAYS })}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="del-reason">{t("reason")}</Label>
              <NativeSelect id="del-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
                <option value="">{t("reasonPlaceholder")}</option>
                {REASONS.map((r) => (
                  <option key={r} value={r}>
                    {t(`reason_${r}`)}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="del-name">{t("typeName", { name: workspace })}</Label>
              <Input id="del-name" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t("keep")}
            </Button>
            <Button
              variant="destructive"
              disabled={typed.trim() !== workspace || !reason}
              onClick={() => {
                scheduleDeletion(reason);
                setOpen(false);
                setTyped("");
                toast.success(t("scheduled"));
              }}
            >
              {t("deleteButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
