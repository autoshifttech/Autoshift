"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, ArrowRight, Bot, CalendarCheck, Check, PartyPopper, Target } from "lucide-react";

import { LogoMark } from "@/components/brand/logo-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CycleToggle, PlanPicker } from "@/components/billing/plan-picker";
import { EmbeddedSignup } from "@/components/whatsapp/embedded-signup";
import { cn } from "@/lib/utils";
import { subscriptionStore, TRIAL_DAYS, type BillingCycle } from "@/lib/billing/plans";
import {
  COUNTRIES,
  CURRENCIES,
  FEATURES,
  INDUSTRIES,
  TIME_ZONES,
  businessErrors,
  setupStore,
  useSetup,
  type BusinessDetails,
  type Feature,
} from "@/lib/workspace/setup";
import { NativeSelect } from "@/components/ui/native-select"

const STEPS = ["business", "plan", "whatsapp", "features"] as const;

const selectClass = "w-full";

export function OnboardingWizard() {
  const t = useTranslations("Onboarding");
  const setup = useSetup();
  // Resume where the user left off; 4 = finished.
  const [step, setStep] = useState(() => Math.min(setup.step, 4));
  const go = (next: number) => {
    setStep(next);
    setupStore.set((s) => ({ ...s, step: Math.max(s.step, next) }));
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <span className="flex items-center gap-2 font-semibold text-foreground">
            <LogoMark className="size-7" />
            AutoShift
          </span>
          {step < 4 && <Stepper current={step} />}
          <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
            {t("skipForNow")}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        {step < 4 && (
          <p className="mb-2 text-sm font-medium text-primary sm:hidden">
            {t("stepOf", { current: step + 1, total: STEPS.length })}
          </p>
        )}
        {step === 0 && <BusinessStep onNext={() => go(1)} />}
        {step === 1 && <PlanStep onBack={() => go(0)} onNext={() => go(2)} />}
        {step === 2 && <WhatsAppStep onBack={() => go(1)} onNext={() => go(3)} />}
        {step === 3 && (
          <FeaturesStep
            onBack={() => go(2)}
            onNext={() => {
              setupStore.set((s) => ({ ...s, completedAt: new Date().toISOString() }));
              go(4);
            }}
          />
        )}
        {step === 4 && <DoneStep />}
      </main>
    </div>
  );
}

