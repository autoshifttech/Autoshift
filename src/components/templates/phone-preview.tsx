"use client";

import { Fragment, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { BatteryFull, Camera, ChevronLeft, Copy, ExternalLink, FileText, Image as ImageIcon, List, Mic, MoreVertical, Phone, Play, Reply, Signal, Smile, Video, Wifi } from "lucide-react";

import { cn } from "@/lib/utils";
import type { TemplateButton } from "@/types";

export interface PhonePreviewTemplate {
  header_format: "none" | "text" | "image" | "video" | "document";
  header_content: string;
  header_sample: string;
  header_media_url: string;
  body_text: string;
  body_samples: string[];
  footer_text: string;
  buttons: TemplateButton[];
}

/** Swap {{n}} for its sample value, or keep the placeholder highlighted when there is none. */
function fillVariables(text: string, samples: string[]): ReactNode[] {
  return text.split(/(\{\{\s*\d+\s*\}\})/g).map((part, i) => {
    const m = part.match(/^\{\{\s*(\d+)\s*\}\}$/);
    if (!m) return <Fragment key={i}>{formatWhatsApp(part)}</Fragment>;
    const value = samples[Number(m[1]) - 1]?.trim();
    return value ? (
      <Fragment key={i}>{value}</Fragment>
    ) : (
      <span key={i} className="rounded bg-[#d9fdd3] px-0.5 font-mono text-xs text-[#1E4C41] dark:bg-[#005c4b] dark:text-[#d9fdd3]">
        {part}
      </span>
    );
  });
}

/** WhatsApp's inline formatting: *bold*, _italic_, ~strike~ and ```mono```. */
function formatWhatsApp(text: string): ReactNode[] {
  return text.split(/(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|```[^`]+```)/g).map((part, i) => {
    if (/^\*[^*]+\*$/.test(part)) return <strong key={i}>{part.slice(1, -1)}</strong>;
    if (/^_[^_]+_$/.test(part)) return <em key={i}>{part.slice(1, -1)}</em>;
    if (/^~[^~]+~$/.test(part)) return <s key={i}>{part.slice(1, -1)}</s>;
    if (/^```[^`]+```$/.test(part)) return <code key={i} className="font-mono text-[12px]">{part.slice(3, -3)}</code>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}

const BUTTON_ICON = { QUICK_REPLY: Reply, URL: ExternalLink, PHONE_NUMBER: Phone, COPY_CODE: Copy } as const;

function MediaHeader({ format, url }: { format: "image" | "video" | "document"; url: string }) {
  if (format === "document") {
    return (
      <div className="mb-1.5 flex items-center gap-2 rounded-md bg-[#f5f6f6] p-2 dark:bg-[#1d282f]">
        <span className="flex size-8 items-center justify-center rounded bg-[#e2574c] text-white">
          <FileText className="size-4" />
        </span>
        <span className="min-w-0 flex-1 truncate text-[12px] text-[#111b21] dark:text-[#e9edef]">{url ? decodeURIComponent(url.split("/").pop() || "document.pdf") : "document.pdf"}</span>
      </div>
    );
  }
  const isImage = format === "image" && /^(https?:|blob:|data:image)/.test(url);
  return (
    <div className="relative mb-1.5 flex aspect-[1.91/1] items-center justify-center overflow-hidden rounded-md bg-gradient-to-br from-[#cfe3dc] to-[#a9c9bd] dark:from-[#1d3a33] dark:to-[#12271f]">
      {/* eslint-disable-next-line @next/next/no-img-element -- user-supplied media URL for a preview */}
      {isImage ? <img src={url} alt="" className="h-full w-full object-cover" /> : format === "image" ? <ImageIcon className="size-8 text-[#1E4C41]/70 dark:text-white/60" /> : <Video className="size-8 text-[#1E4C41]/70 dark:text-white/60" />}
      {format === "video" && (
        <span className="absolute flex size-10 items-center justify-center rounded-full bg-black/45 text-white">
          <Play className="ml-0.5 size-4 fill-current" />
        </span>
      )}
    </div>
  );
}

/** A phone mock-up showing a WhatsApp template the way a customer receives it. */
export function TemplatePhonePreview({ template, businessName, className, screenClassName = "h-[560px]" }: { template: PhonePreviewTemplate; businessName: string; className?: string; /** Height of the phone screen. */ screenClassName?: string }) {
  const t = useTranslations("Settings.templates");
  const { header_format, header_content, header_sample, header_media_url, body_text, body_samples, footer_text, buttons } = template;
  const hasContent = body_text.trim() || (header_format === "text" && header_content.trim()) || (header_format !== "none" && header_format !== "text") || footer_text.trim() || buttons.length > 0;
  // WhatsApp lists up to three buttons and folds the rest behind "See all options".
  const shown = buttons.length > 3 ? buttons.slice(0, 2) : buttons;

  return (
    <div className={cn("mx-auto w-full max-w-[290px]", className)}>
      <div className="rounded-[2.6rem] bg-[#1b1b1d] p-2.5 shadow-[0_24px_48px_-20px_rgb(0_0_0/0.45)] ring-1 ring-black/10">
        <div className={cn("relative flex flex-col overflow-hidden rounded-[2.1rem] bg-[#efeae2] dark:bg-[#0b141a]", screenClassName)}>
          {/* Status bar and camera island */}
          <div className="relative flex items-center justify-between bg-[#1E4C41] px-6 pt-2.5 pb-1 text-xs font-semibold text-white">
            <span>9:41</span>
            <span className="absolute top-2 left-1/2 h-5 w-20 -translate-x-1/2 rounded-full bg-black" />
            <span className="flex items-center gap-1">
              <Signal className="size-3" />
              <Wifi className="size-3" />
              <BatteryFull className="size-3.5" />
            </span>
          </div>
          {/* Chat header */}
          <div className="flex items-center gap-2 bg-[#1E4C41] px-2 pt-1.5 pb-2.5 text-white">
            <ChevronLeft className="size-5 shrink-0" />
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/20 text-sm font-semibold">{businessName.charAt(0).toUpperCase()}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] leading-tight font-semibold">{businessName}</span>
              <span className="block text-xs text-white/75">{t("previewBusinessAccount")}</span>
            </span>
            <Video className="size-4 shrink-0" />
            <Phone className="size-4 shrink-0" />
            <MoreVertical className="size-4 shrink-0" />
          </div>

          {/* Conversation */}
          <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-3 [background-image:radial-gradient(rgb(0_0_0/0.035)_1px,transparent_1px)] [background-size:14px_14px]">
            <p className="mx-auto mb-3 w-fit rounded-md bg-white/90 px-2 py-0.5 text-xs text-[#54656f] shadow-sm dark:bg-[#182229] dark:text-[#8696a0]">{t("previewToday")}</p>
            {hasContent ? (
              <div className="max-w-[88%]">
                <div className="rounded-lg rounded-tl-none bg-white p-1.5 text-[13px] leading-snug text-[#111b21] shadow-sm dark:bg-[#202c33] dark:text-[#e9edef]">
                  {header_format !== "none" && header_format !== "text" && <MediaHeader format={header_format} url={header_media_url} />}
                  <div className="px-1.5 pt-0.5">
                    {header_format === "text" && header_content.trim() && <p className="mb-1 font-semibold">{fillVariables(header_content, [header_sample])}</p>}
                    {body_text.trim() ? (
                      <p className="break-words whitespace-pre-wrap">{fillVariables(body_text, body_samples)}</p>
                    ) : (
                      <p className="text-[#8696a0] italic">{t("previewBodyEmpty")}</p>
                    )}
                    {footer_text.trim() && <p className="mt-1 text-xs text-[#667781] dark:text-[#8696a0]">{footer_text}</p>}
                    <p className="mt-0.5 text-right text-xs text-[#667781] dark:text-[#8696a0]">9:41</p>
                  </div>
                  {buttons.length > 0 && (
                    <div className="mt-1 -mb-0.5 border-t border-[#e9edef] dark:border-[#2a3942]">
                      {shown.map((b, i) => {
                        const Icon = BUTTON_ICON[b.type];
                        return (
                          <div key={i} className={cn("flex items-center justify-center gap-1.5 py-2 text-[13px] font-medium text-[#027eb5] dark:text-[#53bdeb]", i > 0 && "border-t border-[#e9edef] dark:border-[#2a3942]")}>
                            <Icon className="size-3.5 shrink-0" />
                            <span className="truncate">{b.text.trim() || t("previewButtonEmpty")}</span>
                          </div>
                        );
                      })}
                      {buttons.length > 3 && (
                        <div className="flex items-center justify-center gap-1.5 border-t border-[#e9edef] py-2 text-[13px] font-medium text-[#027eb5] dark:border-[#2a3942] dark:text-[#53bdeb]">
                          <List className="size-3.5" />
                          {t("previewSeeAll")}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="mt-24 px-6 text-center text-xs text-[#667781] dark:text-[#8696a0]">{t("previewEmpty")}</p>
            )}
          </div>

          {/* Composer */}
          <div className="flex items-center gap-1.5 px-2 pt-1 pb-4">
            <div className="flex h-9 flex-1 items-center gap-2 rounded-full bg-white px-3 text-[12px] text-[#8696a0] dark:bg-[#202c33]">
              <Smile className="size-4 shrink-0" />
              <span className="flex-1 truncate">{t("previewMessage")}</span>
              <Camera className="size-4 shrink-0" />
            </div>
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#1E4C41] text-white">
              <Mic className="size-4" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
