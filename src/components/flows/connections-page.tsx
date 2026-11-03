"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "@/lib/toast";
import { ChevronRight, Eye, EyeOff, Link2, Loader2, Plus, ShieldCheck, Table2, Trash2 } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EmptyPanel } from "@/components/ui/empty-panel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { addConnection, maskKey, parseServiceAccount, removeConnection, useConnections, type ConnectionKind, type FlowConnection } from "@/lib/flows/connections";
import { CashfreeLogo, ConnectionLogo, GoogleLogo, RazorpayLogo } from "./connection-logos";

type T = ReturnType<typeof useTranslations>;

/** A password-style field with a show/hide button. */
function SecretInput({ id, value, onChange, placeholder, invalid, t }: { id: string; value: string; onChange: (v: string) => void; placeholder: string; invalid?: boolean; t: T }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input id={id} type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoComplete="off" aria-invalid={invalid} className="pr-11" />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        aria-label={show ? t("hideSecret") : t("showSecret")}
        className="absolute top-1/2 right-1 flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

function Field({ id, label, required, optional, error, hint, children }: { id: string; label: string; required?: boolean; optional?: string; error?: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>
        {label}
        {required && <span className="ml-1 text-destructive" aria-hidden>*</span>}
        {optional && <span className="ml-1 font-normal text-muted-foreground">{optional}</span>}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p role="alert" className="text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}

function SecurityNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-xs text-muted-foreground">
      <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

const code = (chunks: React.ReactNode) => <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{chunks}</code>;
const bold = (chunks: React.ReactNode) => <strong className="font-semibold text-foreground">{chunks}</strong>;

function GoogleDialog({ open, onOpenChange, t }: { open: boolean; onOpenChange: (o: boolean) => void; t: T }) {
  const [name, setName] = useState("");
  const [json, setJson] = useState("");
  const [error, setError] = useState("");

  const reset = () => { setName(""); setJson(""); setError(""); };
  const submit = () => {
    const r = parseServiceAccount(json.trim());
    if ("error" in r) return setError(t(r.error === "invalid" ? "googleInvalidJson" : "googleNotServiceAccount"));
    addConnection({ kind: "google", name: name.trim() || r.email, detail: r.email });
    toast.success(t("added"));
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("googleTitle")}</DialogTitle>
          <DialogDescription className="sr-only">{t("bannerDesc")}</DialogDescription>
        </DialogHeader>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
          <li>{t.rich("googleStep1", { b: bold, code })}</li>
          <li>{t.rich("googleStep2", { b: bold })}</li>
          <li>{t.rich("googleStep3", { code })}</li>
        </ol>
        <Input aria-label={t("nameOptional")} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("googleNamePh")} />
        <div className="grid gap-1.5">
          <Textarea aria-label={t("googleJsonLabel")} aria-invalid={!!error} rows={9} value={json} onChange={(e) => { setJson(e.target.value); setError(""); }} placeholder={t("googleJsonPh")} className="min-h-44 font-mono text-xs" />
          {error && <p role="alert" className="text-xs font-medium text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("cancel")}</Button>
          <Button onClick={submit} disabled={!json.trim()}>{t("addAccount")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Pretends to check the keys with the provider; the real check runs on the backend. */
function useVerify(t: T) {
  const [busy, setBusy] = useState(false);
  const run = (done: () => void) => {
    setBusy(true);
    setTimeout(() => { setBusy(false); done(); toast.success(t("added")); }, 700);
  };
  return { busy, run };
}

function RazorpayDialog({ open, onOpenChange, t }: { open: boolean; onOpenChange: (o: boolean) => void; t: T }) {
  const [name, setName] = useState("");
  const [keyId, setKeyId] = useState("");
  const [secret, setSecret] = useState("");
  const [webhook, setWebhook] = useState("");
  const [tried, setTried] = useState(false);
  const { busy, run } = useVerify(t);

  const idOk = /^rzp_(live|test)_[A-Za-z0-9]{6,}$/.test(keyId.trim());
  const secretOk = secret.trim().length >= 8;
  const reset = () => { setName(""); setKeyId(""); setSecret(""); setWebhook(""); setTried(false); };
  const submit = () => {
    setTried(true);
    if (!idOk || !secretOk) return;
    run(() => {
      addConnection({ kind: "razorpay", name: name.trim() || `Razorpay — ${keyId.includes("_live_") ? t("live") : t("test")}`, detail: maskKey(keyId), mode: keyId.includes("_live_") ? "live" : "test" });
      reset();
      onOpenChange(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><RazorpayLogo className="size-5" /> {t("razorpayTitle")}</DialogTitle>
          <DialogDescription>{t.rich("razorpayIntro", { b: bold, code })}</DialogDescription>
        </DialogHeader>
        <Field id="rzp-name" label={t("nameOptional")}>
          <Input id="rzp-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("razorpayNamePh")} />
        </Field>
        <Field id="rzp-id" label={t("keyId")} required error={tried && !idOk ? t("razorpayKeyIdError") : undefined}>
          <Input id="rzp-id" value={keyId} onChange={(e) => setKeyId(e.target.value)} placeholder="rzp_live_… or rzp_test_…" autoComplete="off" aria-invalid={tried && !idOk} />
        </Field>
        <Field id="rzp-secret" label={t("keySecret")} required error={tried && !secretOk ? t("secretError") : undefined}>
          <SecretInput id="rzp-secret" value={secret} onChange={setSecret} placeholder={t("secret")} invalid={tried && !secretOk} t={t} />
        </Field>
        <Field id="rzp-hook" label={t("webhookSecret")} optional={t("optional")} hint={t.rich("razorpayWebhookHint", { b: bold })}>
          <SecretInput id="rzp-hook" value={webhook} onChange={setWebhook} placeholder={t("razorpayWebhookPh")} t={t} />
        </Field>
        <SecurityNote>{t("securityNote", { provider: "Razorpay" })}</SecurityNote>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>{t("cancel")}</Button>
          <Button onClick={submit} disabled={busy || !keyId.trim() || !secret.trim()}>
            {busy && <Loader2 className="mr-2 size-4 animate-spin" />} {t("verifyAndAdd")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CashfreeDialog({ open, onOpenChange, t }: { open: boolean; onOpenChange: (o: boolean) => void; t: T }) {
  const [name, setName] = useState("");
  const [env, setEnv] = useState("production");
  const [clientId, setClientId] = useState("");
  const [secret, setSecret] = useState("");
  const [tried, setTried] = useState(false);
  const { busy, run } = useVerify(t);

  const idOk = clientId.trim().length >= 6;
  const secretOk = secret.trim().length >= 8;
  const reset = () => { setName(""); setEnv("production"); setClientId(""); setSecret(""); setTried(false); };
  const submit = () => {
    setTried(true);
    if (!idOk || !secretOk) return;
    run(() => {
      addConnection({ kind: "cashfree", name: name.trim() || `Cashfree — ${t(env)}`, detail: maskKey(clientId), mode: env });
      reset();
      onOpenChange(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><CashfreeLogo className="size-5" /> {t("cashfreeTitle")}</DialogTitle>
          <DialogDescription>{t.rich("cashfreeIntro", { b: bold })}</DialogDescription>
        </DialogHeader>
        <Field id="cf-name" label={t("nameOptional")}>
          <Input id="cf-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("cashfreeNamePh")} />
        </Field>
        <Field id="cf-env" label={t("environment")}>
          <NativeSelect id="cf-env" value={env} onChange={(e) => setEnv(e.target.value)}>
            <option value="production">{t("production")}</option>
            <option value="sandbox">{t("sandbox")}</option>
          </NativeSelect>
        </Field>
        <Field id="cf-id" label={t("clientId")} required error={tried && !idOk ? t("clientIdError") : undefined}>
          <Input id="cf-id" value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder={t("clientIdPh")} autoComplete="off" aria-invalid={tried && !idOk} />
        </Field>
        <Field id="cf-secret" label={t("clientSecret")} required error={tried && !secretOk ? t("secretError") : undefined}>
          <SecretInput id="cf-secret" value={secret} onChange={setSecret} placeholder={t("secret")} invalid={tried && !secretOk} t={t} />
        </Field>
        <SecurityNote>{t("securityNote", { provider: "Cashfree" })}</SecurityNote>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>{t("cancel")}</Button>
          <Button onClick={submit} disabled={busy || !clientId.trim() || !secret.trim()}>
            {busy && <Loader2 className="mr-2 size-4 animate-spin" />} {t("verifyAndAdd")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const KIND_LABEL: Record<ConnectionKind, string> = { google: "kindGoogle", razorpay: "kindRazorpay", cashfree: "kindCashfree" };

function ConnectionCard({ c, onRemove, t, locale }: { c: FlowConnection; onRemove: () => void; t: T; locale: string }) {
  return (
    <li className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted/60">
        <ConnectionLogo kind={c.kind} className="size-6" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-foreground">{c.name}</p>
        <p className="truncate text-sm text-muted-foreground">
          {t(KIND_LABEL[c.kind])}
          {c.mode ? ` · ${t(c.mode)}` : ""} · {c.detail}
        </p>
        <p className="text-xs text-muted-foreground">{t("addedOn", { date: new Date(c.createdAt).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" }) })}</p>
      </div>
      <span className="hidden rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary sm:inline">{t("connected")}</span>
      <Button variant="ghost" size="icon" aria-label={t("remove", { name: c.name })} onClick={onRemove} className="size-10 text-muted-foreground hover:text-destructive">
        <Trash2 className="size-4" />
      </Button>
    </li>
  );
}

export function ConnectionsPage() {
  const t = useTranslations("FlowConnections");
  const tNav = useTranslations("Header");
  const locale = useLocale();
  const connections = useConnections();
  const [dialog, setDialog] = useState<ConnectionKind | null>(null);
  const [removing, setRemoving] = useState<FlowConnection | null>(null);

  const closeDialog = (o: boolean) => { if (!o) setDialog(null); };

  return (
    <div className="space-y-5">
      <nav aria-label={t("breadcrumb")} className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
        <Link href="/dashboard" className="rounded px-1 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">{tNav("dashboard")}</Link>
        <ChevronRight className="size-3.5" aria-hidden />
        <Link href="/flows" className="rounded px-1 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">{tNav("flows")}</Link>
        <ChevronRight className="size-3.5" aria-hidden />
        <span aria-current="page" className="px-1 font-medium text-foreground">{t("title")}</span>
      </nav>

      <section className="flex flex-col gap-5 rounded-3xl border border-border bg-card p-5 shadow-[var(--shadow-card)] md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <span className="flex shrink-0 items-center gap-2 rounded-2xl bg-background px-3 py-3 shadow-[var(--shadow-card)]">
            <GoogleLogo className="size-6" />
            <RazorpayLogo className="size-6" />
            <CashfreeLogo className="size-6" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-foreground">{t("bannerTitle")}</h2>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">{t("bannerDesc")}</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button className="h-10" onClick={() => toast.info(t("googleSoon"))}>
            <Plus className="mr-1.5 size-4" /> {t("connectGoogle")}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger className={cn(buttonVariants({ variant: "outline" }), "h-10")}>
              <Link2 className="mr-1.5 size-4" /> {t("addAnother")}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-56">
              <DropdownMenuItem onClick={() => setDialog("google")}><Table2 className="size-4" /> {t("googleServiceAccount")}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setDialog("razorpay")}><RazorpayLogo className="size-4" /> Razorpay</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setDialog("cashfree")}><CashfreeLogo className="size-4" /> Cashfree</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </section>

      {connections.length === 0 ? (
        <EmptyPanel icon={Table2} title={t("emptyTitle")} description={t("emptyDesc")} className="rounded-3xl border border-dashed border-border py-14" />
      ) : (
        <ul className="grid gap-3">
          {connections.map((c) => (
            <ConnectionCard key={c.id} c={c} t={t} locale={locale} onRemove={() => setRemoving(c)} />
          ))}
        </ul>
      )}

      <GoogleDialog open={dialog === "google"} onOpenChange={closeDialog} t={t} />
      <RazorpayDialog open={dialog === "razorpay"} onOpenChange={closeDialog} t={t} />
      <CashfreeDialog open={dialog === "cashfree"} onOpenChange={closeDialog} t={t} />

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={t("removeTitle", { name: removing?.name ?? "" })}
        description={t("removeDesc")}
        confirmLabel={t("removeConfirm")}
        cancelLabel={t("cancel")}
        onConfirm={() => { if (removing) { removeConnection(removing.id); toast.success(t("removed")); } setRemoving(null); }}
      />
    </div>
  );
}
