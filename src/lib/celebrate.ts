/**
 * A short burst of brand-coloured confetti for big moments (first WhatsApp
 * number connected, a plan or wallet payment going through, finishing
 * onboarding). Plain DOM, cleans itself up after ~1.8 s, and does nothing
 * when the system asks for reduced motion. Decorative only (aria-hidden).
 */
const COLORS = ["#1E4C41", "#5fbf9f", "#c9f27a", "#f4d58d", "#fffdf9"];

export function celebrate(origin?: { x: number; y: number }) {
  if (typeof window === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const x = origin?.x ?? window.innerWidth / 2;
  const y = origin?.y ?? window.innerHeight * 0.35;
  const layer = document.createElement("div");
  layer.setAttribute("aria-hidden", "true");
  layer.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:9998;overflow:hidden";
  document.body.appendChild(layer);
  const count = window.innerWidth < 640 ? 36 : 60;
  for (let i = 0; i < count; i++) {
    const p = document.createElement("i");
    const size = 6 + Math.random() * 6;
    const round = Math.random() < 0.35;
    p.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${size}px;height:${round ? size : size * 0.45}px;border-radius:${round ? "50%" : "2px"};background:${COLORS[i % COLORS.length]};box-shadow:0 0 0 1px rgb(0 0 0 / .04)`;
    layer.appendChild(p);
    const angle = Math.random() * Math.PI * 2;
    const speed = 160 + Math.random() * 260;
    const dx = Math.cos(angle) * speed;
    const dy = Math.sin(angle) * speed - 180;
    const spin = (Math.random() - 0.5) * 900;
    p.animate(
      [
        { transform: "translate(-50%, -50%) rotate(0deg)", opacity: 1 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(${spin / 2}deg)`, opacity: 1, offset: 0.45 },
        { transform: `translate(calc(-50% + ${dx * 1.3}px), calc(-50% + ${dy + 420}px)) rotate(${spin}deg)`, opacity: 0 },
      ],
      { duration: 1300 + Math.random() * 500, easing: "cubic-bezier(0.2, 0.7, 0.4, 1)", fill: "forwards" },
    );
  }
  window.setTimeout(() => layer.remove(), 1900);
}