function Stepper({ current }: { current: number }) {
  const t = useTranslations("Onboarding");
  return (
    <ol className="hidden items-center gap-2 sm:flex" aria-label={t("progress")}>
      {STEPS.map((s, i) => (
        <li key={s} className="flex items-center gap-2">
          {i > 0 && <span className="h-px w-6 bg-border" />}
          <span
            aria-current={i === current ? "step" : undefined}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
              i === current && "bg-[var(--tone-mint)] text-primary",
              i < current && "text-primary",
              i > current && "text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "flex size-5 items-center justify-center rounded-full border text-[11px]",
                i <= current ? "border-primary" : "border-border",
                i < current && "bg-primary text-primary-foreground",
              )}
            >
              {i < current ? <Check className="size-3" /> : i + 1}
            </span>
            <span className="hidden md:inline">{t(`step_${s}`)}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function StepHead({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="mb-8 max-w-2xl">
      <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{title}</h1>
      <p className="mt-2 text-muted-foreground">{desc}</p>
    </div>
  );
}

function Nav({ onBack, onNext, nextLabel, nextDisabled }: { onBack?: () => void; onNext: () => void; nextLabel?: string; nextDisabled?: boolean }) {
  const t = useTranslations("Onboarding");
  return (
    <div className="mt-8 flex items-center justify-between gap-3">
      {onBack ? (
        <Button variant="ghost" onClick={onBack} className="gap-1.5">
          <ArrowLeft className="size-4" />
          {t("back")}
        </Button>
      ) : (
        <span />
      )}
      <Button size="lg" onClick={onNext} disabled={nextDisabled} className="gap-1.5">
        {nextLabel ?? t("continue")}
        <ArrowRight className="size-4" />
      </Button>
    </div>
  );
}

function BusinessStep({ onNext }: { onNext: () => void }) {
  const t = useTranslations("Onboarding");
  const tc = useTranslations("Countries");
  const setup = useSetup();
  const [b, setB] = useState<BusinessDetails>(setup.business);
  const [touched, setTouched] = useState(false);
  const errors = touched ? businessErrors(b) : [];
  const update = (patch: Partial<BusinessDetails>) => setB((prev) => ({ ...prev, ...patch }));

  const submit = () => {
    setTouched(true);
    if (businessErrors(b).length) return;
    setupStore.set((s) => ({ ...s, business: b }));
    onNext();
  };

  const field = (key: keyof BusinessDetails, label: string, input: React.ReactNode, hint?: string) => (
    <div className="grid content-start gap-1.5">
      <Label htmlFor={`biz-${key}`}>{label}</Label>
      {input}
      {errors.includes(key) ? (
        <p className="text-xs text-destructive">{t(`err_${key}`)}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );

  return (
    <section>
      <StepHead title={t("businessTitle")} desc={t("businessDesc")} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid gap-5 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)] sm:grid-cols-2 sm:p-6">
          {field(
            "name",
            t("fieldName"),
            <Input
              id="biz-name"
              value={b.name}
              aria-invalid={errors.includes("name")}
              placeholder={t("fieldNamePh")}
              onChange={(e) => update({ name: e.target.value })}
            />,
          )}
          {field(
            "displayName",
            t("fieldDisplayName"),
            <Input
              id="biz-displayName"
              value={b.displayName}
              aria-invalid={errors.includes("displayName")}
              placeholder={b.name || t("fieldNamePh")}
              onChange={(e) => update({ displayName: e.target.value })}
            />,
            t("fieldDisplayNameHint"),
          )}
          <div className="sm:col-span-2">
            <p className="mb-2 text-sm font-medium text-foreground">{t("fieldIndustry")}</p>
            <div role="radiogroup" aria-label={t("fieldIndustry")} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {INDUSTRIES.map((id) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={b.industry === id}
                  onClick={() => update({ industry: id })}
                  className={cn(
                    "rounded-xl border px-3 py-2.5 text-left text-sm transition-colors",
                    b.industry === id ? "border-primary bg-primary/5 font-medium text-primary" : "border-border text-foreground hover:bg-muted",
                  )}
                >
                  {t(`industry_${id}`)}
                </button>
              ))}
            </div>
            {errors.includes("industry") && <p className="mt-1.5 text-xs text-destructive">{t("err_industry")}</p>}
          </div>
          {field(
            "country",
            t("fieldCountry"),
            <NativeSelect
              id="biz-country"
              className={selectClass}
              value={b.country}
              onChange={(e) => {
                const c = COUNTRIES.find((x) => x.code === e.target.value);
                update({ country: e.target.value, ...(c ? { timeZone: c.timeZone, currency: c.currency } : {}) });
              }}
            >
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {tc(c.code)}
                </option>
              ))}
            </NativeSelect>,
          )}
          {field(
            "timeZone",
            t("fieldTimeZone"),
            <NativeSelect id="biz-timeZone" className={selectClass} value={b.timeZone} onChange={(e) => update({ timeZone: e.target.value })}>
              {TIME_ZONES.map((z) => (
                <option key={z}>{z}</option>
              ))}
            </NativeSelect>,
            t("fieldTimeZoneHint"),
          )}
          {field(
            "currency",
            t("fieldCurrency"),
            <NativeSelect id="biz-currency" className={selectClass} value={b.currency} onChange={(e) => update({ currency: e.target.value })}>
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </NativeSelect>,
          )}
          {field(
            "website",
            t("fieldWebsite"),
            <Input
              id="biz-website"
              value={b.website}
              aria-invalid={errors.includes("website")}
              placeholder="www.example.com"
              onChange={(e) => update({ website: e.target.value })}
            />,
            t("optional"),
          )}
        </div>

        <aside className="h-fit rounded-2xl bg-[var(--tone-mint)] p-5 text-sm">
          <p className="font-semibold text-foreground">{t("whyTitle")}</p>
          <ul className="mt-3 space-y-2.5 text-muted-foreground">
            <li>{t("why1")}</li>
            <li>{t("why2")}</li>
            <li>{t("why3")}</li>
          </ul>
        </aside>
      </div>
      <Nav onNext={submit} />
    </section>
  );
}

function PlanStep({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const t = useTranslations("Onboarding");
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const choose = (plan: "starter" | "growth" | "pro") => {
    subscriptionStore.set({
      plan,
      cycle,
      status: "trialing",
      trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 864e5).toISOString(),
      renewsAt: null,
    });
    onNext();
  };
  return (
    <section>
      <StepHead title={t("planTitle")} desc={t("planDesc", { days: TRIAL_DAYS })} />
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CycleToggle cycle={cycle} onChange={setCycle} />
        <p className="text-sm text-muted-foreground">{t("planNoCard")}</p>
      </div>
      <PlanPicker cycle={cycle} onSelect={choose} />
      <Nav onBack={onBack} onNext={() => choose("growth")} nextLabel={t("planDecideLater")} />
    </section>
  );
}

