"use client";

/**
 * Editor toolbar — flow name / description, status chip, dirty
 * indicator, and the action buttons (Save, Activate/Pause, Delete,
 * View runs, Back).
 *
 * Restyled to the Flow Builder design handoff: a single compact
 * toolbar row (back · icon · inline-editable name · status chip ·
 * edited dot on the left; Runs · Delete · Activate · Save on the
 * right) followed by a subtle, full-width description "note" line.
 * Replaces the old three-row stack so the editor reads as one app
 * chrome bar above the canvas/list stage.
 *
 * Lifted out of flow-builder.tsx so the same toolbar renders above
 * both views in FlowEditorShell. Without this, canvas users had no
 * way to save without toggling to list view.
 *
 * Reads everything from the editor context (`useFlowEditor`) so it
 * stays in sync with whichever view is mutating state, and routes
 * router navigation locally (back to /flows, View runs to
 * /flows/[id]/runs) — those don't belong in the hook.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  CircleDot,
  History,
  Loader2,
  PauseCircle,
  PlayCircle,
  Save,
  Trash2,
  Workflow,
  FlaskConical,
  Redo2,
  SlidersHorizontal,
  Undo2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import {
  useFlowEditor,
  type BuilderState,
} from "./flow-editor-state";

export function EditorHeader({ viewToggle }: { viewToggle?: React.ReactNode }) {
  const router = useRouter();
  const t = useTranslations("Flows.header");
  const {
    flow,
    state,
    setState,
    dirty,
    saving,
    activating,
    canActivate,
    save,
    setStatus,
    deleteFlow,
    undo,
    redo,
    canUndo,
    canRedo,
    setSettingsOpen,
    setTestOpen,
    issues,
  } = useFlowEditor();
  const [leaveOpen, setLeaveOpen] = useState(false);
  const tBuilder = useTranslations("Flows.builder");
  const triggerProblem = issues.some((i) => i.scope === "trigger" && i.severity === "error");

  return (
    <div className="flex flex-col gap-1 bg-card px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-1 sm:px-5 sm:pb-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 sm:gap-y-3">
        {/* ---- left: back · icon · name · status · edited ---- */}
        <button
          type="button"
          onClick={() => (dirty ? setLeaveOpen(true) : router.push("/flows"))}
          title={t("backToFlows")}
          aria-label={t("backToFlows")}
          className="order-1 sm:order-none inline-flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary sm:flex">
          <Workflow className="h-[18px] w-[18px]" />
        </span>
        <input
          value={state.name}
          onChange={(e) => setState((s) => ({ ...s, name: e.target.value }))}
          placeholder={t("namePlaceholder")}
          spellCheck={false}
          aria-label={t("namePlaceholder")}
          className="order-2 sm:order-none field-sizing-content min-h-10 min-w-[6rem] max-w-[min(340px,100%)] flex-1 sm:flex-none rounded-lg border border-border bg-card px-3 py-1 text-[clamp(0.95rem,0.8rem+0.6vw,1.2rem)] font-bold leading-tight tracking-tight text-foreground outline-none transition-colors hover:bg-muted/60 focus:border-primary focus:bg-card focus:shadow-[0_0_0_3px_var(--primary-soft)]"
        />
        <div className="order-4 h-0 basis-full sm:hidden" aria-hidden />
        <div className="order-5 flex items-center gap-3 sm:order-none">
        <StatusChip status={state.status} />
        {dirty && (
          <span
            className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-amber-800 dark:text-amber-300"
            title={t("unsavedHint")}
            aria-live="polite"
          >
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            <span className="sr-only sm:not-sr-only">{t("edited")}</span>
          </span>
        )}
        </div>

        {/* ---- right: runs · delete · activate · save ---- */}
        {viewToggle && <div className="hidden md:block">{viewToggle}</div>}

        <div className="order-6 ml-auto flex items-center gap-0.5 sm:order-none sm:gap-1.5">
          <div className="hidden items-center gap-0.5 sm:flex">
            <Button variant="ghost" size="icon" className="size-9" onClick={undo} disabled={!canUndo} aria-label={tBuilder("history.undo")} title={tBuilder("history.undo")}>
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="size-9" onClick={redo} disabled={!canRedo} aria-label={tBuilder("history.redo")} title={tBuilder("history.redo")}>
              <Redo2 className="h-4 w-4" />
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            aria-label={tBuilder("settings.open")}
            onClick={() => setSettingsOpen(true)}
            className="relative min-h-10 sm:min-h-0"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">{tBuilder("settings.open")}</span>
            {triggerProblem && <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-red-600" aria-hidden />}
          </Button>
          <Button variant="ghost" size="sm" aria-label={tBuilder("test.open")} onClick={() => setTestOpen(true)} className="min-h-10 sm:min-h-0">
            <FlaskConical className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">{tBuilder("test.open")}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label={t("runs")}
            onClick={() => router.push(`/flows/${flow.id}/runs`)}
            className="min-h-10 sm:min-h-0"
          >
            <History className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t("runs")}</span>
            <span className="ml-0.5 hidden rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground sm:inline">
              {flow.execution_count}
            </span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label={t("delete")}
            onClick={() => void deleteFlow()}
            className="min-h-10 text-red-700 hover:bg-red-500/10 hover:text-red-300 sm:min-h-0 dark:text-red-400"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t("delete")}</span>
          </Button>
          {state.status === "active" ? (
            <Button
              variant="outline"
              size="sm"
              className="min-h-10 sm:min-h-0"
              onClick={() => void setStatus("draft")}
              disabled={activating}
            >
              {activating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <PauseCircle className="h-3.5 w-3.5" />
              )}
              {t("pause")}
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="min-h-10 sm:min-h-0"
              onClick={() => void setStatus("active")}
              disabled={activating || !canActivate}
              title={
                !canActivate ? t("fixIssues") : undefined
              }
            >
              {activating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <PlayCircle className="h-3.5 w-3.5" />
              )}
              {t("activate")}
            </Button>
          )}
        </div>
        <Button onClick={() => void save()} disabled={saving} size="sm" className="order-3 min-h-10 sm:order-none sm:min-h-0">
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {t("save")}
          </Button>
      </div>

      {/* ---- description note (subtle, inline-editable) ---- */}
      <input
        value={state.description}
        onChange={(e) =>
          setState((s) => ({ ...s, description: e.target.value }))
        }
        placeholder={t("descriptionPlaceholder")}
        aria-label={t("descriptionLabel")}
        className="hidden w-full max-w-[78ch] rounded-md border border-transparent bg-transparent px-2 py-1 text-[13px] sm:block text-muted-foreground outline-none transition-colors placeholder:text-muted-foreground/60 hover:bg-muted/50 focus:border-primary focus:bg-transparent focus:text-foreground"
      />

      <ConfirmDialog
        open={leaveOpen}
        onOpenChange={setLeaveOpen}
        title={tBuilder("leave.title")}
        description={tBuilder("leave.desc")}
        confirmLabel={tBuilder("leave.confirm")}
        cancelLabel={tBuilder("leave.stay")}
        onConfirm={() => router.push("/flows")}
      />
    </div>
  );
}

function StatusChip({ status }: { status: BuilderState["status"] }) {
  // Status labels live with the flows list so the chip and the list
  // badge can never drift apart.
  const t = useTranslations("Flows.list");
  const cfg = {
    draft: {
      // Neutral, not amber — amber is reserved for the adjacent
      // "Edited" dirty signal, so the two don't read as the same alert.
      cls: "border-border bg-muted text-muted-foreground",
      label: t("statusDraft"),
    },
    active: {
      cls: "border-emerald-600/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
      label: t("statusActive"),
    },
    archived: {
      cls: "border-border bg-muted/50 text-muted-foreground",
      label: t("statusArchived"),
    },
  }[status];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-medium",
        cfg.cls,
      )}
    >
      <CircleDot className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}
