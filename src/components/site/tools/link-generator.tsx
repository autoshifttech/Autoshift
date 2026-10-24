"use client";

import { Download, ExternalLink } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { downloadDataUrl, renderQrPng } from "@/lib/tools/qr";
import { buildWaLink, countries, validateNationalNumber } from "@/lib/tools/whatsapp";
import { cn } from "@/lib/utils";
import {
  cardClass,
  ChatBubble,
  ChatPreview,
  CopyButton,
  CountrySelect,
  Field,
  ghostButton,
  inputClass,
  ToolShell,
} from "../tool-ui";

export function LinkGenerator() {
  const [country, setCountry] = useState("IN");
  const [number, setNumber] = useState("");
  const [message, setMessage] = useState("Hi! I’d like to know more about your services.");
  const [touched, setTouched] = useState(false);
  const [rendered, setRendered] = useState<{ link: string; url: string } | null>(null);

  const dial = countries.find((c) => c.code === country)!.dial;
  const error = validateNationalNumber(dial, number);
  const link = useMemo(() => (error ? "" : buildWaLink(dial, number, message)), [dial, number, message, error]);

  useEffect(() => {
    let cancelled = false;
    if (!link) return;
    renderQrPng(link, { foreground: "#1A1D1B", background: "#FFFFFF", size: 512 }).then((url) => {
      if (!cancelled) setRendered({ link, url });
    });
    return () => {
      cancelled = true;
    };
  }, [link]);

  // Only show the QR for the link it was rendered from.
  const qr = link && rendered?.link === link ? rendered.url : null;

  return (
    <ToolShell
      slug="whatsapp-link-generator"
      title="WhatsApp link generator"
      description="Create a wa.me click-to-chat link with a prefilled message, test it, and grab a QR code for print."
    >
      <div className="grid gap-10 lg:grid-cols-[1.2fr_1fr]">
        <form className={cn(cardClass, "min-w-0 space-y-5 p-6 sm:p-8")} onSubmit={(event) => event.preventDefault()} noValidate>
          <div className="grid gap-4 sm:grid-cols-[1fr_1.3fr]">
            <Field label="Country">{({ id }) => <CountrySelect id={id} value={country} onChange={setCountry} />}</Field>
            <Field label="WhatsApp number" hint="Without the country code" error={touched ? (error ?? undefined) : undefined}>
              {({ id, describedBy, invalid }) => (
                <input
                  id={id}
                  inputMode="tel"
                  autoComplete="tel-national"
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
          <Field label="Prefilled message" hint={`${message.length}/500 characters`}>
            {({ id, describedBy }) => (
              <textarea
                id={id}
                rows={4}
                maxLength={500}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                aria-describedby={describedBy}
                className={cn(inputClass, "resize-y")}
              />
            )}
          </Field>
          <div>
            <p className="mb-2 text-sm font-semibold">Your link</p>
            <output className="block min-h-12 rounded-[14px] border-[1.5px] border-dashed border-border bg-background px-4 py-3 font-mono text-sm break-all">
              {link || <span className="text-muted-foreground">Enter a valid number to generate your link</span>}
            </output>
          </div>
          <div className="flex flex-wrap gap-2">
            <CopyButton value={link} label="Copy link" disabled={!link} />
            <button type="button" className={ghostButton} disabled={!link} onClick={() => window.open(link, "_blank", "noopener,noreferrer")}>
              <ExternalLink aria-hidden className="size-4" /> Test link
            </button>
            <button type="button" className={ghostButton} disabled={!qr} onClick={() => qr && downloadDataUrl(qr, "whatsapp-link-qr.png")}>
              <Download aria-hidden className="size-4" /> Download QR
            </button>
          </div>
        </form>
        <div className="space-y-6">
          <ChatPreview title={number ? `+${dial} ${number}` : "Your business"}>
            {message.trim() && <ChatBubble>{message}</ChatBubble>}
          </ChatPreview>
          {qr && (
            <figure className={cn(cardClass, "mx-auto w-48 p-3")}>
              {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL */}
              <img src={qr} alt="QR code for your WhatsApp link" className="w-full" />
              <figcaption className="mt-2 text-center text-xs text-muted-foreground">Scan to test</figcaption>
            </figure>
          )}
        </div>
      </div>
    </ToolShell>
  );
}
