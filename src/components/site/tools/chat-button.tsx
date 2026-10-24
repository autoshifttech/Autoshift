"use client";

import { MessageCircle, X } from "lucide-react";
import { useMemo, useState } from "react";
import { buildWaLink, countries, validateNationalNumber } from "@/lib/tools/whatsapp";
import { cn } from "@/lib/utils";
import { cardClass, CopyButton, CountrySelect, Field, inputClass, Segmented, ToolShell } from "../tool-ui";

type Position = "right" | "left";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

/** Self-contained embed snippet; every user value is HTML-escaped. */
export function chatButtonSnippet({ link, color, position, label }: { link: string; color: string; position: Position; label: string }) {
  const side = position === "right" ? "right:20px" : "left:20px";
  const safeColor = /^#[0-9a-f]{6}$/i.test(color) ? color : "#25d366";
  return `<!-- WhatsApp chat button -->
<a href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(label)}"
   style="position:fixed;bottom:20px;${side};z-index:9999;display:flex;align-items:center;gap:8px;padding:12px 18px;border-radius:999px;background:${safeColor};color:#fff;font:600 15px/1 system-ui,sans-serif;text-decoration:none;box-shadow:0 8px 24px rgba(0,0,0,.18)">
  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Z"/></svg>
  ${escapeHtml(label)}
</a>`;
}

export function ChatButton() {
  const [country, setCountry] = useState("IN");
  const [number, setNumber] = useState("");
  const [greeting, setGreeting] = useState("Hi! I have a question.");
  const [label, setLabel] = useState("Chat with us");
  const [color, setColor] = useState("#25d366");
  const [position, setPosition] = useState<Position>("right");
  const [touched, setTouched] = useState(false);
  const [bubbleOpen, setBubbleOpen] = useState(true);

  const dial = countries.find((c) => c.code === country)!.dial;
  const error = validateNationalNumber(dial, number);
  const link = error ? "" : buildWaLink(dial, number, greeting);
  const buttonLabel = label || "Chat on WhatsApp";
  const code = useMemo(() => (link ? chatButtonSnippet({ link, color, position, label: buttonLabel }) : ""), [link, color, position, buttonLabel]);
  const sideClass = position === "right" ? "right-5" : "left-5";

  return (
    <ToolShell
      slug="whatsapp-chat-button"
      title="WhatsApp chat button"
      description="Add a floating “Chat on WhatsApp” button to any website. Configure it, preview it, and paste one snippet before </body>."
    >
      <div className="grid gap-10 lg:grid-cols-2">
        <form className={cn(cardClass, "min-w-0 space-y-5 p-6 sm:p-8")} onSubmit={(event) => event.preventDefault()} noValidate>
          <div className="grid gap-4 sm:grid-cols-[1fr_1.3fr]">
            <Field label="Country">{({ id }) => <CountrySelect id={id} value={country} onChange={setCountry} />}</Field>
            <Field label="WhatsApp number" hint="Without the country code" error={touched ? (error ?? undefined) : undefined}>
              {({ id, describedBy, invalid }) => (
                <input
                  id={id}
                  inputMode="tel"
                  placeholder="98765 43210"
                  value={number}
                  onChange={(event) => setNumber(event.target.value)}
                  onBlur={() => setTouched(true)}
                  aria-invalid={invalid}
                  aria-describedby={describedBy}
                  className={inputClass}
                />
              )}
            </Field>
          </div>
          <Field label="Button label">
            {({ id }) => <input id={id} value={label} maxLength={40} onChange={(event) => setLabel(event.target.value)} className={inputClass} />}
          </Field>
          <Field label="Greeting message">
            {({ id }) => <input id={id} value={greeting} maxLength={200} onChange={(event) => setGreeting(event.target.value)} className={inputClass} />}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Colour">
              {({ id }) => (
                <input id={id} type="color" value={color} onChange={(event) => setColor(event.target.value)} className="h-12 w-full cursor-pointer rounded-[14px] border-[1.5px] border-border bg-card p-1" />
              )}
            </Field>
            <div>
              <p className="mb-2 text-sm font-semibold">Position</p>
              <Segmented
                label="Button position"
                value={position}
                onChange={setPosition}
                options={[
                  { value: "left", label: "Bottom left" },
                  { value: "right", label: "Bottom right" },
                ]}
              />
            </div>
          </div>
          <div className="min-w-0">
            <p className="mb-2 text-sm font-semibold">Embed code</p>
            <pre className="max-h-56 overflow-auto rounded-[14px] bg-foreground p-4 text-xs leading-relaxed text-background">
              <code>{code || "<!-- Enter a valid number to generate the snippet -->"}</code>
            </pre>
            <div className="mt-3">
              <CopyButton value={code} label="Copy snippet" disabled={!code} />
            </div>
          </div>
        </form>
        <div className="min-w-0">
          <p className="mb-2 text-sm font-semibold">Live preview</p>
          <div className={cn(cardClass, "relative h-[28rem] overflow-hidden")}>
            <div className="space-y-3 p-6" aria-hidden>
              <div className="h-6 w-1/2 rounded-full bg-secondary" />
              <div className="h-3 w-5/6 rounded-full bg-secondary/70" />
              <div className="h-3 w-4/6 rounded-full bg-secondary/70" />
              <div className="mt-6 h-32 rounded-[20px] bg-[var(--tone-mint)]" />
            </div>
            {bubbleOpen && (
              <div className={cn("absolute bottom-20 w-64 rounded-[20px] bg-card p-4 shadow-[0_16px_44px_rgb(26_29_27/0.12)] ring-1 ring-border", sideClass)}>
                <button type="button" aria-label="Close preview bubble" onClick={() => setBubbleOpen(false)} className="absolute top-2 right-2 rounded-full p-1 text-muted-foreground hover:bg-secondary">
                  <X aria-hidden className="size-4" />
                </button>
                <p className="text-sm font-semibold">Need help?</p>
                <p className="mt-1 text-xs text-muted-foreground">Visitors are taken to WhatsApp with: “{greeting}”</p>
              </div>
            )}
            <a
              href={link || undefined}
              aria-disabled={!link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(event) => {
                if (!link) event.preventDefault();
                setBubbleOpen(true);
              }}
              className={cn("absolute bottom-5 flex items-center gap-2 rounded-full px-4 py-3 text-sm font-semibold text-white shadow-lg", sideClass)}
              style={{ background: color }}
            >
              <MessageCircle aria-hidden className="size-5" /> {buttonLabel}
            </a>
          </div>
        </div>
      </div>
    </ToolShell>
  );
}
