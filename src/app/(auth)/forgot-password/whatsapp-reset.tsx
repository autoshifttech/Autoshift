"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CheckCircle, Loader2 } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const field = "border-border bg-card text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-primary/20";
const MIN_PASSWORD = 8;

/** Forgot password: a 6-digit code on the account's verified WhatsApp, then a new password. */
export function WhatsAppReset({ initialEmail, onUseEmail }: { initialEmail: string; onUseEmail: () => void }) {
  const t = useTranslations("ForgotPasswordPage.whatsapp");
  const [email, setEmail] = useState(initialEmail);
  const [step, setStep] = useState<"email" | "code" | "done">("email");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (wait <= 0) return;
    const id = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  const errorText = (data: { error?: string; attempts_left?: number }) => {
    const known = ["invalid_email", "not_available", "invalid_code", "no_code", "expired", "too_many_attempts", "wrong_code", "weak_password"];
    return known.includes(data.error ?? "") ? t(`error.${data.error}`, { left: data.attempts_left ?? 0, min: MIN_PASSWORD }) : t("error.generic");
  };

  const send = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/password-reset/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const data = await res.json().catch(() => ({}));
      if (res.status === 429) return setError(t("error.too_many"));
      if (!res.ok) return setError(errorText(data));
      setStep("code");
      setWait(60);
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    setError(null);
    if (password.length < MIN_PASSWORD) return setError(t("error.weak_password", { min: MIN_PASSWORD }));
    if (password !== confirm) return setError(t("mismatch"));
    setBusy(true);
    try {
      const res = await fetch("/api/auth/password-reset/finish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, code, password }) });
      const data = await res.json().catch(() => ({}));
      if (res.status === 429 && !data.error) return setError(t("error.too_many"));
      if (!res.ok) return setError(errorText(data));
      setStep("done");
    } finally {
      setBusy(false);
    }
  };

  if (step === "done") {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <CheckCircle className="size-10 text-primary" aria-hidden />
        <p className="text-sm text-foreground">{t("done")}</p>
        <Link href="/login" className={buttonVariants({ className: "min-h-11 w-full" })}>
          {t("signIn")}
        </Link>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void (step === "email" ? send() : finish());
      }}
    >
      <p className="text-sm text-muted-foreground">{step === "email" ? t("intro") : t("sentIfAccount")}</p>
      {error && (
        <div role="alert" className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="wa-email" className="text-muted-foreground">
          {t("emailLabel")}
        </Label>
        <Input id="wa-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={step === "code"} className={field} />
      </div>

      {step === "code" && (
        <>
          <div className="flex flex-col gap-2">
            <Label htmlFor="wa-code" className="text-muted-foreground">
              {t("codeLabel")}
            </Label>
            <Input id="wa-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="123456" className={`${field} text-center font-mono text-lg tracking-[0.4em]`} autoFocus />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="wa-password" className="text-muted-foreground">
              {t("newPassword")}
            </Label>
            <Input id="wa-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={field} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="wa-confirm" className="text-muted-foreground">
              {t("confirmPassword")}
            </Label>
            <Input id="wa-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={field} />
          </div>
        </>
      )}

      <Button type="submit" disabled={busy || !email || (step === "code" && code.length !== 6)} className="min-h-11 w-full">
        {busy && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}
        {step === "email" ? t("send") : t("reset")}
      </Button>

      {step === "code" && (
        <Button type="button" variant="ghost" className="min-h-11" disabled={busy || wait > 0} onClick={() => void send()}>
          {wait > 0 ? t("resendIn", { seconds: wait }) : t("resend")}
        </Button>
      )}
      <Button type="button" variant="link" className="min-h-11 text-muted-foreground" onClick={onUseEmail}>
        {t("useEmail")}
      </Button>
    </form>
  );
}
