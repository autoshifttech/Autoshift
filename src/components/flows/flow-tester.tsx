"use client";

/**
 * "Test" chat: walks the flow you are editing as a customer would, in a
 * WhatsApp-style preview. Nothing is sent; connected-account steps are noted
 * rather than run.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw, Send } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Bubble, WhatsAppPreview } from "@/components/ui/whatsapp-preview";
import { begin, choose, reply, type SimChoice, type SimMessage, type SimNode, type SimState } from "@/lib/flows/simulate";
import { useFlowEditor } from "./flow-editor-state";

function NoteLine({ m, t }: { m: Extract<SimMessage, { kind: "note" }>; t: ReturnType<typeof useTranslations> }) {
  const text =
    m.code === "tag"
      ? t(m.arg === "remove" ? "notes.tagRemove" : "notes.tagAdd")
      : m.code === "action"
        ? t("notes.action", { service: m.arg ? t(`notes.service.${m.arg}`) : "" })
        : m.code === "stuck"
          ? t("notes.stuck", { key: m.arg ?? "" })
          : m.code === "handoff" && m.arg
            ? `${t("notes.handoff")} ${m.arg}`
            : t(`notes.${m.code}`);
  return <p className="mx-auto max-w-[90%] rounded-full bg-black/5 px-3 py-1 text-center text-xs text-[#54656f] dark:bg-white/10 dark:text-[#8696a0]">{text}</p>;
}

export function FlowTester() {
  const { state, testOpen, setTestOpen } = useFlowEditor();
  const t = useTranslations("Flows.builder.test");
  const nodes = useMemo<SimNode[]>(() => state.nodes.map((n) => ({ node_key: n.node_key, node_type: n.node_type, config: n.config })), [state.nodes]);
  const [sim, setSim] = useState<SimState | null>(null);
  const [draft, setDraft] = useState("");
  const [listOpen, setListOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  // Start fresh each time the dialog opens.
  useEffect(() => {
    if (testOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSim(begin(nodes, state.entry_node_id));
      setDraft("");
      setListOpen(false);
    }
    // Only when opened: later edits shouldn't rewind a conversation in progress.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testOpen]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [sim]);

  const restart = () => {
    setSim(begin(nodes, state.entry_node_id));
    setDraft("");
    setListOpen(false);
  };
  const pick = (c: SimChoice) => {
    setListOpen(false);
    setSim((s) => (s ? choose(nodes, s, c.id) : s));
  };
  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    setSim((s) => (s ? reply(nodes, s, text) : s));
  };

  const lastBot = sim ? [...sim.messages].reverse().find((m) => m.kind === "bot") : undefined;
  const choices = sim?.wait?.type === "choice" ? sim.wait.choices : [];
  const isList = !!(lastBot && lastBot.kind === "bot" && lastBot.listLabel);

  return (
    <Dialog open={testOpen} onOpenChange={setTestOpen}>
      <DialogContent className="flex max-h-[min(88dvh,44rem)] flex-col gap-3 rounded-3xl sm:max-w-md">
        <DialogHeader className="pr-8">
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("desc")}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <WhatsAppPreview title={state.name || t("untitled")}>
            {sim?.messages.map((m, i) =>
              m.kind === "note" ? (
                <NoteLine key={i} m={m} t={t} />
              ) : m.kind === "user" ? (
                <Bubble key={i} from="customer">
                  {m.text}
                </Bubble>
              ) : (
                <Bubble key={i} from="business">
                  {m.media && <span className="bg-muted/60 text-muted-foreground mb-1.5 flex h-16 items-center justify-center rounded-md text-xs uppercase">{m.media}</span>}
                  {m.text}
                  {m.footer && <span className="mt-1 block text-xs text-[#667781]">{m.footer}</span>}
                </Bubble>
              ),
            )}
            <div ref={endRef} />
          </WhatsAppPreview>
        </div>

        {/* What the customer can do next */}
        <div className="space-y-2">
          {choices.length > 0 && !isList && (
            <div className="flex flex-wrap gap-2">
              {choices.map((c) => (
                <Button key={c.id} variant="outline" className="min-h-10 rounded-full" onClick={() => pick(c)}>
                  {c.title}
                </Button>
              ))}
            </div>
          )}
          {choices.length > 0 && isList && (
            <div>
              <Button variant="outline" className="min-h-10 rounded-full" onClick={() => setListOpen((v) => !v)} aria-expanded={listOpen}>
                {lastBot && lastBot.kind === "bot" ? lastBot.listLabel : t("options")}
              </Button>
              {listOpen && (
                <ul className="border-border mt-2 max-h-40 divide-y divide-border overflow-y-auto rounded-xl border">
                  {choices.map((c) => (
                    <li key={c.id}>
                      <button type="button" onClick={() => pick(c)} className="hover:bg-muted min-h-11 w-full px-3 py-2 text-left text-sm">
                        {c.title}
                        {c.description && <span className="text-muted-foreground block text-xs">{c.description}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {sim?.wait?.type === "input" && (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
            >
              <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t("typeReply")} aria-label={t("typeReply")} autoFocus />
              <Button type="submit" size="icon" className="size-10 shrink-0 rounded-full" aria-label={t("send")} disabled={!draft.trim()}>
                <Send className="size-4" />
              </Button>
            </form>
          )}
          <div className="flex items-center justify-between">
            <p className="text-muted-foreground text-xs">{sim?.finished ? t("finished") : t("hint")}</p>
            <Button variant="ghost" size="sm" onClick={restart} className="min-h-10">
              <RotateCcw className="size-3.5" /> {t("restart")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
