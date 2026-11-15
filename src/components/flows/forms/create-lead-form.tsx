"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { NativeSelect } from "@/components/ui/native-select";
import { createClient } from "@/lib/supabase/client";
import type { BuilderNode } from "../shared";
import { NextNodeRow, TextRow } from "./fields";

export interface CreateLeadCfg {
  pipeline_id?: string;
  stage_id?: string;
  title?: string;
  value?: string;
  notes?: string;
  next_node_key?: string;
}

interface Pipeline {
  id: string;
  name: string;
  stages: { id: string; name: string }[];
}

/** The business's pipelines and their stages (RLS keeps it to this account). */
function usePipelines(): Pipeline[] {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  useEffect(() => {
    let live = true;
    (async () => {
      const sb = createClient();
      const { data: pipes } = await sb.from("pipelines").select("id, name").order("created_at", { ascending: true });
      const ids = (pipes ?? []).map((p) => p.id);
      const { data: stages } = ids.length
        ? await sb.from("pipeline_stages").select("id, name, position, pipeline_id").in("pipeline_id", ids).order("position", { ascending: true })
        : { data: [] as { id: string; name: string; pipeline_id: string }[] };
      if (!live) return;
      setPipelines((pipes ?? []).map((p) => ({ id: p.id, name: p.name, stages: (stages ?? []).filter((s) => s.pipeline_id === p.id).map((s) => ({ id: s.id, name: s.name })) })));
    })().catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return pipelines;
}

/**
 * Create lead: puts a lead on the Leads page for the contact in this chat. Empty pipeline/stage =
 * the first pipeline and its first stage (a "Sales" pipeline is made if there is none).
 */
export function CreateLeadForm({
  cfg,
  allNodes,
  currentKey,
  onUpdateConfig,
}: {
  cfg: CreateLeadCfg;
  allNodes: BuilderNode[];
  currentKey: string;
  onUpdateConfig: (patch: Record<string, unknown>) => void;
}) {
  const t = useTranslations("Flows.builder.form.lead");
  const pipelines = usePipelines();
  const pipeline = pipelines.find((p) => p.id === cfg.pipeline_id) ?? null;

  return (
    <>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <label htmlFor="lead-pipeline" className="mb-1 block text-xs text-muted-foreground">
            {t("pipeline")}
          </label>
          <NativeSelect id="lead-pipeline" value={cfg.pipeline_id ?? ""} onChange={(e) => onUpdateConfig({ pipeline_id: e.target.value, stage_id: "" })} className="bg-muted">
            <option value="">{t("firstPipeline")}</option>
            {pipelines.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div>
          <label htmlFor="lead-stage" className="mb-1 block text-xs text-muted-foreground">
            {t("stage")}
          </label>
          <NativeSelect id="lead-stage" value={cfg.stage_id ?? ""} disabled={!pipeline} onChange={(e) => onUpdateConfig({ stage_id: e.target.value })} className="bg-muted">
            <option value="">{t("firstStage")}</option>
            {(pipeline?.stages ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
      <TextRow label={t("title")} value={cfg.title ?? ""} onChange={(v) => onUpdateConfig({ title: v })} />
      <TextRow label={t("value")} value={cfg.value ?? ""} onChange={(v) => onUpdateConfig({ value: v })} />
      <TextRow label={t("notes")} value={cfg.notes ?? ""} onChange={(v) => onUpdateConfig({ notes: v })} rows={3} />
      <p className="text-xs text-muted-foreground">{t.raw("help") as string}</p>
      <NextNodeRow value={cfg.next_node_key ?? ""} allNodes={allNodes} currentKey={currentKey} onChange={(v) => onUpdateConfig({ next_node_key: v })} label={t("then")} />
    </>
  );
}
