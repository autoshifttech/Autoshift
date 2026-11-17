import type { ShiftySound } from "./engine";

/**
 * Tiny sounds for Shifty, made with Web Audio (no files to download). Off by default; the person
 * turns them on in Settings → Appearance. Each is a short, quiet blip.
 */
let ctx: AudioContext | null = null;

function tone(freq: number, at: number, ms: number, type: OscillatorType = "sine", gain = 0.06, slideTo?: number) {
  if (!ctx) return;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, ctx.currentTime + at);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + at + ms / 1000);
  g.gain.setValueAtTime(0.0001, ctx.currentTime + at);
  g.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + at + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + ms / 1000);
  o.connect(g).connect(ctx.destination);
  o.start(ctx.currentTime + at);
  o.stop(ctx.currentTime + at + ms / 1000 + 0.02);
}

export function playShiftySound(kind: ShiftySound) {
  if (typeof window === "undefined" || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    if (kind === "pop") tone(420, 0, 120, "sine", 0.07, 820);
    else if (kind === "hello") { tone(660, 0, 110); tone(880, 0.11, 140); }
    else if (kind === "ding") { tone(1320, 0, 260, "triangle", 0.05); tone(1980, 0.05, 300, "sine", 0.03); }
    else if (kind === "cheer") { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.07, 160, "triangle", 0.05)); }
    else if (kind === "whoosh") tone(180, 0, 700, "sawtooth", 0.025, 1400);
  } catch {
    /* sound is optional */
  }
}
