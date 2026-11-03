import type { VendorId } from "@/lib/ai/catalog";

/** Small marks for the five providers, drawn simply so they stay crisp at 20px. */
export function VendorLogo({ vendor, className = "size-5" }: { vendor: VendorId; className?: string }) {
  switch (vendor) {
    case "openai":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
          <path d="M12 3.2 18.6 7v7.6L12 18.4 5.4 14.6V7z" />
          <path d="M12 3.2v7.4m0 0 6.6 4m-6.6-4-6.6 4" />
        </svg>
      );
    case "google":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden>
          <path fill="#4285F4" d="M12 2c.6 5.4 4.6 9.4 10 10-5.4.6-9.4 4.6-10 10-.6-5.4-4.6-9.4-10-10 5.4-.6 9.4-4.6 10-10z" />
        </svg>
      );
    case "anthropic":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden fill="none" stroke="#D97757" strokeWidth="2.2" strokeLinecap="round">
          <path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4" />
        </svg>
      );
    case "deepseek":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden>
          <path fill="#4D6BFE" d="M3 13c0-4 3.4-7 7.6-7 2.9 0 5.2 1.1 6.9 3 1.2-.2 2.4-.9 3.5-2-.3 2.2-1.3 3.7-3 4.6C17.4 15.7 14.5 19 10.6 19 6.4 19 3 16.5 3 13z" />
          <circle cx="9" cy="11" r="1.1" fill="#fff" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
          {[5, 12, 19].flatMap((x) => [5, 12, 19].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.7" />))}
        </svg>
      );
  }
}
