"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, Loader2, LockKeyhole, MessageCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogoMark } from "@/components/brand/logo-mark";
import { createClient } from "@/lib/supabase/client";

const CODE_LENGTH = 6;

type ApiError = { error?: string; attempts_left?: number | null; retry_after?: number | null };

async function post(path: string, body?: unknown): Promise<{ ok: boolean; data: ApiError & { done?: boolean; code_sent?: boolean; phone?: string } }> {
  const res = await fetch(path, { method: "POST", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  return { ok: res.ok, data: await res.json().catch(() => ({})) };
}

/**
 * Admin sign-in: the AutoShift team account's email and password, then (when admin sign-in codes are
 * on and this device isn't trusted yet) a 6-digit code sent to the admin's WhatsApp. A device that
 * passes is trusted for 30 days. The server and the backend both check the result.
 */
export function AdminLogin() {
  const t = useTranslations("AdminLogin");
  const router = useRouter();
  const [step, setStep] = useState<"password" | "code">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === "code") codeRef.current?.focus();
  }, [step]);

  const explain = (data: ApiError) => {
    const known = ["not_signed_in", "not_admin", "no_phone", "not_available", "wait", "too_many", "send_failed", "invalid_code", "no_code", "expired", "too_many_attempts", "wrong_code"];
    const key = known.includes(data.error ?? "") ? data.error! : "generic";
    return t(`error.${key}`, { seconds: data.retry_after ?? 60, left: data.attempts_left ?? 0 });
  };

  const open = () => {
    router.push("/admin");
    router.refresh();
  };

  const start = async () => {
    const { ok, data } = await post("/api/admin/login/start");
    if (!ok) {
      setError(explain(data));
      return;
    }
    if (data.done) return open();
    setPhone(data.phone ?? "");
    setCode("");
    setStep("code");
  };

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError(t("error.email"));
    if (!password) return setError(t("error.password"));
    setError("");
    setBusy(true);
    try {
      const { error: signInError } = await createClient().auth.signInWithPassword({ email: email.trim(), password });
      if (signInError) {
        setError(t("error.badLogin"));
        return;
      }
      await start();
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (code.length !== CODE_LENGTH) return setError(t("error.invalid_code"));
    setError("");
    setBusy(true);
    try {
      const { ok, data } = await post("/api/admin/login/verify", { code });
      if (!ok) {
        setError(explain(data));
        return;
      }
      open();
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setError("");
    setBusy(true);
    try {
      await start();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#10211c] px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2 text-white">
          <LogoMark className="size-9" />
          <span className="text-xl font-extrabold tracking-tight">AutoShift</span>
          <span className="rounded-md bg-[#c9f27a] px-1.5 py-0.5 text-xs font-bold tracking-wider text-[#10211c] uppercase">Admin</span>
        </div>
        <div className="rounded-2xl bg-card p-6 shadow-2xl sm:p-8">
          {step === "password" ? (
            <form onSubmit={submitPassword} className="space-y-5" noValidate>
              <div>
                <span className="flex size-10 items-center justify-center rounded-xl bg-[var(--tone-mint)] text-primary">
                  <LockKeyhole className="size-5" aria-hidden />
                </span>
                <h1 className="mt-4 text-xl font-bold text-foreground">{t("title")}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{t("desc")}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-email">{t("email")}</Label>
                <Input id="admin-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className="min-h-11" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-password">{t("password")}</Label>
                <Input id="admin-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="min-h-11" />
              </div>
              {error && (
                <p className="text-sm text-rose-700 dark:text-rose-400" role="alert">
                  {error}
                </p>
              )}
              <Button type="submit" className="min-h-11 w-full" disabled={busy}>
                {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
                {t("continue")}
              </Button>
            </form>
          ) : (
            <form onSubmit={verify} className="space-y-5" noValidate>
              <button type="button" onClick={() => { setStep("password"); setError(""); }} className="flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                <ArrowLeft className="size-4" aria-hidden />
                {t("back")}
              </button>
              <div>
                <span className="flex size-10 items-center justify-center rounded-xl bg-[var(--tone-mint)] text-primary">
                  <MessageCircle className="size-5" aria-hidden />
                </span>
                <h1 className="mt-4 text-xl font-bold text-foreground">{t("codeTitle")}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{t("codeDesc", { phone })}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-code">{t("codeLabel")}</Label>
                <Input
                  id="admin-code"
                  ref={codeRef}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={CODE_LENGTH}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH))}
                  placeholder="123456"
                  className="min-h-11 text-center font-mono text-xl tracking-[0.4em]"
                />
              </div>
              {error && (
                <p className="text-sm text-rose-700 dark:text-rose-400" role="alert">
                  {error}
                </p>
              )}
              <Button type="submit" className="min-h-11 w-full" disabled={busy || code.length !== CODE_LENGTH}>
                {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
                {t("verify")}
              </Button>
              <Button type="button" variant="ghost" className="min-h-11 w-full" disabled={busy} onClick={() => void resend()}>
                {t("resend")}
              </Button>
              <p className="text-xs text-muted-foreground">{t("trustNote")}</p>
            </form>
          )}
        </div>
        <p className="mt-4 text-center text-xs text-white/70">{t("footer")}</p>
      </div>
    </div>
  );
}
