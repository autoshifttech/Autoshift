import { cn } from "@/lib/utils";

/** Three dots that ripple up one after another while the AI works (thinking_1). */
export function ThinkingDots({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("thinking-dots", className)}>
      <i />
      <i />
      <i />
    </span>
  );
}

/** Text with a light that sweeps across it, letter by letter (thinking_2). */
export function ThinkingText({ children, className }: { children: string; className?: string }) {
  return <span className={cn("thinking-text", className)}>{children}</span>;
}
