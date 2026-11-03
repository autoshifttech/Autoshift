"use client";

/**
 * Flow settings in one rounded dialog: name, description, what starts the
 * flow (the trigger) and which step it begins at. Reachable from either view,
 * so the trigger can be fixed from the canvas too.
 */

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useFlowEditor } from "./flow-editor-state";
import { EntryPicker, TriggerPanel } from "./flow-builder";

export function FlowSettingsDialog() {
  const { state, setState, issues, settingsOpen, setSettingsOpen } = useFlowEditor();
  const t = useTranslations("Flows.builder");
  const tHeader = useTranslations("Flows.header");
  const tSettings = useTranslations("Flows.builder.settings");

  return (
    <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
      <DialogContent className="flex max-h-[min(88dvh,44rem)] flex-col gap-4 overflow-y-auto rounded-3xl sm:max-w-xl">
        <DialogHeader className="pr-8">
          <DialogTitle>{tSettings("title")}</DialogTitle>
          <DialogDescription>{tSettings("desc")}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-1.5">
          <label htmlFor="fs-name" className="text-muted-foreground text-xs">
            {tHeader("namePlaceholder")}
          </label>
          <Input id="fs-name" value={state.name} onChange={(e) => setState((s) => ({ ...s, name: e.target.value }))} />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="fs-desc" className="text-muted-foreground text-xs">
            {tHeader("descriptionLabel")}
          </label>
          <Input
            id="fs-desc"
            value={state.description}
            placeholder={tHeader("descriptionPlaceholder")}
            onChange={(e) => setState((s) => ({ ...s, description: e.target.value }))}
          />
        </div>

        <TriggerPanel state={state} setState={setState} triggerIssues={issues.filter((i) => i.scope === "trigger")} t={t} />
        <EntryPicker state={state} setState={setState} t={t} />

        <DialogFooter className="mx-0 mb-0 rounded-b-3xl">
          <Button onClick={() => setSettingsOpen(false)} className="min-h-10 rounded-full px-5">
            {tSettings("done")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
