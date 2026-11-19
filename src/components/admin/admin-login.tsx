"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, Loader2, LockKeyhole, MessageCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogoMark } from "@/components/brand/logo-mark";
import { createClient } from "@/lib/supabase/client";

const CODE_LENGTH = 6;

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

type ApiError = { error?: string; attempts_left?: number | null; retry_after?: number | null };

async function post(path: string, body?: unknown): Promise<{ ok: boolean; data: ApiError & { done?: boolean; code_sent?: boolean; phone?: string } }> {
  const res = await fetch(path, { method: "POST", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  return { ok: res.ok, data: await res.json().catch(() => ({})) };
}

/**
 * Admin sign-in: Continue with Google (only emails on the AutoShift admin team get in), then (when
 * admin sign-in codes are on and this device isn't trusted yet) a 6-digit code sent to the admin's
 * WhatsApp. A device that passes is trusted for 30 days. The server and the backend both check it.
 */
export function AdminLogin() {
  const t = useTranslations("AdminLogin");
  const router = useRouter();
  const [step, setStep] = useState<"password" | "code">("password");
  // Back from Google: carry on with the admin checks straight away.
  const returning = useSearchParams().get("continue") === "1";
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

  const google = async () => {
    setError("");
    setBusy(true);
    const next = "/admin/login?continue=1";
    const { error: e } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`, queryParams: { prompt: "select_account" } },
    });
    if (e) {
      setError(t("error.google"));
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!returning) return;
    let live = true;
    setBusy(true);
    void (async () => {
      const { ok, data } = await post("/api/admin/login/start");
      if (!live) return;
      setBusy(false);
      if (!ok) {
        // Not on the admin team (or no session): sign this Google account out of the admin page.
        if (data.error === "not_admin" || data.error === "not_signed_in") await createClient().auth.signOut();
        setError(explain(data));
        return;
      }
      if (data.done) return open();
      setPhone(data.phone ?? "");
      setCode("");
      setStep("code");
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returning]);

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
            <div className="space-y-5">
              <div>
                <span className="flex size-10 items-center justify-center rounded-xl bg-[var(--tone-mint)] text-primary">
                  <LockKeyhole className="size-5" aria-hidden />
                </span>
                <h1 className="mt-4 text-xl font-bold text-foreground">{t("title")}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{t("descGoogle")}</p>
              </div>
              {error && (
                <p className="text-sm text-rose-700 dark:text-rose-400" role="alert">
                  {error}
                </p>
              )}
              <Button type="button" variant="outline" className="min-h-12 w-full gap-3 text-base font-semibold" disabled={busy} onClick={() => void google()}>
                {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <GoogleMark />}
                {busy && returning ? t("checking") : t("google")}
              </Button>
            </div>
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
