"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { FlaskConical, Pencil, Plus, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import { TOOL_CATEGORIES, assistantsStore, updateTool, useAssistants, type Tool, type ToolParam } from "@/lib/assistants/model";
import { AssistantAvatar, toolIcon } from "./assistant-ui";

/** AI → Tools: what assistants can do in a chat, plus custom webhook tools (e.g. n8n). */
export function ToolsPage() {
  const t = useTranslations("AiTools");
  const locale = useLocale();
  const { tools, assistants } = useAssistants();
  const [editing, setEditing] = useState<Tool | "new" | null>(null);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="sr-only">{t("title")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <Button onClick={() => setEditing("new")} className="gap-1.5 self-start">
          <Plus className="size-4" />
          {t("addCustom")}
        </Button>
      </div>

      {TOOL_CATEGORIES.map((cat) => {
        const list = tools.filter((x) => x.category === cat);
        if (!list.length) return null;
        return (
          <section key={cat}>
            <h2 className="mb-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase">{t(`cat_${cat}`)}</h2>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {list.map((tool) => {
                const Icon = toolIcon(tool);
                const users = assistants.filter((a) => a.toolIds.includes(tool.id));
                return (
                  <div key={tool.id} className={cn("flex flex-col rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]", !tool.enabled && "opacity-70")}>
                    <div className="flex items-start gap-3">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--tone-mint)] text-primary">
                        <Icon className="size-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-foreground">{tool.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {tool.builtin ? t("builtIn") : t("webhook", { method: tool.webhook?.method ?? "POST" })} · {t("calls", { count: tool.calls })}
                        </p>
                      </div>
                      <Switch checked={tool.enabled} onCheckedChange={(enabled) => updateTool(tool.id, { enabled })} aria-label={tool.name} />
                    </div>
                    <p className="mt-3 flex-1 text-sm text-muted-foreground">{tool.description}</p>
                    <div className="mt-4 flex items-center justify-between gap-2 border-t border-border pt-3">
                      <div className="flex items-center gap-1.5">
                        {users.length === 0 ? (
                          <span className="text-xs text-muted-foreground">{t("unused")}</span>
                        ) : (
                          <>
                            <span className="flex -space-x-2">
                              {users.map((a) => (
                                <AssistantAvatar key={a.id} assistant={a} className="size-6 rounded-full ring-2 ring-card [&_svg]:size-3" />
                              ))}
                            </span>
                            <span className="text-xs text-muted-foreground">{t("usedBy", { count: users.length })}</span>
                          </>
                        )}
                      </div>
                      <Button variant="ghost" size="sm" className="gap-1" onClick={() => setEditing(tool)}>
                        <Pencil className="size-3.5" />
                        {t("edit")}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      <p className="text-xs text-muted-foreground">{t("footnote", { date: new Date().toLocaleDateString(locale, { month: "long" }) })}</p>

      {editing && <ToolDialog tool={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ToolDialog({ tool, onClose }: { tool: Tool | null; onClose: () => void }) {
  const t = useTranslations("AiTools");
  const { assistants } = useAssistants();
  const [draft, setDraft] = useState<Tool>(
    () =>
      tool ?? {
        id: `tool-${Date.now()}`,
        builtin: false,
        category: "custom",
        name: "",
        description: "",
        enabled: true,
        calls: 0,
        webhook: { url: "", method: "POST", params: [{ name: "", type: "string", required: true, description: "" }] },
      },
  );
  const [usedBy, setUsedBy] = useState<string[]>(() => assistants.filter((a) => tool && a.toolIds.includes(tool.id)).map((a) => a.id));
  const [tested, setTested] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const wh = draft.webhook;
  const setParam = (i: number, patch: Partial<ToolParam>) =>
    wh && setDraft({ ...draft, webhook: { ...wh, params: wh.params.map((p, j) => (j === i ? { ...p, ...patch } : p)) } });
  const urlOk = !wh || /^https:\/\/[\w.-]+\.[a-z]{2,}(\/\S*)?$/i.test(wh.url.trim());
  const valid = draft.name.trim() && draft.description.trim() && urlOk;

  const save = () => {
    setTried(true);
    if (!valid) return;
    assistantsStore.set((s) => ({
      tools: tool ? s.tools.map((x) => (x.id === tool.id ? draft : x)) : [...s.tools, draft],
      assistants: s.assistants.map((a) => ({
        ...a,
        toolIds: usedBy.includes(a.id) ? [...new Set([...a.toolIds, draft.id])] : a.toolIds.filter((x) => x !== draft.id),
      })),
    }));
    toast.success(tool ? t("saved") : t("added"));
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] grid-cols-[minmax(0,1fr)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{tool ? t("editTitle") : t("newTitle")}</DialogTitle>
          <DialogDescription>{draft.builtin ? t("builtinDesc") : t("newDesc")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="tl-name">{t("name")}</Label>
            <Input id="tl-name" value={draft.name} disabled={draft.builtin} aria-invalid={tried && !draft.name.trim()} placeholder={t("namePh")} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="tl-desc">{t("whenToUse")}</Label>
            <Textarea id="tl-desc" rows={3} value={draft.description} aria-invalid={tried && !draft.description.trim()} placeholder={t("whenToUsePh")} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            <p className="text-xs text-muted-foreground">{t("whenToUseHint")}</p>
          </div>

          {wh && (
            <>
              <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-2">
                <div className="grid gap-1.5">
                  <Label>{t("method")}</Label>
                  <NativeSelect value={wh.method} onChange={(e) => setDraft({ ...draft, webhook: { ...wh, method: e.target.value as "GET" | "POST" } })}>
                    <option>POST</option>
                    <option>GET</option>
                  </NativeSelect>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="tl-url">{t("url")}</Label>
                  <Input id="tl-url" value={wh.url} aria-invalid={tried && !urlOk} placeholder="https://n8n.example.com/webhook/…" onChange={(e) => setDraft({ ...draft, webhook: { ...wh, url: e.target.value } })} />
                </div>
              </div>
              {tried && !urlOk && <p className="-mt-2 text-xs text-destructive">{t("urlError")}</p>}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">{t("params")}</p>
                  <Button size="sm" variant="ghost" className="gap-1" onClick={() => setDraft({ ...draft, webhook: { ...wh, params: [...wh.params, { name: "", type: "string", required: false, description: "" }] } })}>
                    <Plus className="size-3.5" />
                    {t("addParam")}
                  </Button>
                </div>
                <div className="space-y-2">
                  {wh.params.map((p, i) => (
                    <div key={i} className="grid gap-2 rounded-xl bg-muted/50 p-2.5 sm:grid-cols-[minmax(0,1fr)_110px_auto]">
                      <Input value={p.name} placeholder={t("paramName")} aria-label={t("paramName")} onChange={(e) => setParam(i, { name: e.target.value.replace(/\s+/g, "_") })} />
                      <NativeSelect value={p.type} onChange={(e) => setParam(i, { type: e.target.value as ToolParam["type"] })}>
                        <option value="string">{t("type_string")}</option>
                        <option value="number">{t("type_number")}</option>
                        <option value="boolean">{t("type_boolean")}</option>
                      </NativeSelect>
                      <Button variant="ghost" size="icon" aria-label={t("removeParam")} onClick={() => setDraft({ ...draft, webhook: { ...wh, params: wh.params.filter((_, j) => j !== i) } })}>
                        <X className="size-4" />
                      </Button>
                      <Input className="sm:col-span-3" value={p.description} placeholder={t("paramDesc")} aria-label={t("paramDesc")} onChange={(e) => setParam(i, { description: e.target.value })} />
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setTested(JSON.stringify({ ok: true, status: 200, data: { status: "shipped", eta: "Thursday" } }, null, 2))}
                >
                  <FlaskConical className="size-3.5" />
                  {t("test")}
                </Button>
                {tested && (
                  <pre className="mt-2 overflow-x-auto rounded-xl bg-[#0b141a] p-3 font-mono text-xs text-emerald-200">
                    {tested}
                  </pre>
                )}
              </div>
            </>
          )}

          <div>
            <p className="mb-2 text-sm font-medium text-foreground">{t("whichAssistants")}</p>
            <div className="flex flex-wrap gap-2">
              {assistants.map((a) => {
                const on = usedBy.includes(a.id);
                return (
                  <button
                    key={a.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setUsedBy(on ? usedBy.filter((x) => x !== a.id) : [...usedBy, a.id])}
                    className={cn("flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-sm", on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground")}
                  >
                    <AssistantAvatar assistant={a} className="size-6 rounded-full [&_svg]:size-3" />
                    {a.name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <DialogFooter className="sm:justify-between">
          {tool && !tool.builtin ? (
            <Button
              variant="ghost"
              className="gap-1.5 text-destructive hover:text-destructive"
              onClick={() => {
                assistantsStore.set((s) => ({ tools: s.tools.filter((x) => x.id !== tool.id), assistants: s.assistants.map((a) => ({ ...a, toolIds: a.toolIds.filter((x) => x !== tool.id) })) }));
                toast.success(t("deleted"));
                onClose();
              }}
            >
              <Trash2 className="size-4" />
              {t("delete")}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button onClick={save}>{t("save")}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
