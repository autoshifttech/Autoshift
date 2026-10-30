import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SiteFooter, SiteHeader } from "@/components/site/site-chrome";

// Public pages rendered by the app (free tools, release notes) in the
// public site's look. The home page itself is public/site/index.html.
// Unlike the CRM (noindex in the root layout), these pages are meant to be found.
export const metadata: Metadata = { robots: { index: true, follow: true } };

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="app-canvas min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main id="main">{children}</main>
      <SiteFooter />
    </div>
  );
}
