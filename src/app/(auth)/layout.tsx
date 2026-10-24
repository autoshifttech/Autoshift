import type { Metadata } from "next";
import type { ReactNode } from "react";
import { LogoMark } from "@/components/brand/logo-mark";

// Shared metadata for auth pages (login / signup / forgot-password).
// None of these should be indexed — they'd compete with the marketing
// landing in SERPs and offer nothing to a searcher who hasn't already
// signed up. Each page still gets its own <title> via its own
// metadata.title override below the route group layout.
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative">
      {/* Plain <a>: "/" is the static public site, not an app route. */}
      <a
        href="/"
        className="absolute top-5 left-5 z-10 inline-flex items-center gap-2 rounded-full bg-card px-3 py-1.5 text-sm font-semibold text-foreground shadow-[var(--shadow-card)] hover:text-primary sm:top-6 sm:left-8"
      >
        <LogoMark className="size-6" />
        AutoShift
      </a>
      {children}
    </div>
  );
}
