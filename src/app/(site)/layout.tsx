import type { Metadata } from "next";
import type { ReactNode } from "react";
import { RouteTransition } from "@/components/motion/route-transition";
import { SmoothScroll } from "@/components/motion/smooth-scroll";
import { PageMotion } from "@/components/motion/page-motion";
import { ScrollReveal } from "@/components/motion/scroll-reveal";
import { SiteFooter, SiteHeader } from "@/components/site/site-chrome";

// Public pages rendered by the app (free tools, release notes) in the
// public site's look. The home page itself is public/site/index.html.
// Unlike the CRM (noindex in the root layout), these pages are meant to be found.
export const metadata: Metadata = { robots: { index: true, follow: true } };

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="app-canvas min-h-screen bg-background text-foreground">
      {/* How far down the page you are: a thin green line along the top. */}
      <div className="scroll-progress" aria-hidden />
      <SiteHeader />
      <main id="main">
        <RouteTransition>
          <PageMotion>{children}</PageMotion>
        </RouteTransition>
      </main>
      <ScrollReveal />
      <SmoothScroll />
      <SiteFooter />
    </div>
  );
}
