"use client";

import { Check, CheckCheck, Copy, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useState, type ReactNode } from "react";
import { countries } from "@/lib/tools/whatsapp";
import { cn } from "@/lib/utils";
import { TOOLS } from "./tools-catalog";
import { NativeSelect } from "@/components/ui/native-select"

/** White rounded card from the public site (24px radius, soft shadow). */
export const cardClass = "rounded-[24px] bg-card shadow-[var(--shadow-card)] ring-1 ring-border/70";

export const inputClass =
  "block w-full min-w-0 rounded-[14px] border-[1.5px] border-border bg-card px-4 py-3 text-base text-foreground transition placeholder:text-muted-foreground/70 focus:border-primary focus:ring-4 focus:ring-primary-soft focus:outline-none aria-invalid:border-destructive";

export const pillButton =
  "inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-full px-6 text-[15px] font-semibold whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50";
export const primaryButton = cn(pillButton, "bg-primary text-primary-foreground hover:bg-primary-hover");
export const ghostButton = cn(pillButton, "bg-card text-foreground shadow-[var(--shadow-card)] ring-1 ring-border/70 hover:ring-primary/40");

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  children: (ids: { id: string; describedBy?: string; invalid: boolean }) => ReactNode;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-semibold text-foreground">
        {label}
      </label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {hint && !error && (
        <p id={hintId} className="mt-1.5 text-[13px] text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="mt-1.5 text-[13px] font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export function CountrySelect({ id, value, onChange }: { id?: string; value: string; onChange: (code: string) => void }) {
  return (
    <NativeSelect id={id} value={value} onChange={(event) => onChange(event.target.value)} className="h-auto rounded-[14px] border-[1.5px] px-4 py-3 text-base">
      {countries.map((country) => (
        <option key={country.code} value={country.code}>
          {country.name} (+{country.dial})
        </option>
      ))}
    </NativeSelect>
  );
}

export function CopyButton({ value, label = "Copy", disabled }: { value: string; label?: string; disabled?: boolean }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (state === "idle") return;
    const timer = window.setTimeout(() => setState("idle"), 2000);
    return () => window.clearTimeout(timer);
  }, [state]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("failed");
    }
  };

  return (
    <button type="button" className={ghostButton} onClick={copy} disabled={disabled} aria-live="polite">
      {state === "copied" ? <Check aria-hidden className="size-4 text-primary" /> : <Copy aria-hidden className="size-4" />}
      {state === "copied" ? "Copied" : state === "failed" ? "Copy failed — select and copy manually" : label}
    </button>
  );
}

/** Accessible single-choice toggle (radio-group semantics) in the site's pill style. */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-full bg-secondary p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-full px-4 py-2 text-sm font-semibold transition-colors",
            option.value === value ? "bg-card text-foreground shadow-[var(--shadow-card)]" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** WhatsApp-style phone preview used by the tools. */
export function ChatPreview({ title, subtitle = "Preview", children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[22rem] rounded-[2.25rem] border-[10px] border-foreground bg-foreground shadow-[0_16px_44px_rgb(26_29_27/0.12)]">
      <div className="overflow-hidden rounded-[1.6rem]">
        <div className="flex items-center gap-3 bg-primary px-4 py-3 text-primary-foreground">
          <span className="grid size-9 place-items-center rounded-full bg-primary-foreground/15 text-sm font-bold">
            {title.replace(/[^A-Za-z]/g, "").slice(0, 1) || "W"}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{title}</p>
            <p className="text-xs opacity-75">{subtitle}</p>
          </div>
        </div>
        <div className="flex h-[22rem] flex-col justify-end gap-2 bg-[#efeae2] p-3">{children}</div>
      </div>
    </div>
  );
}

export function ChatBubble({ children, outgoing = false }: { children: ReactNode; outgoing?: boolean }) {
  return (
    <div className={cn("flex", outgoing ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3 py-2 text-[13px] leading-snug break-words text-[#1a1d1b] shadow-sm",
          outgoing ? "rounded-tr-sm bg-[#d9fdd3]" : "rounded-tl-sm bg-white",
        )}
      >
        {children}
        <span className="mt-1 flex items-center justify-end gap-1 text-xs text-[#7b827e]">
          now {outgoing && <CheckCheck aria-hidden className="size-3 text-sky-500" />}
        </span>
      </div>
    </div>
  );
}

export function ToolShell({ slug, title, description, children }: { slug: string; title: string; description: string; children: ReactNode }) {
  const others = TOOLS.filter((tool) => tool.slug !== slug);
  return (
    <>
      <section className="px-4 pt-6 sm:px-8">
        <div className="mx-auto max-w-[1180px] rounded-[32px] bg-[var(--tone-mint)] px-6 py-10 sm:px-12 sm:py-14">
          <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
            <Link href="/tools" className="hover:text-foreground">
              Free tools
            </Link>{" "}
            <span aria-hidden>/</span> <span className="text-foreground">{title}</span>
          </nav>
          <h1 className="mt-3 text-3xl font-extrabold tracking-[-0.03em] sm:text-5xl">{title}</h1>
          <p className="mt-3 max-w-2xl text-lg text-muted-foreground">{description}</p>
          <p className="mt-5 inline-flex items-center gap-2 rounded-full bg-card px-3.5 py-1.5 text-[13px] font-semibold text-primary">
            <ShieldCheck aria-hidden className="size-4" /> Runs in your browser — nothing is uploaded or stored
          </p>
        </div>
      </section>
      <div className="mx-auto max-w-[1180px] px-4 py-10 sm:px-8 sm:py-14">{children}</div>
      <div className="mx-auto max-w-[1180px] px-4 sm:px-8">
        <h2 className="text-xl font-bold">More free tools</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-3">
          {others.map(({ slug: other, title: name, icon: Icon }) => (
            <li key={other}>
              <Link href={`/tools/${other}`} className={cn(cardClass, "flex items-center gap-3 p-5 transition hover:-translate-y-0.5")}>
                <span className="grid size-10 place-items-center rounded-full bg-[var(--tone-mint)] text-primary">
                  <Icon aria-hidden className="size-5" />
                </span>
                <span className="text-sm font-semibold">{name}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
