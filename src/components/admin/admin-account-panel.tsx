"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/lib/toast";
import { USERNAME_RE, passwordProblem } from "@/lib/admin/admin-password";
import { ListSkeleton } from "@/components/ui/skeleton";

/**
 * Admin → Settings → "Your sign-in": the username and password this admin can use on the admin login
 * (besides Google). The WhatsApp code after it stays the same.
 */
export function AdminAccountPanel() {
  const t = useTranslations("AdminAccount");
  const [loaded, setLoaded] = useState(false);
  const [current, setCurrent] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch("/api/admin/account")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { username: string | null; email: string | null }) => {
        setCurrent(d.username);
        setUsername(d.username ?? "");
        setEmail(d.email);
        setLoaded(true);
      })
      .catch(() => setFailed(true));
  }, []);

  const name = username.trim().toLowerCase();
  const nameError = !USERNAME_RE.test(name) ? t("error.bad_username") : "";
  const pwKey = passwordProblem(password);
  const pwError = pwKey ? t(`error.${pwKey}`) : "";
  const matchError = password !== confirm ? t("error.mismatch") : "";

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (nameError || pwError || matchError) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: name, password }) });
      const data = (await res.json().catch(() => ({}))) as { error?: string; username?: string };
      if (!res.ok) {
        const known = ["bad_username", "too_short", "too_simple", "too_long", "username_taken", "not_verified"];
        toast.error(t(`error.${known.includes(data.error ?? "") ? data.error : "save_failed"}` as "error.save_failed"));
        return;
      }
      setCurrent(data.username ?? name);
      setPassword("");
      setConfirm("");
      setTried(false);
      toast.success(t("saved"));
    } finally {
      setBusy(false);
    }
  };

  if (failed) return null; // not signed in as staff, or no backend: nothing to set here
  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]" aria-labelledby="admin-account-title">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <KeyRound className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 id="admin-account-title" className="text-base font-semibold text-foreground">{t("title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("desc")}</p>
          {loaded && (
            <p className="mt-2 text-sm text-foreground">
              {current ? t("current", { username: current }) : t("none")}
              {email && <span className="text-muted-foreground"> · {t("email", { email })}</span>}
            </p>
          )}
        </div>
      </div>

      {!loaded ? (
        <ListSkeleton rows={2} compact label={t("loading")} className="px-0" />
      ) : (
        <form onSubmit={save} className="grid gap-3 sm:grid-cols-2" noValidate>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="acc-username">{t("username")}</Label>
            <Input id="acc-username" autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={(e) => setUsername(e.target.value)} aria-invalid={tried && !!nameError} aria-describedby="acc-username-help" className="min-h-11" />
            <p id="acc-username-help" className={tried && nameError ? "text-xs font-medium text-destructive" : "text-xs text-muted-foreground"}>{tried && nameError ? nameError : t("usernameHelp")}</p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="acc-password">{t("password")}</Label>
            <div className="relative">
              <Input id="acc-password" type={show ? "text" : "password"} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={tried && !!pwError} aria-describedby="acc-password-help" className="min-h-11 pr-12" />
              <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? t("hide") : t("show")} className="absolute top-1/2 right-1 flex size-10 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                {show ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
              </button>
            </div>
            <p id="acc-password-help" className={tried && pwError ? "text-xs font-medium text-destructive" : "text-xs text-muted-foreground"}>{tried && pwError ? pwError : t("passwordHelp")}</p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="acc-confirm">{t("confirm")}</Label>
            <Input id="acc-confirm" type={show ? "text" : "password"} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-invalid={tried && !!matchError} className="min-h-11" />
            {tried && matchError && <p className="text-xs font-medium text-destructive">{matchError}</p>}
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" className="min-h-11" disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {current ? t("update") : t("save")}
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">{t("note")}</p>
          </div>
        </form>
      )}
    </section>
  );
}
