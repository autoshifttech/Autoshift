import Link from "next/link";
import type { ReactNode } from "react";
import { LogoMark } from "@/components/brand/logo-mark";

/*
 * Header and footer for the app-rendered marketing pages (free tools,
 * release notes). They mirror the public site in public/site/index.html:
 * a floating white pill header, cream ground, one green action.
 *
 * Links into the public site use plain <a href="/#..."> because "/" is a
 * static page with its own hash routing, not a Next.js route.
 */

const NAV = [
  { label: "Services", href: "/#services" },
  { label: "Solutions", href: "/#solutions" },
  { label: "Free tools", href: "/tools" },
  { label: "Pricing", href: "/#pricing" },
  { label: "Contact", href: "/#contact" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 px-4 pt-3 sm:px-8">
      <div className="mx-auto flex h-16 max-w-[1180px] items-center justify-between gap-4 rounded-full liquid-glass lg-frost pr-2 pl-4 sm:pl-5">
        <a href="/" className="flex items-center gap-2.5" aria-label="AutoShift home">
          {/* Round, like the public site's header mark. */}
          <LogoMark className="size-9 overflow-hidden rounded-full" />
          <span className="text-lg font-extrabold tracking-tight">AutoShift</span>
        </a>
        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {NAV.map((item) =>
            item.href.startsWith("/#") ? (
              <a key={item.href} href={item.href} className="rounded-full px-3 py-2 text-[15px] font-medium text-foreground/80 hover:text-foreground">
                {item.label}
              </a>
            ) : (
              <Link key={item.href} href={item.href} className="rounded-full px-3 py-2 text-[15px] font-medium text-foreground/80 hover:text-foreground">
                {item.label}
              </Link>
            ),
          )}
        </nav>
        <div className="flex items-center gap-1">
          <Link href="/login" className="hidden rounded-full px-4 py-2 text-[15px] font-medium text-foreground/80 hover:text-foreground sm:inline-flex">
            Sign in
          </Link>
          <a
            href="/#contact"
            className="inline-flex h-12 items-center rounded-full bg-primary px-5 text-[15px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
          >
            Free audit
          </a>
        </div>
      </div>
    </header>
  );
}

const FOOTER = [
  {
    title: "Free tools",
    links: [
      { label: "WhatsApp link generator", href: "/tools/whatsapp-link-generator" },
      { label: "WhatsApp QR code generator", href: "/tools/whatsapp-qr-code-generator" },
      { label: "WhatsApp text formatter", href: "/tools/whatsapp-text-formatter" },
      { label: "WhatsApp chat button", href: "/tools/whatsapp-chat-button" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Services", href: "/#services" },
      { label: "Pricing", href: "/#pricing" },
      { label: "Release notes", href: "/release-notes" },
      { label: "Contact", href: "/#contact" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy policy", href: "/privacy" },
      { label: "Terms of service", href: "/terms" },
      { label: "Data deletion", href: "/data-deletion" },
      { label: "Sign in", href: "/login" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="mt-24 bg-foreground text-background/75">
      <div className="mx-auto grid max-w-[1180px] gap-10 px-4 py-14 sm:px-8 lg:grid-cols-[1.3fr_3fr]">
        <div className="max-w-sm">
          <a href="/" className="flex items-center gap-2.5 text-background">
            <LogoMark className="size-8" />
            <span className="text-lg font-extrabold tracking-tight">AutoShift</span>
          </a>
          <p className="mt-4 text-sm leading-relaxed">
            AutoShift designs and builds AI agents, automation and software for businesses that want to grow without adding busywork.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
          {FOOTER.map((group) => (
            <div key={group.title}>
              <h2 className="text-sm font-semibold text-background">{group.title}</h2>
              <ul className="mt-4 space-y-2.5 text-sm">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <a href={link.href} className="hover:text-background">
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="border-t border-background/15">
        <p className="mx-auto max-w-[1180px] px-4 py-6 text-xs sm:px-8">© {new Date().getFullYear()} AutoShift. All rights reserved.</p>
      </div>
    </footer>
  );
}

/** Page hero: tinted panel with eyebrow pill, display heading and lead text. */
export function SiteHero({
  eyebrow,
  title,
  lead,
  tone = "mint",
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  lead?: ReactNode;
  tone?: "mint" | "sky" | "peach" | "lilac" | "butter";
  children?: ReactNode;
}) {
  return (
    <section className="px-4 pt-6 sm:px-8">
      <div
        className="mx-auto max-w-[1180px] rounded-[32px] px-6 py-14 text-center sm:px-12 sm:py-20"
        style={{ background: `var(--tone-${tone})` }}
      >
        <span className="inline-flex rounded-full bg-card px-3.5 py-1.5 text-[13px] font-bold text-primary">{eyebrow}</span>
        <h1 className="mx-auto mt-5 max-w-[17ch] text-4xl leading-[1.06] font-extrabold tracking-[-0.035em] text-balance sm:text-6xl">
          {title}
        </h1>
        {lead && <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">{lead}</p>}
        {children}
      </div>
    </section>
  );
}
