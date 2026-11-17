export type ShiftyLevel = "lively" | "calm" | "off";
export type ShiftySound = "pop" | "cheer" | "whoosh" | "ding" | "hello";

export interface ShiftyOptions {
  level?: ShiftyLevel;
  draggable?: boolean;
  bubbleSide?: "top" | "right";
  onSound?: (kind: ShiftySound) => void;
  /** Built-in lines in the person's language: yay, aha, searching, yawn, hello, phew, thanks, goLive, live, tap ("a|b|c"). */
  text?: Partial<Record<"yay" | "aha" | "searching" | "yawn" | "hello" | "phew" | "thanks" | "goLive" | "live" | "tap", string>>;
}

export interface ShiftyApi {
  host: HTMLElement;
  state: Record<string, number>;
  level(v?: ShiftyLevel): ShiftyLevel;
  pose(partial: Record<string, number | string>, ms?: number, ease?: (t: number) => number): Promise<void>;
  say(text: string, ms?: number): void;
  hush(): void;
  look(target: Element | { x: number; y: number } | null): void;
  stop(): void;
  destroy(): void;
  neutral(): Promise<void>;
  blink(): Promise<void>;
  wave(text?: string): Promise<void>;
  jump(text?: string): Promise<void>;
  celebrate(text?: string): Promise<void>;
  nod(text?: string): Promise<void>;
  shake(text?: string): Promise<void>;
  surprise(text?: string): Promise<void>;
  think(text?: string): Promise<void>;
  stopThinking(): Promise<void>;
  idea(text?: string): Promise<void>;
  search(text?: string): Promise<void>;
  yawn(): Promise<void>;
  sleep(): Promise<void>;
  wake(text?: string): Promise<void>;
  cover(): Promise<void>;
  peek(): Promise<void>;
  uncover(text?: string): Promise<void>;
  dance(text?: string): Promise<void>;
  worry(text?: string): Promise<void>;
  relief(text?: string): Promise<void>;
  point(text?: string, dir?: number): Promise<void>;
  confused(text?: string): Promise<void>;
  wink(text?: string): Promise<void>;
  love(text?: string): Promise<void>;
  walk(dx: number, ms?: number): Promise<void>;
  launch(onCountdown?: (step: string) => void): Promise<void>;
}

export const Shifty: {
  create(host: HTMLElement, opts?: ShiftyOptions): ShiftyApi;
  remove(api: ShiftyApi): void;
  ease: Record<"out" | "in" | "inOut" | "back" | "lin", (t: number) => number>;
};
