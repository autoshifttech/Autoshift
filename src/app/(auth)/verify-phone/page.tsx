"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, MessageCircle, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

const field = "border-border bg-card text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-primary/20";

/** Only same-site paths, so the "next" parameter can't send someone to another website. */
const safeNext = (next: string | null) => (next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");

export default function VerifyPhonePage() {
  return (
    <Suspense fallback={null}>
      <VerifyPhone />
    </Suspense>
  );
}

function VerifyPhone() {
  const t = useTranslations("VerifyPhone");
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("+91 ");
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  // Already verified, or not needed: carry on to the app.
  useEffect(() => {
    fetch("/api/account/phone")
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => {
        if (s?.verified) router.replace(next);
      })
      .catch(() => {});
  }, [router, next]);

  useEffect(() => {
    if (wait <= 0) return;
    const id = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  const message = (key: string | undefined, extra?: Record<string, number>) => {
    const known = ["invalid_phone", "phone_taken", "not_enabled", "wait", "too_many", "send_failed", "invalid_code", "no_code", "expired", "too_many_attempts", "wrong_code"];
    return known.includes(key ?? "") ? t(`error.${key}`, { seconds: extra?.retry_after ?? 60, left: extra?.attempts_left ?? 0 }) : t("error.generic");
  };

  const send = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/account/phone/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(message(data.error, data));
        if (data.retry_after) setWait(data.retry_after);
        return;
      }
      setSentTo(data.phone);
      setStep("code");
      setCode("");
      setWait(data.resend_after ?? 60);
      setTimeout(() => codeRef.current?.focus(), 50);
    } catch {
      setError(t("error.generic"));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/account/phone/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setError(message(data.error, data));
      router.replace(next);
    } catch {
      setError(t("error.generic"));
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    await createClient().auth.signOut();
    router.replace("/login");
  };

  return (
    <div className="app-canvas flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <Card className="liquid-glass lg-frost relative w-full max-w-md rounded-3xl border-0 bg-transparent px-2 py-6 ring-0 sm:px-4">
        <CardHeader className="items-center text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            {step === "phone" ? <MessageCircle className="h-6 w-6 text-primary" aria-hidden /> : <ShieldCheck className="h-6 w-6 text-primary" aria-hidden />}
          </div>
          <CardTitle className="text-2xl font-extrabold tracking-tight text-foreground">{step === "phone" ? t("title") : t("codeTitle")}</CardTitle>
          <CardDescription className="text-muted-foreground">{step === "phone" ? t("desc") : t("codeDesc", { phone: sentTo })}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void (step === "phone" ? send() : verify());
            }}
            noValidate
          >
            {error && (
              <div role="alert" className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-400">
                {error}
              </div>
            )}

            {step === "phone" ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor="vp-phone" className="text-muted-foreground">
                  {t("phoneLabel")}
                </Label>
                <Input id="vp-phone" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" aria-describedby="vp-phone-help" className={field} autoFocus />
                <p id="vp-phone-help" className="text-xs text-muted-foreground">
                  {t("phoneHelp")}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Label htmlFor="vp-code" className="text-muted-foreground">
                  {t("codeLabel")}
                </Label>
                <Input
                  id="vp-code"
                  ref={codeRef}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={4}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder="1010"
                  className={`${field} text-center font-mono text-xl tracking-[0.5em]`}
                />
              </div>
            )}

            <Button type="submit" disabled={busy || (step === "code" && code.length !== 4) || (step === "phone" && wait > 0)} className="min-h-11 w-full">
              {busy && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}
              {step === "phone" ? (wait > 0 ? t("resendIn", { seconds: wait }) : t("send")) : t("verify")}
            </Button>

            {step === "code" && (
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <Button type="button" variant="ghost" className="min-h-11" disabled={busy || wait > 0} onClick={() => void send()}>
                  {wait > 0 ? t("resendIn", { seconds: wait }) : t("resend")}
                </Button>
                <Button type="button" variant="ghost" className="min-h-11" onClick={() => { setStep("phone"); setError(null); }}>
                  {t("changeNumber")}
                </Button>
              </div>
            )}

            <Button type="button" variant="link" className="min-h-11 text-muted-foreground" onClick={() => void signOut()}>
              {t("signOut")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
