"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "@/lib/toast";
import { AlertTriangle, CheckCircle2, ChevronRight, ExternalLink, FileUp, Eye, EyeOff, Link2, Loader2, Plus, RefreshCw, ShieldCheck, Table2, Trash2 } from "lucide-react";

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
import { addConnection, cashfreeMode, createConnection, deleteConnection, googleSignInAvailable, isStoreKind, loadConnections, maskKey, parseServiceAccount, setStoreOptions, startGoogleSignIn, storeStatus, syncStore, useConnections, type ConnectionKind, type FlowConnection, type StoreStatus } from "@/lib/flows/connections";
import { backendUrl } from "@/lib/backend/client";
import { CashfreeLogo, ConnectionLogo, GoogleLogo, RazorpayLogo, ShopifyLogo, WooLogo } from "./connection-logos";
import { Switch } from "@/components/ui/switch";

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

const GOOGLE_LINKS = {
  accounts: "https://console.cloud.google.com/iam-admin/serviceaccounts",
  sheets: "https://console.cloud.google.com/apis/library/sheets.googleapis.com",
  calendar: "https://console.cloud.google.com/apis/library/calendar-json.googleapis.com",
  help: "https://cloud.google.com/iam/docs/keys-create-delete",
} as const;
const MAX_KEY_BYTES = 20_000;

/** A link that opens Google Cloud in a new tab (the dialog stays open here). */
function OutLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-1.5 inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-background px-3 text-sm font-medium text-primary hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {children} <ExternalLink className="size-3.5" aria-hidden />
    </a>
  );
}

type GuideLink = { href: string; label: string };
type GuideStep = { title: string; help: string; links?: GuideLink[] };