function WhatsAppStep({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const t = useTranslations("Onboarding");
  const setup = useSetup();
  const connected = setup.whatsapp === "connected";
  return (
    <section>
      <StepHead title={t("waTitle")} desc={t("waDesc")} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <EmbeddedSignup
          displayName={setup.business.displayName || setup.business.name}
          connected={setup.number}
          onConnected={(number) => setupStore.set((s) => ({ ...s, whatsapp: "connected", number }))}
        />
        <aside className="h-fit rounded-2xl border border-border bg-card p-5 text-sm">
          <p className="font-semibold text-foreground">{t("waHowTitle")}</p>
          <ol className="mt-3 space-y-3 text-muted-foreground">
            {[1, 2, 3, 4].map((n) => (
              <li key={n} className="flex gap-2.5">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-foreground">{n}</span>
                {t(`waHow${n}`)}
              </li>
            ))}
          </ol>
          <p className="mt-4 rounded-xl bg-[var(--tone-butter)] p-3 text-xs text-foreground">{t("waNote")}</p>
        </aside>
      </div>
      <div className="mt-8 flex flex-col-reverse items-stretch justify-between gap-3 sm:flex-row sm:items-center">
        <Button variant="ghost" onClick={onBack} className="gap-1.5">
          <ArrowLeft className="size-4" />
          {t("back")}
        </Button>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
          {!connected && (
            <Button
              variant="outline"
              onClick={() => {
                setupStore.set((s) => ({ ...s, whatsapp: "skipped" }));
                onNext();
              }}
            >
              {t("waLater")}
            </Button>
          )}
          <Button size="lg" onClick={onNext} disabled={!connected} className="gap-1.5">
            {t("continue")}
            <ArrowRight className="size-4" />
          </Button>
        </div>
      </div>
    </section>
  );
}

const FEATURE_ICON: Record<Feature, typeof Bot> = { ai_support: Bot, lead_capture: Target, booking: CalendarCheck };

function FeaturesStep({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const t = useTranslations("Onboarding");
  const setup = useSetup();
  const industry = setup.business.industry || "other";
  const toggle = (f: Feature) =>
    setupStore.set((s) => ({ ...s, features: s.features.includes(f) ? s.features.filter((x) => x !== f) : [...s.features, f] }));
  return (
    <section>
      <StepHead title={t("featuresTitle")} desc={t("featuresDesc", { industry: t(`industry_${industry}`) })} />
      <div className="grid gap-4 md:grid-cols-3">
        {FEATURES.map((f) => {
          const Icon = FEATURE_ICON[f];
          const on = setup.features.includes(f);
          return (
            <button
              key={f}
              type="button"
              role="checkbox"
              aria-checked={on}
              onClick={() => toggle(f)}
              className={cn(
                "flex flex-col rounded-2xl border bg-card p-5 text-left shadow-[var(--shadow-card)] transition-colors",
                on ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-primary/40",
              )}
            >
              <div className="flex items-center justify-between">
                <span className="flex size-10 items-center justify-center rounded-xl bg-[var(--tone-mint)] text-primary">
                  <Icon className="size-5" />
                </span>
                <span
                  className={cn(
                    "flex size-5 items-center justify-center rounded-md border",
                    on ? "border-primary bg-primary text-primary-foreground" : "border-border",
                  )}
                >
                  {on && <Check className="size-3.5" />}
                </span>
              </div>
              <h3 className="mt-4 font-semibold text-foreground">{t(`feature_${f}`)}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{t(`featureDesc_${f}`)}</p>
              <p className="mt-4 rounded-lg bg-muted/70 px-3 py-2 text-xs text-foreground">
                <span className="font-medium">{t("presetLabel")}</span> {t(`preset_${f}_${industry}`)}
              </p>
            </button>
          );
        })}
      </div>
      <Nav onBack={onBack} onNext={onNext} nextLabel={t("finish")} nextDisabled={setup.features.length === 0} />
    </section>
  );
}

function DoneStep() {
  const t = useTranslations("Onboarding");
  const router = useRouter();
  const setup = useSetup();
  const next = [
    setup.whatsapp !== "connected" && { href: "/settings?tab=whatsapp", label: t("doneConnect") },
    setup.features.includes("ai_support") && { href: "/agents", label: t("doneAi") },
    setup.features.includes("lead_capture") && { href: "/agents?tab=leads", label: t("doneLeads") },
    setup.features.includes("booking") && { href: "/bookings?tab=services", label: t("doneBooking") },
  ].filter(Boolean) as { href: string; label: string }[];
  return (
    <section className="mx-auto max-w-xl text-center">
      <span className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-[var(--tone-mint)] text-primary">
        <PartyPopper className="size-8" />
      </span>
      <h1 className="mt-6 text-3xl font-bold tracking-tight text-foreground">{t("doneTitle")}</h1>
      <p className="mt-2 text-muted-foreground">{t("doneDesc", { name: setup.business.name || "AutoShift" })}</p>
      <ul className="mt-8 space-y-2 text-left">
        {next.map(({ href, label }) => (
          <li key={href}>
            <Link href={href} className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground hover:border-primary/50">
              {label}
              <ArrowRight className="size-4 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
      <Button size="lg" className="mt-8" onClick={() => router.push("/dashboard")}>
        {t("doneGo")}
      </Button>
    </section>
  );
}
