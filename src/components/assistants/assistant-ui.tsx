"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Bot, CalendarCheck, Hand, ListChecks, MessageSquare, Puzzle, Send, Sparkles, Tag, Webhook, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { simulateReply, type Assistant, type Tool, type ToolCall, type ToolCategory } from "@/lib/assistants/model";

export const CATEGORY_ICON: Record<ToolCategory, LucideIcon> = {
  booking: CalendarCheck,
  leads: ListChecks,
  messaging: MessageSquare,
  team: Hand,
  custom: Webhook,
};

export const TOOL_ICON: Record<string, LucideIcon> = {
  add_tag: Tag,
  capture_lead: Sparkles,
  handoff: Hand,
};

export function toolIcon(tool: Pick<Tool, "id" | "category">): LucideIcon {
  return TOOL_ICON[tool.id] ?? CATEGORY_ICON[tool.category] ?? Puzzle;
}

export function AssistantAvatar({ assistant, className }: { assistant: Pick<Assistant, "name" | "color">; className?: string }) {
  return (
    <span
      className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl text-white shadow-sm", className)}
      style={{ background: assistant.color }}
      aria-hidden
    >
      <Bot className="size-5" />
    </span>
  );
}

type ChatLine = { from: "customer" | "ai"; text: string; toolCalls?: ToolCall[]; handoff?: boolean };

/** Try an assistant: replies come from a rule-based simulation that uses its knowledge and tools. */
export function TestChat({ assistant, tools, className }: { assistant: Assistant; tools: Tool[]; className?: string }) {
  const t = useTranslations("Assistants");
  const [lines, setLines] = useState<ChatLine[]>(() => (assistant.greeting ? [{ from: "ai", text: assistant.greeting }] : []));
  const [draft, setDraft] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  // Keep the newest message in view.
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [lines]);
  const suggestions = [t("try1"), t("try2"), t("try3"), t("try4")];

  const send = (text: string) => {
    const msg = text.trim();
    if (!msg) return;
    const r = simulateReply(assistant, tools, msg);
    setLines((prev) => [...prev, { from: "customer", text: msg }, { from: "ai", text: r.text, toolCalls: r.toolCalls, handoff: r.handoff }]);
    setDraft("");
  };

  return (
    <div className={cn("flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]", className)}>
      <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
        <AssistantAvatar assistant={assistant} className="size-8 rounded-lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{t("testTitle")}</p>
          <p className="truncate text-xs text-muted-foreground">{t("testDesc")}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setLines(assistant.greeting ? [{ from: "ai", text: assistant.greeting }] : [])}>
          {t("reset")}
        </Button>
      </div>
      <div ref={scroller} className="min-h-72 flex-1 space-y-3 overflow-y-auto bg-[#efeae2] p-3 dark:bg-[#0b141a]">
        {lines.length === 0 && <p className="py-10 text-center text-xs text-[#667781]">{t("testEmpty")}</p>}
        {lines.map((l, i) => (
          <div key={i} className={cn("flex flex-col gap-1", l.from === "customer" ? "items-end" : "items-start")}>
            {l.toolCalls?.map((c, j) => {
              const tool = tools.find((x) => x.id === c.toolId);
              const Icon = tool ? toolIcon(tool) : Puzzle;
              return (
                <span key={j} className="inline-flex max-w-[90%] items-center gap-1.5 rounded-full bg-white/80 px-2.5 py-1 text-[11px] text-[#1E4C41] shadow-sm dark:bg-[#202c33] dark:text-emerald-300">
                  <Icon className="size-3 shrink-0" />
                  <span className="font-semibold">{tool?.name ?? c.toolId}</span>
                  <span className="truncate text-[#667781] dark:text-[#8696a0]">→ {c.output}</span>
                </span>
              );
            })}
            <span
              className={cn(
                "max-w-[85%] rounded-lg px-3 py-2 text-[13px] leading-snug whitespace-pre-line text-[#111b21] shadow-sm dark:text-[#e9edef]",
                l.from === "customer" ? "rounded-tr-none bg-[#d9fdd3] dark:bg-[#005c4b]" : "rounded-tl-none bg-white dark:bg-[#202c33]",
              )}
            >
              {l.text}
            </span>
            {l.handoff && <span className="text-[11px] font-medium text-amber-700 dark:text-amber-300">{t("handedOff")}</span>}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5 border-t border-border px-3 pt-3">
        {suggestions.map((s) => (
          <button key={s} type="button" onClick={() => send(s)} className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
            {s}
          </button>
        ))}
      </div>
      <form
        className="flex gap-2 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
      >
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t("testPlaceholder")} aria-label={t("testPlaceholder")} />
        <Button type="submit" size="icon" aria-label={t("send")} disabled={!draft.trim()}>
          <Send className="size-4" />
        </Button>
      </form>
    </div>
  );
}
