"use client";

import { useTranslations } from "next-intl";

import { ModelChips, ProviderCards, TipBox } from "@/components/ai/model-picker";
import { availableChoices, tierOf, useAiModels } from "@/lib/admin/ai-models";
import { vendorLabel, type VendorId } from "@/lib/ai/catalog";
import type { Assistant } from "@/lib/assistants/model";

/** Pick the provider and model that power an assistant, from what the admin has switched on. */
export function AssistantModelPicker({ a, set }: { a: Assistant; set: (p: Partial<Assistant>) => void }) {
  const t = useTranslations("Assistants");
  const state = useAiModels();
  const choices = availableChoices(state);

  if (choices.length === 0) {
    return <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">{t("pickerNone")}</p>;
  }

  const vendor: VendorId = choices.some((c) => c.vendor === a.provider) ? (a.provider as VendorId) : choices[0].vendor;
  const models = choices.find((c) => c.vendor === vendor)!.models;
  const modelId = (models.find((m) => m.id === a.modelId) ?? models[0]).id;
  const tier = tierOf(state, vendor, modelId);

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">{t("pickerProvider")}</p>
        <ProviderCards
          vendors={choices.map((c) => c.vendor)}
          value={vendor}
          onChange={(v) => set({ provider: v, modelId: choices.find((c) => c.vendor === v)!.models[0].id })}
        />
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">{t("pickerModel")}</p>
        <ModelChips models={models} value={modelId} onChange={(id) => set({ provider: vendor, modelId: id })} />
      </div>
      <TipBox>
        {tier === "newest" ? t("tier_newest", { vendor: vendorLabel(vendor) }) : t(`tier_${tier}`)}
      </TipBox>
    </div>
  );
}
