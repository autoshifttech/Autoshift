"use client";

import { EmptyPanel } from "@/components/ui/empty-panel";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import {
  Workflow,
  Link2,
  Plus,
  Trash2,
  Pencil,
  Loader2,
  MessageSquare,
  PlayCircle,
  PauseCircle,
  Archive,
  HelpCircle,
  UserPlus,
  FileText,
  Copy,
  Search,
  ShoppingBag,
  CalendarCheck,
} from "lucide-react";

import { useLocale, useTranslations } from "next-intl";
import { useCan } from "@/hooks/use-can";
import { Button, buttonVariants } from "@/components/ui/button";
import { GatedButton } from "@/components/ui/gated-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

/**
 * Flows list page.
 *
 * Open to every authenticated user. Flows is in soft-GA — the "Beta"
 * chip in the header is the only remaining signal that the surface
 * is new. The previous per-account beta gate was removed in PR #134.
 */

interface FlowRow {
  id: string;
  name: string;
  description: string | null;
  status: "draft" | "active" | "archived";
  trigger_type: "keyword" | "first_inbound_message" | "manual";
  trigger_config: { keywords?: string[] } | Record<string, unknown>;
  entry_node_id?: string | null;
  execution_count: number;
  last_executed_at: string | null;
  created_at: string;
  updated_at: string;
}

const STATUS_LABELS = (t: ReturnType<typeof useTranslations>): Record<FlowRow["status"], string> => ({
  draft: t("statusDraft"),
  active: t("statusActive"),
  archived: t("statusArchived"),
});

const STATUS_COLORS: Record<FlowRow["status"], string> = {
  draft: "border-border bg-muted text-muted-foreground",
  active: "border-emerald-600/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
  archived: "border-border bg-muted/50 text-muted-foreground",
};

interface TemplateSummary {
  slug: string;
  name: string;
  description: string;
  icon: "MessageSquare" | "HelpCircle" | "UserPlus" | "ShoppingBag" | "CalendarCheck";
  trigger_type: string;
  node_count: number;
}

const TEMPLATE_ICONS = {
  MessageSquare,
  HelpCircle,
  UserPlus,
  ShoppingBag,
  CalendarCheck,
} as const;

