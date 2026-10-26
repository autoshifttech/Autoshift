"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

/** Replays the page's entry animation (cards rising in, one after another) on every route change. */
export function PageMotion({ children, className }: { children: ReactNode; className?: string }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className={className ? `page-enter ${className}` : "page-enter"}>
      {children}
    </div>
  );
}
