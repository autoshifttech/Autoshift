import type { ConnectionKind } from "@/lib/flows/connections";

export function GoogleLogo({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.2C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
      <path fill="#FBBC05" d="M10.5 28.6A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.1.8-4.6l-7.9-6.2A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.2z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.9l-7.9 6.2C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

export function RazorpayLogo({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path fill="#3395FF" d="M9.4 5.2 7.9 10.7l5.4-3.7-3.6 13h3.5L18.5 3H12z" />
      <path fill="#072654" d="m5.5 21 2.4-10.3 2.6.9z" />
    </svg>
  );
}

export function CashfreeLogo({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path fill="#2BB673" d="M4 4h16v4.5H8.8V20H4z" />
      <path fill="#F5A623" d="M11 11h9v4.2h-4.8V20H11z" />
    </svg>
  );
}

export function ConnectionLogo({ kind, className }: { kind: ConnectionKind; className?: string }) {
  if (kind === "google") return <GoogleLogo className={className} />;
  if (kind === "razorpay") return <RazorpayLogo className={className} />;
  return <CashfreeLogo className={className} />;
}