export default function FlowsPage() {
  const router = useRouter();
  const canCreate = useCan("send-messages");
  const t = useTranslations("Flows.list");
  const tGate = useTranslations("GatedButton");
  const [flows, setFlows] = useState<FlowRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "draft">("all");
  const [pendingDelete, setPendingDelete] = useState<FlowRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [flowsRes, tmplRes] = await Promise.all([
          fetch("/api/flows"),
          fetch("/api/flows/templates"),
        ]);
        if (!flowsRes.ok) {
          throw new Error(`Failed to load flows: ${flowsRes.status}`);
        }
        const flowsJson = (await flowsRes.json()) as { flows: FlowRow[] };
        if (!cancelled) setFlows(flowsJson.flows ?? []);
        // Templates endpoint is forward-looking — if it 404s on an
        // older deployment, gracefully fall through.
        if (tmplRes.ok) {
          const tmplJson = (await tmplRes.json()) as {
            templates: TemplateSummary[];
          };
          if (!cancelled) setTemplates(tmplJson.templates ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          console.error(err);
          toast.error(t("loadError"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/flows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          trigger_type: "keyword",
          trigger_config: { keywords: [] },
        }),
      });
      if (!res.ok) throw new Error(`Create failed: ${res.status}`);
      const json = (await res.json()) as { flow: FlowRow };
      setCreateOpen(false);
      setNewName("");
      router.push(`/flows/${json.flow.id}`);
    } catch (err) {
      console.error(err);
      toast.error(t("createError"));
    } finally {
      setCreating(false);
    }
  }

  async function handleUseTemplate(slug: string) {
    setCreating(true);
    try {
      const res = await fetch("/api/flows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template_slug: slug }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? t("cloneFailedStatus", { status: res.status }));
      }
      const json = (await res.json()) as { flow: FlowRow };
      setCreateOpen(false);
      router.push(`/flows/${json.flow.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("cloneError");
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  }

  async function handleToggle(flow: FlowRow, on: boolean) {
    const next = on ? "active" : "draft";
    setFlows((prev) => prev.map((f) => (f.id === flow.id ? { ...f, status: next } : f)));
    try {
      const res = await fetch(`/api/flows/${flow.id}/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? t("toggleError"));
      }
      toast.success(t(on ? "toastOn" : "toastOff", { name: flow.name }));
    } catch (err) {
      setFlows((prev) => prev.map((f) => (f.id === flow.id ? { ...f, status: flow.status } : f)));
      toast.error(err instanceof Error ? err.message : t("toggleError"));
    }
  }

  async function handleDuplicate(flow: FlowRow) {
    try {
      const src = await fetch(`/api/flows/${flow.id}`);
      if (!src.ok) throw new Error(t("cloneFailedStatus", { status: src.status }));
      const { nodes } = (await src.json()) as { nodes?: unknown[] };
      const created = await fetch("/api/flows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: t("copyName", { name: flow.name }),
          trigger_type: flow.trigger_type,
          trigger_config: flow.trigger_config,
        }),
      });
      if (!created.ok) throw new Error(t("cloneFailedStatus", { status: created.status }));
      const { flow: copy } = (await created.json()) as { flow: FlowRow };
      const saved = await fetch(`/api/flows/${copy.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: copy.name,
          description: flow.description,
          trigger_type: flow.trigger_type,
          trigger_config: flow.trigger_config,
          entry_node_id: flow.entry_node_id ?? null,
          nodes: nodes ?? [],
        }),
      });
      if (!saved.ok) throw new Error(t("cloneFailedStatus", { status: saved.status }));
      setFlows((prev) => [{ ...copy, description: flow.description, trigger_type: flow.trigger_type, trigger_config: flow.trigger_config, entry_node_id: flow.entry_node_id, nodes: nodes ?? [] } as FlowRow, ...prev]);
      toast.success(t("duplicated"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("cloneError"));
    }
  }

  async function handleDelete(flow: FlowRow) {
    try {
      const res = await fetch(`/api/flows/${flow.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
      setFlows((prev) => prev.filter((f) => f.id !== flow.id));
      toast.success(t("deleteSuccess"));
    } catch (err) {
      console.error(err);
      toast.error(t("deleteError"));
    }
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...flows]
      .filter((f) => (filter === "all" ? true : filter === "active" ? f.status === "active" : f.status !== "active"))
      .filter((f) => !q || f.name.toLowerCase().includes(q) || describeTrigger(f, t).toLowerCase().includes(q))
      .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""));
  }, [flows, query, filter, t]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="sr-only">{t("title")}</h2>
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">
              {t("beta")}
            </span>
            <span className="hidden sm:inline">{t("description")}</span>
            <span className="sm:hidden">{t("descriptionShort")}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        <Link href="/flows/connections" className={buttonVariants({ variant: "outline" })}>
          <Link2 className="h-4 w-4" />
          {t("connections")}
        </Link>
        <GatedButton
          canAct={canCreate}
          gateReason={tGate("reasons.createFlows")}
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="h-4 w-4" />
          {t("newFlow")}
        </GatedButton>
        </div>
      </header>

      {flows.length === 0 ? (
        <EmptyState
          onCreate={() => setCreateOpen(true)}
          canCreate={canCreate}
          templates={templates}
          onUseTemplate={handleUseTemplate}
          creating={creating}
          t={t}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("searchPlaceholder")}
                aria-label={t("searchPlaceholder")}
                className="h-10 pl-9"
              />
            </div>
            <div role="group" aria-label={t("filterLabel")} className="inline-flex gap-0.5 rounded-full border border-border bg-muted p-0.5">
              {(["all", "active", "draft"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={filter === f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    "min-h-9 rounded-full px-3.5 text-[13px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    filter === f ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t(f === "all" ? "filterAll" : f === "active" ? "statusActive" : "statusDraft")}
                </button>
              ))}
            </div>
          </div>

          {visible.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">{t("noResults")}</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {visible.map((flow) => (
                <FlowCard
                  key={flow.id}
                  flow={flow}
                  onEdit={() => router.push(`/flows/${flow.id}`)}
                  onDelete={() => setPendingDelete(flow)}
                  onDuplicate={() => void handleDuplicate(flow)}
                  onToggle={(on) => void handleToggle(flow, on)}
                  t={t}
                />
              ))}
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(o) => !o && setPendingDelete(null)}
        title={t("deleteTitle", { name: pendingDelete?.name ?? "" })}
        description={t("deleteDesc")}
        confirmLabel={t("delete")}
        cancelLabel={t("cancel")}
        onConfirm={() => {
          if (pendingDelete) void handleDelete(pendingDelete);
          setPendingDelete(null);
        }}
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        {/* `sm:max-w-4xl` not `max-w-4xl` — shadcn's DialogContent has
            `sm:max-w-sm` baked into its default classes. Without the
            sm: prefix our override applies at base only and the
            sm-scoped 384px wins at every real desktop breakpoint. */}
        <DialogContent className={cn(templates.length > 0 ? "sm:max-w-2xl" : "sm:max-w-md", "bg-popover text-popover-foreground")}>
          <DialogHeader>
            <DialogTitle>{t("createTitle")}</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {t("createDesc")}
            </DialogDescription>
          </DialogHeader>

          {templates.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {t("startTemplate")}
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {templates.map((template) => {
                  const Icon = TEMPLATE_ICONS[template.icon] ?? FileText;
                  return (
                    <button
                      key={template.slug}
                      type="button"
                      onClick={() => handleUseTemplate(template.slug)}
                      disabled={creating}
                      className="flex flex-col gap-2.5 rounded-lg border border-border bg-background p-4 text-left transition-colors hover:border-primary/40 hover:bg-muted disabled:opacity-50"
                    >
                      <Icon className="h-5 w-5 text-primary" />
                      <span className="text-sm font-semibold text-popover-foreground">
                        {template.name}
                      </span>
                      <span className="text-xs leading-relaxed text-muted-foreground">
                        {template.description}
                      </span>
                      <span className="mt-auto border-t border-border pt-2 text-xs text-muted-foreground">
                        {t("nodeCount", { count: template.node_count })}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-2 border-t border-border pt-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {t("startBlank")}
            </p>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t("placeholderName")}
              className="bg-muted"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
              }}
            />
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setCreateOpen(false)}
              disabled={creating}
            >
              {t("cancel")}
            </Button>
            <Button onClick={handleCreate} disabled={!newName.trim() || creating}>
              {creating && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("createBlank")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EmptyState({
  onCreate,
  canCreate,
  templates,
  onUseTemplate,
  creating,
  t,
}: {
  onCreate: () => void;
  canCreate: boolean;
  templates: TemplateSummary[];
  onUseTemplate: (slug: string) => void;
  creating: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  const tGate = useTranslations("GatedButton");
  return (
    <div className="space-y-6">
      <EmptyPanel icon={Workflow} title={t("emptyTitle")} description={t("emptyDesc")} className="rounded-2xl border border-border bg-card py-12">
        <GatedButton canAct={canCreate} gateReason={tGate("reasons.createFlows")} onClick={onCreate}>
          <Plus className="h-4 w-4" />
          {t("createFirst")}
        </GatedButton>
      </EmptyPanel>

      {templates.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">{t("fromTemplate")}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {templates.map((template) => {
              const Icon = TEMPLATE_ICONS[template.icon] ?? FileText;
              return (
                <button
                  key={template.slug}
                  type="button"
                  disabled={creating || !canCreate}
                  onClick={() => onUseTemplate(template.slug)}
                  className="flex min-h-11 flex-col gap-2 rounded-2xl border border-border bg-card p-4 text-left shadow-[var(--shadow-card)] transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
                >
                  <span className="flex items-center gap-2">
                    <Icon className="h-5 w-5 text-primary" />
                    <span className="text-sm font-semibold text-foreground">{template.name}</span>
                  </span>
                  <span className="text-xs leading-relaxed text-muted-foreground">{template.description}</span>
                  <span className="mt-auto text-xs text-muted-foreground">{t("nodeCount", { count: template.node_count })}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function FlowCard({
  flow,
  onEdit,
  onDelete,
  onDuplicate,
  onToggle,
  t,
}: {
  flow: FlowRow;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onToggle: (on: boolean) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const locale = useLocale();
  const triggerSummary = describeTrigger(flow, t);
  const steps = Array.isArray((flow as { nodes?: unknown[] }).nodes) ? (flow as { nodes?: unknown[] }).nodes!.length : null;
  const edited = relativeTime(flow.updated_at, locale);
  return (
    <div className="flex flex-col rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)] transition-colors hover:border-primary/30">
      <div className="flex items-start justify-between gap-3">
        <button type="button" onClick={onEdit} className="flex min-w-0 items-center gap-2 rounded text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
          <Workflow className="h-4 w-4 shrink-0 text-primary" />
          <h3 className="truncate text-sm font-semibold text-foreground">{flow.name}</h3>
        </button>
        <label className="flex shrink-0 items-center gap-2 text-xs font-medium text-muted-foreground">
          <span className={flow.status === "active" ? "text-emerald-800 dark:text-emerald-300" : undefined}>{STATUS_LABELS(t)[flow.status]}</span>
          <Switch
            checked={flow.status === "active"}
            onCheckedChange={onToggle}
            disabled={flow.status === "archived"}
            aria-label={t("toggleLabel", { name: flow.name })}
          />
        </label>
      </div>

      <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{flow.description || triggerSummary}</p>
      {flow.description && <p className="mt-1 truncate text-xs text-muted-foreground">{triggerSummary}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {steps !== null && <span>{t("nodeCount", { count: steps })}</span>}
        <span className="inline-flex items-center gap-1">
          <MessageSquare className="h-3 w-3" />
          {t("runCount", { count: flow.execution_count })}
        </span>
        {edited && <span>{t("edited", { when: edited })}</span>}
      </div>

      <div className="mt-4 flex items-center justify-end gap-1 border-t border-border pt-3">
        <Button variant="ghost" size="sm" onClick={onEdit} className="min-h-10">
          <Pencil className="h-3.5 w-3.5" />
          {t("edit")}
        </Button>
        <Button variant="ghost" size="sm" onClick={onDuplicate} className="min-h-10">
          <Copy className="h-3.5 w-3.5" />
          {t("duplicate")}
        </Button>
        <Button variant="ghost" size="sm" onClick={onDelete} className="min-h-10 text-red-700 hover:bg-red-500/10 hover:text-red-300 dark:text-red-400">
          <Trash2 className="h-3.5 w-3.5" />
          {t("delete")}
        </Button>
      </div>
    </div>
  );
}

function relativeTime(iso: string | null | undefined, locale: string): string {
  if (!iso) return "";
  const diff = new Date(iso).getTime() - Date.now();
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const mins = Math.round(diff / 60000);
  if (Math.abs(mins) < 60) return rtf.format(mins, "minute");
  const hours = Math.round(mins / 60);
  if (Math.abs(hours) < 48) return rtf.format(hours, "hour");
  return rtf.format(Math.round(hours / 24), "day");
}

function describeTrigger(flow: FlowRow, t: ReturnType<typeof useTranslations>): string {
  if (flow.trigger_type === "keyword") {
    const keywords = Array.isArray(flow.trigger_config.keywords)
      ? (flow.trigger_config.keywords as string[])
      : [];
    if (keywords.length === 0) return t("triggerKeywordNone");
    return t("triggerKeyword", { keywords: keywords.join(", ") });
  }
  if (flow.trigger_type === "first_inbound_message") {
    return t("triggerFirstInbound");
  }
  return t("triggerManual");
}
