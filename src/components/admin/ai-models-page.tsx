"use client";

import { useEffect, useState } from "react";
import { toast } from "@/lib/toast";
import { Eye, EyeOff, KeyRound, Plus, ShieldCheck, Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { act } from "@/lib/admin/store";
import { aiModelsStore, useAiModels } from "@/lib/admin/ai-models";
import { useAdminT } from "@/lib/admin/strings";
import { addModel, loadAdminAiModels, makeModelDefault, saveProviderKey, setModelEnabled, setProviderEnabled } from "@/lib/admin/ai-models-sync";
import { backendUrl } from "@/lib/backend/client";
import { VENDORS, vendorLabel, type ModelTierKey, type VendorId } from "@/lib/ai/catalog";
import { ModelChips, ProviderCards, TipBox } from "@/components/ai/model-picker";
import { PageHeader, Panel } from "./admin-ui";

const TIER_TIP: Record<ModelTierKey, string> = {
  newest: "Newest top tier from this provider. Near-flagship quality at a mid-range price; best for complex, multi-step conversations.",
  flagship: "Top quality for complex conversations. The highest price per reply.",
  balanced: "Balanced. Very good at following instructions and using tools, at a mid-range price.",
  fast: "Fast and low cost. Great for simple questions and high volume.",
  reasoning: "Thinks step by step. Best for hard questions; slower and costlier.",
  preview: "Preview. Newer and may change; test it before relying on it.",
  value: "Lowest cost. Good for simple, high-volume replies.",
};

export function AiModelsPage() {
  const tr = useAdminT();
  const state = useAiModels();
  const [vendor, setVendor] = useState<VendorId>("openai");
  const [key, setKey] = useState("");
  const [show, setShow] = useState(false);
  const [custom, setCustom] = useState("");

  const provider = state.providers[vendor];
  const models = state.models[vendor];
  const ready = provider.keyTail !== null;
  const defaultHere = state.defaultChoice.vendor === vendor ? state.defaultChoice.model : undefined;
  const [focus, setFocus] = useState<string | undefined>(undefined);
  const focused = models.find((m) => m.id === focus) ?? models.find((m) => m.id === defaultHere) ?? models[0];

  const setProvider = (patch: Partial<typeof provider>) =>
    aiModelsStore.set((s) => ({ ...s, providers: { ...s.providers, [vendor]: { ...s.providers[vendor], ...patch } } }));
  const setModels = (next: typeof models) => aiModelsStore.set((s) => ({ ...s, models: { ...s.models, [vendor]: next } }));

  useEffect(() => {
    if (backendUrl()) void loadAdminAiModels().catch(() => {});
  }, []);

  // Connected: the server does the change (encrypts the key, records it) and the page reloads from it.
  const live = backendUrl() !== null;

  const toggleProvider = (on: boolean) => {
    if (on && !ready) return toast.error(tr("Save an API key first"));
    if (live) return void setProviderEnabled(vendor, on).then((ok) => ok && toast.success(`${vendorLabel(vendor)} ${on ? tr("is on for businesses") : tr("is off")}`));
    setProvider({ enabled: on });
    act(on ? "Turned AI provider on" : "Turned AI provider off", vendorLabel(vendor), "");
    toast.success(`${vendorLabel(vendor)} ${on ? tr("is on for businesses") : tr("is off")}`);
  };

  const saveKey = () => {
    if (key.trim().length < 8) return toast.error(tr("Paste the API key"));
    if (live) {
      void saveProviderKey(vendor, key).then((ok) => {
        if (!ok) return;
        setKey("");
        toast.success(`${vendorLabel(vendor)} ${tr("saved")}`);
      });
      return;
    }
    setProvider({ keyTail: key.trim().slice(-4), savedAt: new Date().toISOString() });
    act("Saved AI provider key", vendorLabel(vendor), `ending ${key.trim().slice(-4)}`);
    setKey("");
    toast.success(`${vendorLabel(vendor)} ${tr("saved")}`);
  };

  const toggleModel = (id: string) => {
    const m = models.find((x) => x.id === id);
    if (!m) return;
    if (m.enabled && defaultHere === id) return toast.error(tr("Pick another default first"));
    if (live) return void setModelEnabled(vendor, id, !m.enabled).then(() => setFocus(id));
    setModels(models.map((x) => (x.id === id ? { ...x, enabled: !x.enabled } : x)));
    setFocus(id);
    act(m.enabled ? "Turned AI model off" : "Turned AI model on", `${vendorLabel(vendor)} · ${m.label}`, "");
  };

  const makeDefault = (id: string) => {
    if (live) return void makeModelDefault(vendor, id).then((ok) => ok && toast.success(`${models.find((x) => x.id === id)?.label} ${tr("is now the default")}`));
    aiModelsStore.set((s) => ({
      ...s,
      defaultChoice: { vendor, model: id },
      models: { ...s.models, [vendor]: s.models[vendor].map((x) => (x.id === id ? { ...x, enabled: true } : x)) },
    }));
    act("Changed default AI model", vendorLabel(vendor), id);
    toast.success(`${models.find((x) => x.id === id)?.label} ${tr("is now the default")}`);
  };

  const addCustom = () => {
    const id = custom.trim();
    if (!id) return;
    if (models.some((m) => m.id === id)) return toast.error(tr("That model is already listed"));
    if (live) return void addModel(vendor, id).then((ok) => ok && setCustom(""));
    setModels([...models, { id, label: id, tier: "balanced", enabled: true, custom: true }]);
    act("Added AI model", vendorLabel(vendor), id);
    setCustom("");
  };

  return (
    <>
      <PageHeader title="AI models" description="Choose which providers and models every business can use in its AI assistants. You add the API keys here and pay the provider; businesses are charged per reply from their wallet." />

      <Panel title="Provider" bodyClassName="p-5">
        <ProviderCards
          vendors={VENDORS.map((v) => v.id)}
          value={vendor}
          onChange={(v) => {
            setVendor(v);
            setKey("");
            setFocus(undefined);
          }}
          badge={(v) => {
            const p = state.providers[v];
            return (
              <span className={cn("text-xs font-medium", p.enabled ? "text-emerald-800 dark:text-emerald-300" : "text-muted-foreground")}>
                {p.enabled ? tr("On") : tr("Off")}
                {p.keyTail ? "" : ` · ${tr("No key yet")}`}
              </span>
            );
          }}
        />
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Panel title={`${vendorLabel(vendor)} ${tr("access")}`} bodyClassName="space-y-4 p-5">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
            <div>
              <p className="text-sm font-medium text-foreground">{tr("Offer to businesses")}</p>
              <p className="text-xs text-muted-foreground">{ready ? `${tr("Key saved, ends")} ${provider.keyTail}` : tr("No key yet")}</p>
            </div>
            <Switch checked={provider.enabled} onCheckedChange={toggleProvider} aria-label={`${tr("Offer")} ${vendorLabel(vendor)}`} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="prov-key">{tr("API key")}</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="prov-key"
                  type={show ? "text" : "password"}
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder={ready ? `•••• ${provider.keyTail}` : VENDORS.find((v) => v.id === vendor)?.keyHint}
                  autoComplete="off"
                  className="pr-11"
                />
                <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? tr("Hide key") : tr("Show key")} className="absolute top-1/2 right-1 flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                  {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              <Button onClick={saveKey} disabled={!key.trim()} className="min-h-10">
                <KeyRound className="mr-1.5 size-4" /> {tr("Save")}
              </Button>
            </div>
          </div>
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            {tr("Businesses never see or enter an API key. Only the last four characters of a key are shown after saving.")}
          </p>
        </Panel>

        <Panel title="Models" description="Tap a model to switch it on or off for businesses. The star marks the default." bodyClassName="space-y-4 p-5">
          <ModelChips
            models={models.map((m) => ({ id: m.id, label: m.label, on: m.enabled }))}
            value={focused?.id}
            onChange={toggleModel}
            chipExtra={(id) => {
              const m = models.find((x) => x.id === id);
              const isDefault = defaultHere === id;
              return (
                <span className="inline-flex items-center gap-1 pr-1.5">
                  <span className={cn("rounded-full px-1.5 py-0.5 text-[11px] font-bold", m?.enabled ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300" : "bg-foreground/10 text-muted-foreground")}>
                    {m?.enabled ? tr("On") : tr("Off")}
                  </span>
                  <button
                    type="button"
                    aria-label={`${tr("Make default")}: ${m?.label}`}
                    aria-pressed={isDefault}
                    onClick={() => makeDefault(id)}
                    className="flex size-8 items-center justify-center rounded-full hover:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <Star className={cn("size-3.5", isDefault ? "fill-amber-500 text-amber-500" : "text-muted-foreground")} />
                  </button>
                </span>
              );
            }}
          />
          {focused && <TipBox>{tr(TIER_TIP[focused.tier])}</TipBox>}
          <div className="flex gap-2">
            <Input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder={tr("Add a model by its name or id")} aria-label={tr("Add a model by its name or id")} onKeyDown={(e) => e.key === "Enter" && addCustom()} />
            <Button variant="outline" onClick={addCustom} disabled={!custom.trim()} className="min-h-10">
              <Plus className="mr-1.5 size-4" /> {tr("Add model")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {tr("Default model")}: <strong className="text-foreground">{vendorLabel(state.defaultChoice.vendor)} · {state.models[state.defaultChoice.vendor].find((m) => m.id === state.defaultChoice.model)?.label}</strong>
          </p>
        </Panel>
      </div>
    </>
  );
}
