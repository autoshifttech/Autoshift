"use client";

/**
 * The one "Add node" menu used by the canvas and the list view.
 *  - Desktop: a dropdown of grouped steps (icon, name, one-line blurb).
 *  - Phone: a bottom sheet with the same list, so it never covers the header.
 * "Start" has its own group at the top; while the flow has no Start step it
 * is highlighted as the place to begin.
 */

import { Fragment, useState } from "react";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";

import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { NodeIconChip, groupNodeTypesByCategory, type NodeType } from "./shared";

export const ADD_NODE_TYPES: NodeType[] = [
  "start",
  "send_buttons",
  "send_list",
  "send_message",
  "send_media",
  "collect_input",
  "condition",
  "set_tag",
  "action",
  "handoff",
  "end",
];

const TRIGGER_STYLES = {
  primary:
    "bg-primary text-primary-foreground hover:bg-primary-hover inline-flex min-h-10 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium shadow-[0_6px_20px_-8px_rgba(0,0,0,0.5)] transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
  outline:
    "border-border bg-card text-foreground hover:bg-muted inline-flex min-h-10 items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium shadow-[var(--shadow-card)] transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
} as const;

export function AddNodeMenu({
  onAdd,
  hasStart,
  variant = "outline",
  side = "bottom",
  align = "end",
  className,
}: {
  onAdd: (type: NodeType) => void;
  /** Whether the flow already has a Start step. */
  hasStart: boolean;
  variant?: keyof typeof TRIGGER_STYLES;
  side?: "bottom" | "right";
  align?: "start" | "end";
  className?: string;
}) {
  const t = useTranslations("Flows.builder");
  const isPhone = useMediaQuery("(max-width: 767px)");
  const [sheetOpen, setSheetOpen] = useState(false);
  const groups = groupNodeTypesByCategory(ADD_NODE_TYPES);

  const row = (type: NodeType, close?: () => void) => {
    const recommended = type === "start" && !hasStart;
    const body = (
      <>
        <NodeIconChip type={type} size={32} iconSize={16} className="rounded-md" />
        <span className="flex min-w-0 flex-1 flex-col text-left">
          <span className="text-popover-foreground text-[13px] font-semibold">{t(`nodes.${type}.label`)}</span>
          <span className="text-muted-foreground text-xs">{t(`nodes.${type}.blurb`)}</span>
        </span>
        {recommended && (
          <span className="bg-primary/10 text-primary shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold">{t("addMenu.startHere")}</span>
        )}
      </>
    );
    if (close) {
      return (
        <button
          key={type}
          type="button"
          onClick={() => {
            onAdd(type);
            close();
          }}
          className={cn(
            "hover:bg-muted focus-visible:ring-ring flex min-h-14 w-full items-center gap-3 rounded-xl px-2 py-2 focus-visible:ring-2 focus-visible:outline-none",
            recommended && "bg-primary/5 ring-primary/30 ring-1",
          )}
        >
          {body}
        </button>
      );
    }
    return (
      <DropdownMenuItem key={type} onClick={() => onAdd(type)} className={cn("gap-3 py-2", recommended && "bg-primary/5 ring-primary/30 ring-1")}>
        {body}
      </DropdownMenuItem>
    );
  };

  const triggerContent = (
    <>
      <Plus className="h-4 w-4" />
      {t("addNode")}
    </>
  );

  if (isPhone) {
    return (
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetTrigger className={cn(TRIGGER_STYLES[variant], className)} aria-label={t("addNode")}>
          {triggerContent}
        </SheetTrigger>
        <SheetContent side="bottom" className="max-h-[85dvh] gap-0 rounded-t-3xl p-0">
          <SheetHeader className="px-5 pt-5 pb-2">
            <SheetTitle>{t("addMenu.title")}</SheetTitle>
            <SheetDescription>{t("addMenu.desc")}</SheetDescription>
          </SheetHeader>
          <div className="overflow-y-auto px-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {groups.map((group) => (
              <section key={group.id} className="py-1">
                <h3 className="text-muted-foreground px-2 py-1.5 text-xs font-semibold tracking-wider uppercase">{t(`categories.${group.id}`)}</h3>
                {group.types.map((type) => row(type, () => setSheetOpen(false)))}
              </section>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn(TRIGGER_STYLES[variant], className)} aria-label={t("addNode")}>
        {triggerContent}
      </DropdownMenuTrigger>
      <DropdownMenuContent side={side} align={align} sideOffset={side === "right" ? 10 : 6} className="w-72 p-1.5">
        {groups.map((group, i) => (
          // DropdownMenuGroup (base-ui Menu.Group) is required: the label is a
          // Menu.GroupLabel and throws without a Menu.Group ancestor.
          <Fragment key={group.id}>
            {i > 0 && <DropdownMenuSeparator />}
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-muted-foreground px-2 py-1.5 text-xs font-semibold tracking-wider uppercase">
                {t(`categories.${group.id}`)}
              </DropdownMenuLabel>
              {group.types.map((type) => row(type))}
            </DropdownMenuGroup>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
