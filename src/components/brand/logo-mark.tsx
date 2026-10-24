import { cn } from "@/lib/utils";

/**
 * AutoShift brand mark: the double chevron on a rounded green square,
 * the same glyph as the public site's favicon (public/site/index.html).
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden="true"
      className={cn("size-8 shrink-0", className)}
    >
      <rect width="64" height="64" rx="14" fill="#1E4C41" />
      <path
        d="M18 36l14-14 14 14M18 50l14-14 14 14"
        fill="none"
        stroke="#fff"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
