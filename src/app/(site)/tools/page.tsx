import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { SiteHero } from "@/components/site/site-chrome";
import { TOOLS } from "@/components/site/tools-catalog";

export const metadata: Metadata = {
  title: "Free WhatsApp tools",
  description: "Free WhatsApp tools from AutoShift: link generator, QR code generator, text formatter and website chat button.",
};

export default function ToolsPage() {
  return (
    <>
      <SiteHero
        eyebrow="Free tools"
        title="Free WhatsApp tools for small businesses"
        lead="No sign-up and no watermark. Everything runs in your browser, and nothing you type is stored."
      />
      <section className="mx-auto max-w-[1180px] px-4 pt-12 sm:px-8">
        <ul className="grid gap-5 sm:grid-cols-2">
          {TOOLS.map(({ slug, title, description, icon: Icon, tone }) => (
            <li key={slug}>
              <Link
                href={`/tools/${slug}`}
                className="group flex h-full items-start gap-5 rounded-[24px] bg-card p-7 shadow-[var(--shadow-card)] ring-1 ring-border/70 transition hover:-translate-y-0.5 hover:shadow-[0_16px_44px_rgb(26_29_27/0.09)]"
              >
                <span className="grid size-14 shrink-0 place-items-center rounded-full text-primary" style={{ background: `var(--tone-${tone})` }}>
                  <Icon aria-hidden className="size-6" />
                </span>
                <span className="flex-1">
                  <span className="block text-xl font-bold tracking-tight">{title}</span>
                  <span className="mt-1.5 block text-muted-foreground">{description}</span>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary">
                    Open tool <ArrowRight aria-hidden className="size-4 transition group-hover:translate-x-0.5" />
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
