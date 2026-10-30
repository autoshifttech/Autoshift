/** The first stop for keyboard users: jumps past the navigation to the page. */
export function SkipLink({ label }: { label: string }) {
  return (
    <a
      href="#main-content"
      className="liquid-glass lg-frost fixed top-3 left-3 z-[100] -translate-y-20 rounded-full px-4 py-2 text-sm font-semibold transition-transform focus:translate-y-0 focus-visible:outline-2"
    >
      {label}
    </a>
  );
}
