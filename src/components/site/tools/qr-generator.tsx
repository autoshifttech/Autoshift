"use client";

import { Download, ImagePlus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { downloadDataUrl, downloadText, renderQrPng, renderQrSvg } from "@/lib/tools/qr";
import { buildWaLink, countries, validateNationalNumber } from "@/lib/tools/whatsapp";
import { cn } from "@/lib/utils";
import { cardClass, CountrySelect, Field, ghostButton, inputClass, primaryButton, ToolShell } from "../tool-ui";

const MAX_LOGO_BYTES = 1024 * 1024;
const colorInput = "h-12 w-full cursor-pointer rounded-[14px] border-[1.5px] border-border bg-card p-1";

export function QrGenerator() {
  const [country, setCountry] = useState("IN");
  const [number, setNumber] = useState("");
  const [message, setMessage] = useState("");
  const [foreground, setForeground] = useState("#1E4C41");
  const [background, setBackground] = useState("#FFFFFF");
  const [logo, setLogo] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [rendered, setRendered] = useState<{ key: string; url: string } | null>(null);

  const dial = countries.find((c) => c.code === country)!.dial;
  const error = validateNationalNumber(dial, number);
  const link = error ? "" : buildWaLink(dial, number, message);
  const key = [link, foreground, background, logo].join("|");

  useEffect(() => {
    let cancelled = false;
    if (!link) return;
    renderQrPng(link, { foreground, background, size: 1024, logo })
      .then((url) => !cancelled && setRendered({ key: [link, foreground, background, logo].join("|"), url }))
      .catch(() => !cancelled && setLogoError("That logo could not be used. Try a PNG or JPG."));
    return () => {
      cancelled = true;
    };
  }, [link, foreground, background, logo]);

  const png = link && rendered?.key === key ? rendered.url : null;

  const onLogo = (file: File | undefined) => {
    setLogoError(null);
    if (!file) return;
    if (!file.type.startsWith("image/")) return setLogoError("Choose an image file (PNG, JPG or SVG).");
    if (file.size > MAX_LOGO_BYTES) return setLogoError("Logos must be under 1 MB.");
    const reader = new FileReader();
    reader.onload = () => setLogo(String(reader.result));
    reader.readAsDataURL(file);
  };

  const downloadSvg = async () => {
    downloadText(await renderQrSvg(link, { foreground, background }), "whatsapp-qr.svg", "image/svg+xml");
  };

  return (
    <ToolShell
      slug="whatsapp-qr-code-generator"
      title="WhatsApp QR code generator"
      description="A scannable QR that opens a chat with your business. Add your colours and logo, then download in HD — no watermark."
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
          <Field label="Prefilled message (optional)">
            {({ id }) => <input id={id} value={message} maxLength={300} onChange={(event) => setMessage(event.target.value)} className={inputClass} />}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="QR colour">
              {({ id }) => <input id={id} type="color" value={foreground} onChange={(event) => setForeground(event.target.value)} className={colorInput} />}
            </Field>
            <Field label="Background">
              {({ id }) => <input id={id} type="color" value={background} onChange={(event) => setBackground(event.target.value)} className={colorInput} />}
            </Field>
          </div>
          <Field label="Logo (optional)" hint="PNG, JPG or SVG up to 1 MB" error={logoError ?? undefined}>
            {({ id, describedBy }) => (
              <div className="flex flex-wrap items-center gap-3">
                <label htmlFor={id} className={cn(ghostButton, "cursor-pointer")}>
                  <ImagePlus aria-hidden className="size-4" /> {logo ? "Change logo" : "Upload logo"}
                </label>
                <input id={id} type="file" accept="image/*" aria-describedby={describedBy} className="sr-only" onChange={(event) => onLogo(event.target.files?.[0])} />
                {logo && (
                  <button type="button" className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground" onClick={() => setLogo(null)}>
                    <X aria-hidden className="size-4" /> Remove
                  </button>
                )}
              </div>
            )}
          </Field>
        </form>
        <div className={cn(cardClass, "flex flex-col items-center p-6 sm:p-8")}>
          {png ? (
            // eslint-disable-next-line @next/next/no-img-element -- generated data URL
            <img src={png} alt="Your WhatsApp QR code" className="w-full max-w-72 rounded-2xl" />
          ) : (
            <div className="grid aspect-square w-full max-w-72 place-items-center rounded-2xl border-[1.5px] border-dashed border-border bg-background p-6 text-center text-sm text-muted-foreground">
              Enter a valid number to see your QR code
            </div>
          )}
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <button type="button" className={primaryButton} disabled={!png} onClick={() => png && downloadDataUrl(png, "whatsapp-qr.png")}>
              <Download aria-hidden className="size-4" /> PNG (1024px)
            </button>
            <button type="button" className={ghostButton} disabled={!link} onClick={downloadSvg}>
              <Download aria-hidden className="size-4" /> SVG
            </button>
          </div>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Static wa.me codes keep working as long as the number stays active on WhatsApp.
            {logo && " The SVG download does not include the logo."}
          </p>
        </div>
      </div>
    </ToolShell>
  );
}
