"use client";

import { useState } from "react";
import { toast } from "@/lib/toast";
import { Check, Eye, EyeOff, KeyRound, ShieldCheck, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { act } from "@/lib/admin/store";
import { aiModelsStore, useAiModels, VENDOR_KEY_HINT, type AiModelEntry } from "@/lib/admin/ai-models";
import { useAdminT } from "@/lib/admin/strings";
import { PageHeader, Panel } from "./admin-ui";

function ModelCard({ entry, isDefault }: { entry: AiModelEntry; isDefault: boolean }) {
  const tr = useAdminT();
  const [model, setModel] = useState(entry.model);
  const [key, setKey] = useState("");
  const [show, setShow] = useState(false);
  const ready = entry.keyTail !== null;
  const changed = model.trim() !== entry.model || key.trim() !== "";

  const patch = (p: Partial<AiModelEntry>) => aiModelsStore.set((s) => ({ ...s, models: s.models.map((m) => (m.vendor === entry.vendor ? { ...m, ...p } : m)) }));

  const save = () => {
    if (!model.trim()) return toast.error(tr("Enter the model name"));
    if (!ready && key.trim().length < 8) return toast.error(tr("Paste the API key"));
    const tail = key.trim() ? key.trim().slice(-4) : entry.keyTail;
    patch({ model: model.trim(), keyTail: tail, savedAt: new Date().toISOString() });
    act("Saved AI model", entry.label, `${model.trim()} · key ending ${tail}`);
    setKey("");
    toast.success(`${entry.label} ${tr("saved")}`);
  };

  const toggle = (enabled: boolean) => {
    if (enabled && !ready) return toast.error(tr("Save an API key first"));
    patch({ enabled });
    act(enabled ? "Turned AI model on" : "Turned AI model off", entry.label, entry.model);
    toast.success(`${entry.label} ${enabled ? tr("is on for businesses") : tr("is off")}`);
  };

  const makeDefault = () => {
    aiModelsStore.set((s) => ({ ...s, defaultVendor: entry.vendor }));
    act("Changed default AI model", entry.label, entry.model);
    toast.success(`${entry.label} ${tr("is now the default")}`);
  };

  return (
    <section className={cn("rounded-[20px] border bg-card p-5 shadow-[var(--shadow-card)]", entry.enabled ? "border-primary/40" : "border-border")}>
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--tone-mint)] text-primary">
          <Sparkles className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold text-foreground">
            {entry.label}
            {isDefault && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">{tr("Default")}</span>}
          </h2>
          <p className="text-sm text-muted-foreground">{entry.provider} · {ready ? `${tr("Key saved, ends")} ${entry.keyTail}` : tr("No key yet")}</p>
        </div>
        <Switch checked={entry.enabled} onCheckedChange={toggle} aria-label={`${tr("Offer")} ${entry.label}`} />
      </div>

      <div className="mt-4 grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor={`m-${entry.vendor}`}>{tr("Model")}</Label>
          <Input id={`m-${entry.vendor}`} value={model} onChange={(e) => setModel(e.target.value)} autoComplete="off" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`k-${entry.vendor}`}>{tr("API key")}</Label>
          <div className="relative">
            <Input id={`k-${entry.vendor}`} type={show ? "text" : "password"} value={key} onChange={(e) => setKey(e.target.value)} placeholder={ready ? `•••• ${entry.keyTail}` : VENDOR_KEY_HINT[entry.vendor]} autoComplete="off" className="pr-11" />
            <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? tr("Hide key") : tr("Show key")} className="absolute top-1/2 right-1 flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <Button variant="outline" size="sm" onClick={makeDefault} disabled={isDefault || !entry.enabled}>
          <Check className="mr-1.5 size-4" /> {tr("Make default")}
        </Button>
        <Button size="sm" onClick={save} disabled={!changed}>
          <KeyRound className="mr-1.5 size-4" /> {tr("Save")}
        </Button>
      </div>
    </section>
  );
}

export function AiModelsPage() {
  const tr = useAdminT();
  const { models, defaultVendor } = useAiModels();
  return (
    <>
      <PageHeader title="AI models" description="The models every business can use in its AI assistants. You add the API keys here and pay the provider; businesses are charged per reply from their wallet." />
      <div className="grid gap-4 lg:grid-cols-3">
        {models.map((m) => (
          <ModelCard key={m.vendor} entry={m} isDefault={m.vendor === defaultVendor} />
        ))}
      </div>
      <Panel title="How it works" bodyClassName="p-5">
        <div className="flex items-start gap-3 text-sm text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
          <p>{tr("Businesses never see or enter an API key. They pick from the models you turn on. Only the last four characters of a key are shown after saving.")}</p>
        </div>
      </Panel>
    </>
  );
}
