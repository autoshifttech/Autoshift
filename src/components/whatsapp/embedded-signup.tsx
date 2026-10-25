"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  AlertTriangle,
  BadgeCheck,
  Building2,
  Check,
  CircleSlash,
  Loader2,
  MessageCircle,
  Phone,
  RotateCcw,
  Send,
  ShieldCheck,
  UserRound,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { sampleConnectedNumber, type ConnectedNumber } from "@/lib/workspace/setup";

/**
 * Meta WhatsApp Embedded Signup, front end only. The real flow opens
 * Meta's popup (FB.login with the Embedded Signup config id), receives a
 * code plus WABA / phone-number ids, and the backend exchanges them. Here
 * the popup is simulated; "Preview outcome" lets reviewers see every state.
 */
export type SignupPhase = "idle" | "connecting" | "success" | "cancelled" | "error";
type Outcome = "success" | "cancelled" | "error";

const POPUP_STEPS = ["stepLogin", "stepBusiness", "stepNumber", "stepVerify"] as const;

export function EmbeddedSignup({
  displayName,
  connected,
  onConnected,
  className,
}: {
  displayName: string;
  connected?: ConnectedNumber | null;
  onConnected?: (number: ConnectedNumber) => void;
  className?: string;
}) {
  const t = useTranslations("EmbeddedSignup");
  const [phase, setPhase] = useState<SignupPhase>(connected ? "success" : "idle");
  const [number, setNumber] = useState<ConnectedNumber | null>(connected ?? null);
  const [progress, setProgress] = useState(0);
  const [outcome, setOutcome] = useState<Outcome>("success");
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach((id) => window.clearTimeout(id)), []);

  const start = () => {
    setPhase("connecting");
    setProgress(0);
    POPUP_STEPS.forEach((_, i) => {
      timers.current.push(window.setTimeout(() => setProgress(i + 1), 650 * (i + 1)));
    });
    timers.current.push(
      window.setTimeout(() => {
        if (outcome === "success") {
          const n = sampleConnectedNumber(displayName);
          setNumber(n);
          onConnected?.(n);
        }
        setPhase(outcome);
      }, 650 * (POPUP_STEPS.length + 1)),
    );
  };

  return (
    <div className={cn("rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)] sm:p-6", className)}>
      {phase === "idle" && <Intro onStart={start} />}
      {phase === "connecting" && <Connecting progress={progress} />}
      {phase === "success" && number && <Connected number={number} />}
      {phase === "cancelled" && (
        <Problem
          tone="neutral"
          icon={CircleSlash}
          title={t("cancelledTitle")}
          desc={t("cancelledDesc")}
          onRetry={start}
        />
      )}
      {phase === "error" && (
        <Problem
          tone="error"
          icon={AlertTriangle}
          title={t("errorTitle")}
          desc={t("errorDesc")}
          tips={[t("errorTip1"), t("errorTip2"), t("errorTip3")]}
          onRetry={start}
        />
      )}

      {phase !== "connecting" && phase !== "success" && (
        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-dashed border-border pt-4 text-xs text-muted-foreground">
          <span>{t("previewOutcome")}</span>
          {(["success", "cancelled", "error"] as const).map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => setOutcome(o)}
              className={cn(
                "rounded-full border px-2.5 py-0.5 transition-colors",
                outcome === o ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted",
              )}
            >
              {t(`outcome_${o}`)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Intro({ onStart }: { onStart: () => void }) {
  const t = useTranslations("EmbeddedSignup");
  const needs = [
    { icon: UserRound, text: t("needFacebook") },
    { icon: Phone, text: t("needNumber") },
    { icon: Building2, text: t("needBusiness") },
  ];
  return (
    <div>
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[var(--tone-mint)] text-primary">
          <MessageCircle className="size-5" />
        </span>
        <div>
          <h3 className="text-base font-semibold text-foreground">{t("introTitle")}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{t("introDesc")}</p>
        </div>
      </div>

      <p className="mt-5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t("needTitle")}</p>
      <ul className="mt-2 grid gap-2 sm:grid-cols-3">
        {needs.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-start gap-2 rounded-xl bg-muted/60 p-3 text-sm text-foreground">
            <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
            {text}
          </li>
        ))}
      </ul>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button size="lg" onClick={onStart} className="gap-2">
          <MessageCircle className="size-4" />
          {t("connectButton")}
        </Button>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5 text-primary" />
          {t("privacyNote")}
        </p>
      </div>
    </div>
  );
}

function Connecting({ progress }: { progress: number }) {
  const t = useTranslations("EmbeddedSignup");
  return (
    <div aria-live="polite">
      <div className="flex items-center gap-3">
        <Loader2 className="size-5 animate-spin text-primary" />
        <div>
          <h3 className="text-base font-semibold text-foreground">{t("connectingTitle")}</h3>
          <p className="text-sm text-muted-foreground">{t("connectingDesc")}</p>
        </div>
      </div>
      <ol className="mt-5 space-y-2">
        {POPUP_STEPS.map((key, i) => {
          const done = progress > i;
          const current = progress === i;
          return (
            <li
              key={key}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
                current ? "bg-[var(--tone-mint)] text-foreground" : "text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                  done ? "border-primary bg-primary text-primary-foreground" : "border-border",
                )}
              >
                {done ? <Check className="size-3.5" /> : i + 1}
              </span>
              {t(key)}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Connected({ number }: { number: ConnectedNumber }) {
  const t = useTranslations("EmbeddedSignup");
  const rows = [
    [t("fieldNumber"), number.displayPhoneNumber],
    [t("fieldName"), number.verifiedName],
    [t("fieldWaba"), number.wabaId],
    [t("fieldPhoneId"), number.phoneNumberId],
  ];
  return (
    <div>
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <BadgeCheck className="size-5" />
        </span>
        <div>
          <h3 className="text-base font-semibold text-foreground">{t("successTitle")}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{t("successDesc")}</p>
        </div>
      </div>
      <dl className="mt-5 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="bg-card px-4 py-3">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-0.5 font-medium break-all text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--tone-mint)] px-2.5 py-1 text-xs font-medium text-primary">
          <span className="size-2 rounded-full bg-emerald-500" />
          {t("qualityGreen")}
        </span>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => toast.success(t("testSent"))}>
          <Send className="size-3.5" />
          {t("sendTest")}
        </Button>
      </div>
    </div>
  );
}

function Problem({
  tone,
  icon: Icon,
  title,
  desc,
  tips,
  onRetry,
}: {
  tone: "neutral" | "error";
  icon: typeof AlertTriangle;
  title: string;
  desc: string;
  tips?: string[];
  onRetry: () => void;
}) {
  const t = useTranslations("EmbeddedSignup");
  return (
    <div role="alert">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-xl",
            tone === "error" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground",
          )}
        >
          <Icon className="size-5" />
        </span>
        <div>
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
        </div>
      </div>
      {tips && (
        <ul className="mt-4 space-y-1.5 rounded-xl bg-muted/60 p-4 text-sm text-foreground">
          {tips.map((tip) => (
            <li key={tip} className="flex gap-2">
              <span className="text-primary">•</span>
              {tip}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-5 flex flex-wrap gap-2">
        <Button onClick={onRetry} className="gap-1.5">
          <RotateCcw className="size-4" />
          {t("tryAgain")}
        </Button>
        <a href="/#contact" className="inline-flex h-8 items-center rounded-full px-3 text-sm text-primary hover:underline">
          {t("getHelp")}
        </a>
      </div>
    </div>
  );
}