/** Numbered set-up steps with buttons that open the provider's page in a new tab. */
function SetupGuide({ steps, t }: { steps: GuideStep[]; t: T }) {
  return (
    <ol className="space-y-3 text-sm">
      {steps.map((step, i) => (
        <li key={step.title} className="flex gap-3">
          <span aria-hidden className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{i + 1}</span>
          <div className="min-w-0">
            <p className="font-medium text-foreground">{t(step.title)}</p>
            <p className="mt-0.5 text-muted-foreground">{t.rich(step.help, { b: bold, code })}</p>
            {step.links && step.links.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {step.links.map((l) => <OutLink key={l.href} href={l.href}>{t(l.label)}</OutLink>)}
              </div>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

const LINKS = {
  rzpKeys: "https://dashboard.razorpay.com/app/website-app-settings/api-keys",
  rzpHooks: "https://dashboard.razorpay.com/app/webhooks",
  rzpHelp: "https://razorpay.com/docs/payments/dashboard/account-settings/api-keys/",
  cfDashboard: "https://merchant.cashfree.com/merchants/login",
  cfHelp: "https://www.cashfree.com/docs/",
  shopifyAdmin: "https://admin.shopify.com/",
  shopifyDev: "https://dev.shopify.com/dashboard",
  shopifyHelp: "https://help.shopify.com/en/manual/apps/app-types/custom-apps",
  wooHelp: "https://woocommerce.com/document/woocommerce-rest-api/",
} as const;

/** "mystore", "mystore.myshopify.com" or an admin link → the store handle, or "" while unclear. */
function shopHandle(value: string): string {
  const v = value.trim().toLowerCase();
  const fromAdmin = v.match(/admin\.shopify\.com\/store\/([a-z0-9-]+)/);
  if (fromAdmin) return fromAdmin[1];
  const host = v.replace(/^https?:\/\//, "").split("/")[0];
  const handle = host.endsWith(".myshopify.com") ? host.slice(0, -".myshopify.com".length) : host.includes(".") ? "" : host;
  return /^[a-z0-9][a-z0-9-]{1,60}$/.test(handle) ? handle : "";
}

/** The WordPress site's REST API keys page, once the address looks like a site. */
function wooKeysPage(value: string): string {
  const v = value.trim().replace(/\/+$/, "");
  if (!/^(https:\/\/)?[^\s/]+\.[^\s/]+(\/[^\s]*)?$/i.test(v) || /^http:\/\//i.test(v)) return "";
  const base = v.startsWith("https://") ? v : `https://${v}`;
  return `${base}/wp-admin/admin.php?page=wc-settings&tab=advanced&section=keys`;
}

function GoogleDialog({ open, onOpenChange, t }: { open: boolean; onOpenChange: (o: boolean) => void; t: T }) {
  const [name, setName] = useState("");
  const [json, setJson] = useState("");
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const pick = useRef<HTMLInputElement>(null);

  const parsed = json.trim() ? parseServiceAccount(json.trim()) : null;
  const email = parsed && "email" in parsed ? parsed.email : "";

  const reset = () => { setName(""); setJson(""); setFileName(""); setError(""); setDragging(false); };
  const check = (text: string) => {
    const r = parseServiceAccount(text.trim());
    setError("error" in r ? t(r.error === "invalid" ? "googleInvalidJson" : "googleNotServiceAccount") : "");
  };
  const readFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_KEY_BYTES || !/\.json$/i.test(file.name)) {
      setError(t("googleFileWrong"));
      return;
    }
    const text = await file.text();
    setJson(text);
    setFileName(file.name);
    check(text);
  };
  const copyEmail = () =>
    navigator.clipboard.writeText(email).then(
      () => toast.success(t("googleEmailCopied")),
      () => toast.error(t("webhookCopyFailed")),
    );

  const submit = () => {
    const r = parseServiceAccount(json.trim());
    if ("error" in r) return setError(t(r.error === "invalid" ? "googleInvalidJson" : "googleNotServiceAccount"));
    if (backendUrl()) {
      // The key goes to the server once and is stored there encrypted; the browser keeps nothing.
      setBusy(true);
      createConnection({ kind: "google", name: name.trim() || r.email, serviceAccountJson: json.trim() }).then(
        () => {
          toast.success(t("added"));
          reset();
          onOpenChange(false);
        },
        (e) => setError(e instanceof Error ? e.message : t("googleInvalidJson")),
      ).finally(() => setBusy(false));
      return;
    }
    addConnection({ kind: "google", name: name.trim() || r.email, detail: r.email });
    toast.success(t("added"));
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><GoogleLogo className="size-5" /> {t("googleTitle")}</DialogTitle>
          <DialogDescription>{t("googleIntro")}</DialogDescription>
        </DialogHeader>

        <SetupGuide
          t={t}
          steps={[
            { title: "googleGuide1", help: "googleGuide1Help", links: [{ href: GOOGLE_LINKS.accounts, label: "googleOpenAccounts" }] },
            { title: "googleGuide2", help: "googleGuide2Help" },
            { title: "googleGuide3", help: "googleGuide3Help", links: [{ href: GOOGLE_LINKS.sheets, label: "googleOpenSheets" }, { href: GOOGLE_LINKS.calendar, label: "googleOpenCalendar" }] },
            { title: "googleGuide4", help: "googleGuide4Help" },
            { title: "googleGuide5", help: "googleGuide5Help" },
          ]}
        />

        <div className="grid gap-1.5">
          <Label htmlFor="g-name">{t("nameOptional")}</Label>
          <Input id="g-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("googleNamePh")} />
        </div>

        <div className="grid gap-1.5">
          <p id="g-key-label" className="text-sm font-medium text-foreground">{t("googleJsonLabel")}</p>
          <div
            role="group"
            aria-labelledby="g-key-label"
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); void readFile(e.dataTransfer.files?.[0]); }}
            className={cn(
              "flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-5 text-center transition-colors motion-reduce:transition-none",
              dragging ? "border-primary bg-primary/5" : email ? "border-primary/40 bg-primary/5" : "border-border bg-muted/40",
            )}
          >
            {email ? <CheckCircle2 className="size-6 text-primary" aria-hidden /> : <FileUp className="size-6 text-muted-foreground" aria-hidden />}
            <p className="text-sm text-foreground">{email ? t("googleFileReady", { file: fileName || "JSON" }) : t("googleDrop")}</p>
            <Button type="button" variant="outline" className="min-h-11" onClick={() => pick.current?.click()}>
              {email ? t("googleChooseOther") : t("googleChoose")}
            </Button>
            <input ref={pick} type="file" accept=".json,application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; void readFile(f); }} />
          </div>
          <details className="group rounded-xl border border-border px-3 py-2" open={!!json && !fileName}>
            <summary className="flex min-h-9 cursor-pointer items-center text-sm font-medium text-foreground">{t("googlePasteInstead")}</summary>
            <Textarea
              aria-label={t("googleJsonLabel")}
              aria-invalid={!!error}
              rows={6}
              value={json}
              onChange={(e) => { setJson(e.target.value); setFileName(""); setError(""); }}
              onBlur={() => json.trim() && check(json)}
              placeholder={t("googleJsonPh")}
              className="mt-2 min-h-32 font-mono text-xs"
            />
          </details>
          {error && <p role="alert" className="text-xs font-medium text-destructive">{error}</p>}
        </div>

        {email && (
          <div className="rounded-xl bg-muted/60 p-3 text-sm" aria-live="polite">
            <p className="text-foreground">{t("googleShareWith")}</p>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
              <code className="min-w-0 flex-1 rounded-md bg-background px-2 py-1.5 font-mono text-xs break-all text-foreground select-all">{email}</code>
              <Button type="button" variant="outline" size="sm" className="min-h-11 shrink-0" onClick={() => void copyEmail()}>{t("googleCopyEmail")}</Button>
            </div>
          </div>
        )}

        <SecurityNote>{t.rich("googleSecurity", { a: (c) => <a href={GOOGLE_LINKS.help} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">{c}</a> })}</SecurityNote>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>{t("cancel")}</Button>
          <Button onClick={submit} disabled={busy || !email}>
            {busy && <Loader2 className="mr-2 size-4 animate-spin" />} {t("addAccount")}
          </Button>
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
    if (backendUrl()) {
      createConnection({ kind: "razorpay", name: name.trim() || `Razorpay — ${keyId.includes("_live_") ? t("live") : t("test")}`, keyId, keySecret: secret, webhookSecret: webhook }).then(
        () => {
          toast.success(t("added"));
          reset();
          onOpenChange(false);
        },
        (e) => toast.error(e instanceof Error ? e.message : t("cancel")),
      );
      return;
    }
    run(() => {
      addConnection({ kind: "razorpay", name: name.trim() || `Razorpay — ${keyId.includes("_live_") ? t("live") : t("test")}`, detail: maskKey(keyId), mode: keyId.includes("_live_") ? "live" : "test" });
      reset();
      onOpenChange(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><RazorpayLogo className="size-5" /> {t("razorpayTitle")}</DialogTitle>
          <DialogDescription>{t("razorpayAbout")}</DialogDescription>
        </DialogHeader>
        <SetupGuide
          t={t}
          steps={[
            { title: "rzpGuide1", help: "rzpGuide1Help", links: [{ href: LINKS.rzpKeys, label: "rzpOpenKeys" }] },
            { title: "rzpGuide2", help: "rzpGuide2Help" },
            { title: "rzpGuide3", help: "rzpGuide3Help" },
            { title: "rzpGuide4", help: "rzpGuide4Help", links: [{ href: LINKS.rzpHooks, label: "rzpOpenHooks" }, { href: LINKS.rzpHelp, label: "openHelp" }] },
          ]}
        />
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
  const [appId, setAppId] = useState("");
  const [secret, setSecret] = useState("");
  const [mode, setMode] = useState<"test" | "live" | "">("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);

  const idOk = /^[A-Za-z0-9_-]{6,120}$/.test(appId.trim());
  const secretOk = secret.trim().length >= 8;
  // Guessed from the keys until the person picks one.
  const chosen = mode || (appId || secret ? cashfreeMode(appId, secret) : "test");
  const reset = () => { setName(""); setAppId(""); setSecret(""); setMode(""); setTried(false); };
  const submit = () => {
    setTried(true);
    if (!idOk || !secretOk) return;
    const label = name.trim() || `Cashfree — ${chosen === "live" ? t("live") : t("test")}`;
    if (!backendUrl()) {
      addConnection({ kind: "cashfree", name: label, detail: maskKey(appId), mode: chosen });
      toast.success(t("added"));
      reset();
      onOpenChange(false);
      return;
    }
    setBusy(true);
    createConnection({ kind: "cashfree", name: label, appId, secretKey: secret, mode: chosen }).then(
      () => {
        toast.success(t("added"));
        reset();
        onOpenChange(false);
      },
      (e) => toast.error(e instanceof Error ? e.message : t("saveFailed")),
    ).finally(() => setBusy(false));
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><CashfreeLogo className="size-5" /> {t("cashfreeTitle")}</DialogTitle>
          <DialogDescription>{t("cashfreeAbout")}</DialogDescription>
        </DialogHeader>
        <SetupGuide
          t={t}
          steps={[
            { title: "cfGuide1", help: "cfGuide1Help", links: [{ href: LINKS.cfDashboard, label: "cfOpenDashboard" }] },
            { title: "cfGuide2", help: "cfGuide2Help" },
            { title: "cfGuide3", help: "cfGuide3Help" },
            { title: "cfGuide4", help: "cfGuide4Help", links: [{ href: LINKS.cfHelp, label: "openHelp" }] },
          ]}
        />
        <Field id="cf-name" label={t("nameOptional")}>
          <Input id="cf-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("cashfreeNamePh")} />
        </Field>
        <Field id="cf-mode" label={t("environment")}>
          <NativeSelect id="cf-mode" value={chosen} onChange={(e) => setMode(e.target.value as "test" | "live")}>
            <option value="test">{t("sandbox")}</option>
            <option value="live">{t("production")}</option>
          </NativeSelect>
        </Field>
        <Field id="cf-id" label={t("cashfreeAppId")} required error={tried && !idOk ? t("clientIdError") : undefined}>
          <Input id="cf-id" value={appId} onChange={(e) => setAppId(e.target.value)} placeholder={t("clientIdPh")} autoComplete="off" aria-invalid={tried && !idOk} />
        </Field>
        <Field id="cf-secret" label={t("cashfreeSecret")} required error={tried && !secretOk ? t("secretError") : undefined}>
          <SecretInput id="cf-secret" value={secret} onChange={setSecret} placeholder={t("secret")} invalid={tried && !secretOk} t={t} />
        </Field>
        <SecurityNote>{t("securityNoteSaved", { provider: "Cashfree" })}</SecurityNote>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>{t("cancel")}</Button>
          <Button onClick={submit} disabled={busy || !appId.trim() || !secret.trim()}>
            {busy && <Loader2 className="mr-2 size-4 animate-spin" />} {t("addAccount")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** After a store is added: bring its products in straight away and say how many. */
async function firstSync(id: string, t: T) {
  try {
    const out = await syncStore(id);
    toast.success(t("storeSynced", { count: out.products?.count ?? 0 }));
  } catch (e) {
    toast.error(e instanceof Error ? e.message : t("storeSyncFailed"));
  }
}

function ShopifyDialog({ open, onOpenChange, t }: { open: boolean; onOpenChange: (o: boolean) => void; t: T }) {
  const [shop, setShop] = useState("");
  const [useClient, setUseClient] = useState(false);
  const [token, setToken] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);

  const shopOk = shop.trim().length >= 3;
  const keysOk = useClient ? clientId.trim().length >= 6 && clientSecret.trim().length >= 6 : token.trim().length >= 10;
  const reset = () => { setShop(""); setToken(""); setClientId(""); setClientSecret(""); setUseClient(false); setTried(false); };
  const submit = () => {
    setTried(true);
    if (!shopOk || !keysOk) return;
    setBusy(true);
    createConnection(useClient ? { kind: "shopify", name: "", shop, clientId, clientSecret } : { kind: "shopify", name: "", shop, accessToken: token }).then(
      async (row) => {
        toast.success(t("added"));
        reset();
        onOpenChange(false);
        await firstSync(row.id, t);
      },
      (e) => toast.error(e instanceof Error ? e.message : t("saveFailed")),
    ).finally(() => setBusy(false));
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ShopifyLogo className="size-5" /> {t("shopifyTitle")}</DialogTitle>
          <DialogDescription>{t("shopifyIntro")}</DialogDescription>
        </DialogHeader>
        <SetupGuide
          t={t}
          steps={[
            { title: "shopifyGuide1", help: "shopifyGuide1Help", links: [{ href: shopHandle(shop) ? `https://admin.shopify.com/store/${shopHandle(shop)}/settings/apps/development` : LINKS.shopifyAdmin, label: shopHandle(shop) ? "shopifyOpenApps" : "shopifyOpenAdmin" }] },
            { title: "shopifyGuide2", help: "shopifyGuide2Help" },
            { title: "shopifyGuide3", help: "shopifyGuide3Help" },
            { title: "shopifyGuide4", help: "shopifyGuide4Help", links: [{ href: LINKS.shopifyDev, label: "shopifyOpenDev" }, { href: LINKS.shopifyHelp, label: "openHelp" }] },
          ]}
        />
        <Field id="sh-shop" label={t("shopifyShop")} required error={tried && !shopOk ? t("shopifyShopError") : undefined}>
          <Input id="sh-shop" value={shop} onChange={(e) => setShop(e.target.value)} placeholder="mystore.myshopify.com" autoComplete="off" aria-invalid={tried && !shopOk} />
        </Field>
        <Field id="sh-way" label={t("shopifyKeyType")}>
          <NativeSelect id="sh-way" value={useClient ? "client" : "token"} onChange={(e) => setUseClient(e.target.value === "client")}>
            <option value="token">{t("shopifyUseToken")}</option>
            <option value="client">{t("shopifyUseClient")}</option>
          </NativeSelect>
        </Field>
        {useClient ? (
          <>
            <Field id="sh-cid" label={t("clientId")} required error={tried && clientId.trim().length < 6 ? t("clientIdError") : undefined}>
              <Input id="sh-cid" value={clientId} onChange={(e) => setClientId(e.target.value)} autoComplete="off" aria-invalid={tried && clientId.trim().length < 6} />
            </Field>
            <Field id="sh-csecret" label={t("clientSecret")} required error={tried && clientSecret.trim().length < 6 ? t("secretError") : undefined}>
              <SecretInput id="sh-csecret" value={clientSecret} onChange={setClientSecret} placeholder={t("secret")} invalid={tried && clientSecret.trim().length < 6} t={t} />
            </Field>
          </>
        ) : (
          <Field id="sh-token" label={t("shopifyToken")} required error={tried && token.trim().length < 10 ? t("secretError") : undefined}>
            <SecretInput id="sh-token" value={token} onChange={setToken} placeholder="shpat_…" invalid={tried && token.trim().length < 10} t={t} />
          </Field>
        )}
        <SecurityNote>{t("securityNote", { provider: "Shopify" })}</SecurityNote>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>{t("cancel")}</Button>
          <Button onClick={submit} disabled={busy || !shop.trim()}>
            {busy && <Loader2 className="mr-2 size-4 animate-spin" />} {t("verifyAndAdd")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WooDialog({ open, onOpenChange, t }: { open: boolean; onOpenChange: (o: boolean) => void; t: T }) {
  const [url, setUrl] = useState("");
  const [ck, setCk] = useState("");
  const [cs, setCs] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);

  const urlOk = /^(https:\/\/)?[^\s/]+\.[^\s]+$/i.test(url.trim()) && !/^http:\/\//i.test(url.trim());
  const ckOk = /^ck_[A-Za-z0-9]{20,80}$/.test(ck.trim());
  const csOk = /^cs_[A-Za-z0-9]{20,80}$/.test(cs.trim());
  const reset = () => { setUrl(""); setCk(""); setCs(""); setTried(false); };
  const submit = () => {
    setTried(true);
    if (!urlOk || !ckOk || !csOk) return;
    setBusy(true);
    createConnection({ kind: "woocommerce", name: "", url, consumerKey: ck, consumerSecret: cs }).then(
      async (row) => {
        toast.success(t("added"));
        reset();
        onOpenChange(false);
        await firstSync(row.id, t);
      },
      (e) => toast.error(e instanceof Error ? e.message : t("saveFailed")),
    ).finally(() => setBusy(false));
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><WooLogo className="size-5" /> {t("wooTitle")}</DialogTitle>
          <DialogDescription>{t("wooAbout")}</DialogDescription>
        </DialogHeader>
        <SetupGuide
          t={t}
          steps={[
            { title: "wooGuide1", help: "wooGuide1Help", links: wooKeysPage(url) ? [{ href: wooKeysPage(url), label: "wooOpenKeys" }] : [] },
            { title: "wooGuide2", help: "wooGuide2Help" },
            { title: "wooGuide3", help: "wooGuide3Help" },
            { title: "wooGuide4", help: "wooGuide4Help", links: [{ href: LINKS.wooHelp, label: "openHelp" }] },
          ]}
        />
        <Field id="wc-url" label={t("wooUrl")} required error={tried && !urlOk ? t("wooUrlError") : undefined}>
          <Input id="wc-url" type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://yourshop.com" autoComplete="off" aria-invalid={tried && !urlOk} />
        </Field>
        <Field id="wc-ck" label={t("wooKey")} required error={tried && !ckOk ? t("wooKeyError") : undefined}>
          <Input id="wc-ck" value={ck} onChange={(e) => setCk(e.target.value)} placeholder="ck_…" autoComplete="off" aria-invalid={tried && !ckOk} />
        </Field>
        <Field id="wc-cs" label={t("wooSecret")} required error={tried && !csOk ? t("wooSecretError") : undefined}>
          <SecretInput id="wc-cs" value={cs} onChange={setCs} placeholder="cs_…" invalid={tried && !csOk} t={t} />
        </Field>
        <SecurityNote>{t("securityNote", { provider: "WooCommerce" })}</SecurityNote>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>{t("cancel")}</Button>
          <Button onClick={submit} disabled={busy || !url.trim() || !ck.trim() || !cs.trim()}>
            {busy && <Loader2 className="mr-2 size-4 animate-spin" />} {t("verifyAndAdd")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** A store card's lower half: what came across, the two switches and "Sync now". */
function StorePanel({ c, t, locale }: { c: FlowConnection; t: T; locale: string }) {
  const [status, setStatus] = useState<StoreStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const store = c.kind === "shopify" ? "Shopify" : "WooCommerce";

  const refresh = () =>
    storeStatus(c.id).then(
      (s) => { setStatus(s); setFailed(false); },
      () => setFailed(true),
    );
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per card
  }, [c.id]);

  const syncNow = async () => {
    setBusy(true);
    try {
      const out = await syncStore(c.id);
      toast.success(t("storeSyncDone", { count: out.products?.count ?? 0, sent: out.orders.sent, updated: out.orders.updated }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("storeSyncFailed"));
    }
    await refresh();
    setBusy(false);
  };
  const toggle = async (key: "sync_products" | "push_orders", value: boolean) => {
    setStatus((s) => (s ? { ...s, [key]: value } : s));
    try {
      await setStoreOptions(c.id, { [key]: value });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("saveFailed"));
      void refresh();
    }
  };

  if (failed) return <p className="mt-3 text-sm text-muted-foreground">{t("storeStatusFailed")}</p>;
  if (!status) return <p role="status" className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden /> {t("storeLoading")}</p>;
  return (
    <div className="mt-3 space-y-3 rounded-xl bg-muted/60 p-3">
      <p className="text-sm text-foreground">
        {status.synced_at
          ? t("storeProducts", { count: status.products, when: new Date(status.synced_at).toLocaleString(locale, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) })
          : t("storeNotSynced")}
        {" · "}
        {t("storeOrdersSent", { count: status.orders_sent })}
      </p>
      {status.sync_error && (
        <p role="alert" className="flex items-start gap-1.5 text-xs text-rose-800 dark:text-rose-300">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {t("storeLastError", { error: status.sync_error })}
        </p>
      )}
      {status.orders_failed.map((o) => (
        <p key={o.number} className="flex items-start gap-1.5 text-xs text-rose-800 dark:text-rose-300">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {t("storeOrderFailed", { number: o.number, error: o.error })}
        </p>
      ))}
      <div className="divide-y divide-border rounded-lg border border-border bg-background">
        {(["sync_products", "push_orders"] as const).map((key) => (
          <label key={key} htmlFor={`${c.id}-${key}`} className="flex min-h-12 cursor-pointer items-center justify-between gap-3 px-3 py-2">
            <span className="min-w-0">
              <span className="block text-sm font-medium text-foreground">{t(`store_${key}`, { store })}</span>
              <span className="block text-xs text-muted-foreground">{t(`store_${key}_help`, { store })}</span>
            </span>
            <Switch id={`${c.id}-${key}`} checked={status[key]} onCheckedChange={(v) => void toggle(key, v)} />
          </label>
        ))}
      </div>
      <Button variant="outline" className="min-h-11 w-full gap-1.5 sm:w-auto" disabled={busy} onClick={() => void syncNow()}>
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />} {t("storeSyncNow")}
      </Button>
      <p className="text-xs text-muted-foreground">{t("storeHow", { store })}</p>
    </div>
  );
}

const KIND_LABEL: Record<ConnectionKind, string> = { google: "kindGoogle", razorpay: "kindRazorpay", cashfree: "kindCashfree", shopify: "kindShopify", woocommerce: "kindWoo" };
const kindLabel = (c: FlowConnection) => (c.kind === "google" && c.detail.endsWith(".gserviceaccount.com") ? "kindGoogleSa" : KIND_LABEL[c.kind]);

/** Where the payment provider tells AutoShift that a customer paid (copied into its Webhooks settings). */
function WebhookUrl({ url, provider, events, t }: { url: string; provider: string; events: string; t: T }) {
  const copy = () =>
    navigator.clipboard.writeText(url).then(
      () => toast.success(t("webhookCopied")),
      () => toast.error(t("webhookCopyFailed")),
    );
  return (
    <div className="mt-3 rounded-xl bg-muted/60 p-3">
      <p className="text-xs font-medium text-foreground">{t("webhookUrl", { provider })}</p>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
        <code className="block min-w-0 flex-1 rounded-md bg-background px-2 py-1.5 font-mono text-xs break-all text-foreground select-all">{url}</code>
        <Button type="button" variant="outline" size="sm" className="min-h-11 w-full shrink-0 sm:w-auto" onClick={() => void copy()}>
          {t("webhookCopy")}
        </Button>
      </div>
      <p className="mt-2 text-xs break-words text-muted-foreground">{events}</p>
    </div>
  );
}

function ConnectionCard({ c, onRemove, t, locale }: { c: FlowConnection; onRemove: () => void; t: T; locale: string }) {
  return (
    <li className="min-w-0 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted/60">
          <ConnectionLogo kind={c.kind} className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-foreground">{c.name}</p>
          <p className="truncate text-sm text-muted-foreground">
            {t(kindLabel(c))}
            {c.mode ? ` · ${t(c.mode)}` : ""} · {c.detail}
          </p>
          <p className="text-xs text-muted-foreground">{t("addedOn", { date: new Date(c.createdAt).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" }) })}</p>
        </div>
        <span className="hidden rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary sm:inline">{t("connected")}</span>
        <Button variant="ghost" size="icon" aria-label={t("remove", { name: c.name })} onClick={onRemove} className="size-11 shrink-0 text-muted-foreground hover:text-destructive">
          <Trash2 className="size-4" />
        </Button>
      </div>
      {c.kind === "razorpay" && backendUrl() && <WebhookUrl url={`${backendUrl()}/v1/webhooks/razorpay/c/${c.id}`} provider="Razorpay" events={t("webhookEvents")} t={t} />}
      {isStoreKind(c.kind) && backendUrl() && <StorePanel c={c} t={t} locale={locale} />}
      {c.kind === "cashfree" && backendUrl() && <WebhookUrl url={`${backendUrl()}/v1/webhooks/cashfree/c/${c.id}`} provider="Cashfree" events={t("webhookEventsCashfree")} t={t} />}
    </li>
  );
}

export function ConnectionsPage() {
  const t = useTranslations("FlowConnections");
  const tNav = useTranslations("Header");
  const locale = useLocale();
  const connections = useConnections();
  useEffect(() => {
    void loadConnections().catch(() => {});
  }, []);
  const [dialog, setDialog] = useState<ConnectionKind | null>(null);
  const [removing, setRemoving] = useState<FlowConnection | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  // Back from Google's sign-in page: say how it went, then tidy the address bar.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const result = q.get("google");
    if (!result) return;
    if (result === "connected") {
      toast.success(t("googleConnected"));
      void loadConnections().catch(() => {});
    } else if (result === "cancelled") toast.info(t("googleCancelled"));
    else toast.error(t("googleFailed", { reason: q.get("reason") || "" }));
    window.history.replaceState(null, "", window.location.pathname);
  }, [t]);

  /** Signs in with Google when the platform has it set up; otherwise offers the service-account key. */
  const connectGoogle = async () => {
    setSigningIn(true);
    try {
      if (await googleSignInAvailable()) {
        window.location.assign(await startGoogleSignIn());
        return;
      }
      toast.info(t("googleUseKey"));
      setDialog("google");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("googleFailed", { reason: "" }));
    }
    setSigningIn(false);
  };

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
          <Button className="min-h-11" disabled={signingIn} aria-busy={signingIn} onClick={() => void connectGoogle()}>
            {signingIn ? <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden /> : <Plus className="mr-1.5 size-4" aria-hidden />} {t("connectGoogle")}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger className={cn(buttonVariants({ variant: "outline" }), "min-h-11")}>
              <Link2 className="mr-1.5 size-4" /> {t("addAnother")}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-56">
              <DropdownMenuItem onClick={() => setDialog("google")}><Table2 className="size-4" /> {t("googleServiceAccount")}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setDialog("razorpay")}><RazorpayLogo className="size-4" /> Razorpay</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setDialog("cashfree")}><CashfreeLogo className="size-4" /> Cashfree</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setDialog("shopify")}><ShopifyLogo className="size-4" /> Shopify</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setDialog("woocommerce")}><WooLogo className="size-4" /> WooCommerce</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </section>

      {connections.length === 0 ? (
        <EmptyPanel icon={Table2} title={t("emptyTitle")} description={t("emptyDesc")} className="rounded-3xl border border-dashed border-border py-14" />
      ) : (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-3">
          {connections.map((c) => (
            <ConnectionCard key={c.id} c={c} t={t} locale={locale} onRemove={() => setRemoving(c)} />
          ))}
        </ul>
      )}

      <GoogleDialog open={dialog === "google"} onOpenChange={closeDialog} t={t} />
      <RazorpayDialog open={dialog === "razorpay"} onOpenChange={closeDialog} t={t} />
      <CashfreeDialog open={dialog === "cashfree"} onOpenChange={closeDialog} t={t} />
      <ShopifyDialog open={dialog === "shopify"} onOpenChange={closeDialog} t={t} />
      <WooDialog open={dialog === "woocommerce"} onOpenChange={closeDialog} t={t} />

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={t("removeTitle", { name: removing?.name ?? "" })}
        description={t("removeDesc")}
        confirmLabel={t("removeConfirm")}
        cancelLabel={t("cancel")}
        onConfirm={() => {
          if (removing) {
            deleteConnection(removing.id).then(
              () => toast.success(t("removed")),
              (e) => toast.error(e instanceof Error ? e.message : t("removeConfirm")),
            );
          }
          setRemoving(null);
        }}
      />
    </div>
  );
}
