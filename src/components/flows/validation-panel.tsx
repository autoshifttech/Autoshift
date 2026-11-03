"use client";

/**
 * Validation panel — surfaces every error and warning from
 * `validateFlowForActivation`. Lives once at the bottom of the
 * editor shell so it's visible in both views (canvas + list).
 *
 * Node-scoped issues are clickable: tapping one calls
 * `requestFlash(node_key)` on the editor context. List view's
 * useEffect on `flashKey` expands + scrolls + flashes the row;
 * canvas view's useEffect pans the viewport + flashes the card.
 * Both views read the same flashKey so the panel doesn't need
 * per-view plumbing.
 *
 * Trigger-scoped issues are NOT clickable from canvas — trigger
 * config is a list-only panel (it's a flat form, not a graph
 * concept). User can switch to List to address them.
 */

import { useState } from "react";
import { ChevronDown, CircleAlert, CircleCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { ValidationIssue } from "@/lib/flows/validate";
import { useFlowEditor } from "./flow-editor-state";

export function ValidationPanel() {
  const { issues, requestFlash, setSettingsOpen } = useFlowEditor();
  const t = useTranslations("Flows.validation");
  // Collapsed by default so the list never squeezes the canvas.
  const [open, setOpen] = useState(false);

  if (issues.length === 0) {
    // Slate-950 base + emerald accents so the panel stays readable when
    // sticky-positioned over scrolled-behind node cards (a translucent
    // bg-emerald-500/10 would bleed through ugly).
    return (
      <div className="flex min-h-11 items-center gap-2 rounded-xl border border-emerald-600/50 bg-background px-3 text-sm font-medium text-emerald-800 dark:text-emerald-300">
        <CircleCheck className="h-4 w-4 shrink-0" />
        {t("noIssues")}
      </div>
    );
  }
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  return (
    <div
      className={cn(
        "relative rounded-xl border bg-background shadow-[0_8px_24px_-12px_rgb(0_0_0/0.3)]",
        errors.length > 0 ? "border-red-500/40" : "border-amber-500/40",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-medium text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <CircleAlert
          className={cn("h-4 w-4 shrink-0", errors.length > 0 ? "text-red-700 dark:text-red-400" : "text-amber-800 dark:text-amber-400")}
        />
        <span className="min-w-0 flex-1 truncate">
          {t("summary", { errorCount: errors.length, warningCount: warnings.length })}
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute inset-x-0 bottom-full mb-2 flex max-h-[min(50dvh,18rem)] flex-col gap-1 overflow-y-auto rounded-xl border border-border bg-background px-2 py-2 shadow-[0_8px_24px_-12px_rgb(0_0_0/0.3)]">
          {issues.map((i, ix) => (
            <IssueLine key={ix} issue={i} onJump={requestFlash} onOpenSettings={() => setSettingsOpen(true)} t={t} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Exported so the per-node card (list view) and the trigger panel
 * can render the same "icon + node key chip + message" formatting
 * for their own per-row issue lists without re-implementing the
 * tone / icon / accessibility logic.
 */
export function IssueLine({
  issue,
  onJump,
  onOpenSettings,
  t,
}: {
  issue: ValidationIssue;
  onJump?: (key: string) => void;
  /** Flow-level problems (trigger, entry step) open the settings dialog. */
  onOpenSettings?: () => void;
  t?: ReturnType<typeof useTranslations>;
}) {
  const tone =
    issue.severity === "error" ? "text-red-700 dark:text-red-300" : "text-amber-800 dark:text-amber-300";
  const iconTone =
    issue.severity === "error" ? "text-red-700 dark:text-red-400" : "text-amber-800 dark:text-amber-400";
  const body = (
    <>
      <CircleAlert className={cn("mt-0.5 h-3 w-3 shrink-0", iconTone)} />
      <span className="min-w-0 flex-1">
        {issue.node_key && (
          <code className="mr-1 rounded bg-muted px-1 py-0.5 text-xs text-muted-foreground">
            {issue.node_key}
          </code>
        )}
        {issue.message}
      </span>
    </>
  );

  // Only node-scoped issues can jump; trigger-scoped issues have no
  // destination (the trigger panel is list-only and already at the
  // top of that view).
  if (issue.node_key && onJump) {
    return (
      <button
        type="button"
        onClick={() => onJump(issue.node_key!)}
        className={cn(
          "flex min-h-9 w-full items-start gap-2 rounded-md px-2 py-2 text-left text-xs transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          tone,
        )}
        aria-label={t ? t("jumpToNode", { key: issue.node_key! }) : `Jump to node ${issue.node_key}`}
      >
        {body}
      </button>
    );
  }
  if (!issue.node_key && onOpenSettings) {
    return (
      <button
        type="button"
        onClick={onOpenSettings}
        className={cn(
          "flex min-h-9 w-full items-start gap-2 rounded-md px-2 py-2 text-left text-xs transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          tone,
        )}
      >
        {body}
      </button>
    );
  }
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-md px-2 py-1 text-xs",
        tone,
      )}
    >
      {body}
    </div>
  );
}
