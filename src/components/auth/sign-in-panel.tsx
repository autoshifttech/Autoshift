"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, Loader2, Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

const CODE_LENGTH = 6;

/** Google's own "G" mark, as Google's sign-in branding asks for. */
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

/**
 * The only ways into the business app: Continue with Google, or a 6-digit code sent by email
 * (for people without a Google account). No passwords. `next` is where a signed-in person goes.
 */
export function SignInPanel({ next, onBusy }: { next: string; onBusy?: (busy: boolean) => void }) {
  const t = useTranslations("SignIn");
  const [mode, setMode] = useState<"choose" | "email" | "code">("choose");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  // The standard email has a sign-in link; a 6-digit code appears only once a custom email template adds it.
  const [codeOpen, setCodeOpen] = useState(false);
  const [busy, setBusy] = useState<"google" | "send" | "verify" | null>(null);
  const [error, setError] = useState("");
  const codeRef = useRef<HTMLInputElement>(null);
  const callback = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  useEffect(() => {
    if (mode === "code" && codeOpen) codeRef.current?.focus();
  }, [mode, codeOpen]);
  useEffect(() => onBusy?.(busy !== null), [busy, onBusy]);

  const google = async () => {
    setError("");
    setBusy("google");
    const { error: e } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callback(), queryParams: { prompt: "select_account" } },
    });
    // On success the browser is already on its way to Google.
    if (e) {
      setError(t("googleFailed"));
      setBusy(null);
    }
  };

  const sendCode = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(clean)) return setError(t("badEmail"));
    setError("");
    setBusy("send");
    const { error: err } = await createClient().auth.signInWithOtp({ email: clean, options: { shouldCreateUser: true, emailRedirectTo: callback() } });
    setBusy(null);
    if (err) return setError(/rate|seconds/i.test(err.message) ? t("tooSoon") : t("sendFailed"));
    setCode("");
    setCodeOpen(false);
    setMode("code");
  };

  const verify = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (code.length !== CODE_LENGTH) return setError(t("badCode"));
    setError("");
    setBusy("verify");
    const { error: err } = await createClient().auth.verifyOtp({ email: email.trim().toLowerCase(), token: code, type: "email" });
    if (err) {
      setBusy(null);
      return setError(/expired/i.test(err.message) ? t("codeExpired") : t("wrongCode"));
    }
    // A full page load so the middleware sees the new sign-in cookies; /auth/continue sends
    // new sign-ups to the setup wizard first.
    window.location.href = `/auth/continue?next=${encodeURIComponent(next)}`;
  };

  const errorBox = error ? (
    <p role="alert" className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-400">
      {error}
    </p>
  ) : null;

  if (mode === "code") {
    return (
      <form onSubmit={verify} className="flex flex-col gap-4" noValidate>
        <button type="button" onClick={() => { setMode("email"); setError(""); }} className="flex min-h-11 items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden /> {t("back")}
        </button>
        <p className="text-sm text-muted-foreground">{t.rich("linkSent", { email: email.trim(), strong: (c) => <span className="font-medium text-foreground">{c}</span> })}</p>
        {codeOpen ? (
          <>
            <div className="flex flex-col gap-2">
              <Label htmlFor="signin-code">{t("codeLabel")}</Label>
              <Input
                id="signin-code"
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
            {errorBox}
            <Button type="submit" className="min-h-11 w-full" disabled={busy !== null || code.length !== CODE_LENGTH}>
              {busy === "verify" && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {t("verify")}
            </Button>
          </>
        ) : (
          <>
            {errorBox}
            <button type="button" onClick={() => setCodeOpen(true)} className="flex min-h-11 items-center self-start text-sm font-medium text-primary hover:underline">
              {t("haveCode")}
            </button>
          </>
        )}
        <Button type="button" variant="ghost" className="min-h-11 w-full" disabled={busy !== null} onClick={() => void sendCode()}>
          {t("resend")}
        </Button>
        <p className="text-xs text-muted-foreground">{t("codeHelp")}</p>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Button type="button" variant="outline" className="min-h-12 w-full gap-3 border-border bg-card text-base font-semibold text-foreground hover:bg-muted" disabled={busy !== null} onClick={() => void google()}>
        {busy === "google" ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <GoogleMark />}
        {t("google")}
      </Button>

      {mode === "choose" ? (
        <>
          {errorBox}
          <button type="button" onClick={() => { setMode("email"); setError(""); }} className="mx-auto flex min-h-11 items-center gap-2 text-sm font-medium text-primary hover:underline">
            <Mail className="size-4" aria-hidden /> {t("useEmail")}
          </button>
        </>
      ) : (
        <form onSubmit={sendCode} className="flex flex-col gap-3" noValidate>
          <div className="flex items-center gap-3 text-xs text-muted-foreground" aria-hidden>
            <span className="h-px flex-1 bg-border" /> {t("or")} <span className="h-px flex-1 bg-border" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="signin-email">{t("emailLabel")}</Label>
            <Input id="signin-email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("emailPlaceholder")} className="min-h-11" />
          </div>
          {errorBox}
          <Button type="submit" className="min-h-11 w-full" disabled={busy !== null || !email.trim()}>
            {busy === "send" && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {t("sendCode")}
          </Button>
        </form>
      )}
    </div>
  );
}
