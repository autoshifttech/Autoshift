"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, LockKeyhole, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogoMark } from "@/components/brand/logo-mark";
import { setAdminCookie } from "@/lib/admin/session";
import { act } from "@/lib/admin/store";

const CODE_LENGTH = 6;

/** Admin sign-in: email + password, then a 6-digit code from an authenticator app. */
export function AdminLogin() {
  const router = useRouter();
  const [step, setStep] = useState<"password" | "code">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState<string[]>(Array(CODE_LENGTH).fill(""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (step === "code") inputs.current[0]?.focus();
  }, [step]);

  const submitPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError("Enter your admin email.");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    setError("");
    setBusy(true);
    setTimeout(() => {
      setBusy(false);
      setStep("code");
    }, 500);
  };

  const verify = (digits: string[]) => {
    if (digits.some((d) => !d)) return setError("Enter all 6 digits.");
    setError("");
    setBusy(true);
    setTimeout(() => {
      setAdminCookie(true);
      act("Signed in", "Admin panel", "2-step code verified");
      router.push("/admin");
    }, 500);
  };

  const setDigit = (i: number, value: string) => {
    const chars = value.replace(/\D/g, "").split("");
    if (!chars.length) {
      setCode((c) => c.map((d, k) => (k === i ? "" : d)));
      return;
    }
    const next = [...code];
    chars.slice(0, CODE_LENGTH - i).forEach((ch, k) => (next[i + k] = ch));
    setCode(next);
    const focus = Math.min(i + chars.length, CODE_LENGTH - 1);
    inputs.current[focus]?.focus();
    if (next.every(Boolean)) verify(next);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#10211c] px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2 text-white">
          <LogoMark className="size-9" />
          <span className="text-xl font-extrabold tracking-tight">AutoShift</span>
          <span className="rounded-md bg-[#c9f27a] px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-[#10211c] uppercase">Admin</span>
        </div>
        <div className="rounded-2xl bg-card p-6 shadow-2xl sm:p-8">
          {step === "password" ? (
            <form onSubmit={submitPassword} className="space-y-5" noValidate>
              <div>
                <span className="flex size-10 items-center justify-center rounded-xl bg-[var(--tone-mint)] text-primary">
                  <LockKeyhole className="size-5" />
                </span>
                <h1 className="mt-4 text-xl font-bold text-foreground">Sign in to the admin panel</h1>
                <p className="mt-1 text-sm text-muted-foreground">Only for the AutoShift team. Every sign-in and action is recorded.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-email">Work email</Label>
                <Input id="admin-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@autoshift.app" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-password">Password</Label>
                <Input id="admin-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              {error && <p className="text-sm text-rose-600" role="alert">{error}</p>}
              <Button type="submit" className="h-10 w-full" disabled={busy}>
                {busy && <Loader2 className="size-4 animate-spin" />}
                Continue
              </Button>
            </form>
          ) : (
            <div className="space-y-5">
              <button type="button" onClick={() => setStep("password")} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                <ArrowLeft className="size-4" />
                Back
              </button>
              <div>
                <span className="flex size-10 items-center justify-center rounded-xl bg-[var(--tone-mint)] text-primary">
                  <ShieldCheck className="size-5" />
                </span>
                <h1 className="mt-4 text-xl font-bold text-foreground">2-step verification</h1>
                <p className="mt-1 text-sm text-muted-foreground">Enter the 6-digit code from your authenticator app for {email}.</p>
              </div>
              <div className="flex justify-between gap-2">
                {code.map((d, i) => (
                  <input
                    key={i}
                    ref={(el) => {
                      inputs.current[i] = el;
                    }}
                    value={d}
                    inputMode="numeric"
                    autoComplete={i === 0 ? "one-time-code" : "off"}
                    aria-label={`Digit ${i + 1}`}
                    maxLength={CODE_LENGTH}
                    onChange={(e) => setDigit(i, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Backspace" && !d && i > 0) inputs.current[i - 1]?.focus();
                    }}
                    className="h-12 w-full min-w-0 rounded-xl border border-border bg-muted text-center text-lg font-semibold text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                ))}
              </div>
              {error && <p className="text-sm text-rose-600" role="alert">{error}</p>}
              <Button className="h-10 w-full" disabled={busy} onClick={() => verify(code)}>
                {busy && <Loader2 className="size-4 animate-spin" />}
                Verify and sign in
              </Button>
            </div>
          )}
        </div>
        <p className="mt-4 text-center text-xs text-white/50">Design preview: any email, an 8+ character password and any 6 digits sign you in to sample data.</p>
      </div>
    </div>
  );
}
