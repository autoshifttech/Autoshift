"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/toast";
import {
  MAX_STAGES,
  NAME_MAX,
  PIPELINE_PRESETS,
  checkPipeline,
  createPipeline,
  deletePipeline,
  savePipeline,
  usePipelines,
  type Pipeline,
  type StageDraft,
} from "@/lib/leads/pipelines";

type Editing = { pipeline: Pipeline | null } | null;

/**
 * Pipelines on the Leads page: see each pipeline's stages and how many leads sit in each,
 * create one (from a ready-made list such as Orders), rename, reorder, add or remove stages.
 */
export function PipelinesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useTranslations("Pipelines");
  const { pipelines, loaded } = usePipelines();
  const [editing, setEditing] = useState<Editing>(null);
  const [removing, setRemoving] = useState<Pipeline | null>(null);

  const close = (o: boolean) => {
    if (!o) setEditing(null);
    onOpenChange(o);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="max-h-[90vh] gap-4 overflow-y-auto rounded-3xl p-5 sm:max-w-lg sm:p-6">
          {editing ? (
            <PipelineEditor
              key={editing.pipeline?.id ?? "new"}
              pipeline={editing.pipeline}
              otherNames={pipelines.filter((p) => p.id !== editing.pipeline?.id).map((p) => p.name)}
              onDone={() => setEditing(null)}
            />
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>{t("title")}</DialogTitle>
                <DialogDescription>{t("desc")}</DialogDescription>
              </DialogHeader>
              {!loaded ? (
                <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" aria-hidden /> {t("loading")}
                </p>
              ) : pipelines.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{t("empty")}</p>
              ) : (
                <ul className="grid grid-cols-[minmax(0,1fr)] gap-3">
                  {pipelines.map((p) => {
                    const total = p.stages.reduce((n, s) => n + s.leads, 0);
                    return (
                      <li key={p.id} className="min-w-0 rounded-2xl border border-border bg-card p-4">
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold text-foreground">{p.name}</p>
                            <p className="text-xs text-muted-foreground">{t("summary", { stages: p.stages.length, leads: total })}</p>
                          </div>
                          <Button variant="ghost" size="icon" className="size-11 shrink-0" aria-label={t("edit", { name: p.name })} onClick={() => setEditing({ pipeline: p })}>
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-11 shrink-0 text-muted-foreground hover:text-destructive"
                            aria-label={t("delete", { name: p.name })}
                            onClick={() => (total > 0 ? toast.error(t("deleteHasLeads")) : setRemoving(p))}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                        <ol className="mt-3 flex flex-wrap gap-1.5" aria-label={t("stagesOf", { name: p.name })}>
                          {p.stages.map((s, i) => (
                            <li key={s.id} className="flex max-w-full items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs text-foreground">
                              <span className="text-muted-foreground">{i + 1}.</span>
                              <span className="truncate">{s.name}</span>
                              {s.leads > 0 && <span className="rounded-full bg-primary/10 px-1.5 font-semibold text-primary">{s.leads}</span>}
                            </li>
                          ))}
                        </ol>
                      </li>
                    );
                  })}
                </ul>
              )}
              <Button className="min-h-11 w-full gap-1.5" onClick={() => setEditing({ pipeline: null })}>
                <Plus className="size-4" /> {t("new")}
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={t("deleteTitle", { name: removing?.name ?? "" })}
        description={t("deleteDesc")}
        confirmLabel={t("deleteConfirm")}
        cancelLabel={t("cancel")}
        onConfirm={() => {
          const p = removing;
          setRemoving(null);
          if (p) deletePipeline(p).then(() => toast.success(t("deleted")), (e) => toast.error(e instanceof Error ? e.message : String(e)));
        }}
      />
    </>
  );
}

function PipelineEditor({ pipeline, otherNames, onDone }: { pipeline: Pipeline | null; otherNames: string[]; onDone: () => void }) {
  const t = useTranslations("Pipelines");
  const [name, setName] = useState(pipeline?.name ?? "");
  const presetStages = (k: keyof typeof PIPELINE_PRESETS) => t.raw(`presetStages_${k}`) as string[];
  const [stages, setStages] = useState<StageDraft[]>(pipeline ? pipeline.stages.map((s) => ({ id: s.id, name: s.name })) : presetStages("sales").map((n) => ({ name: n })));
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const leadsIn = (id?: string) => (id ? (pipeline?.stages.find((s) => s.id === id)?.leads ?? 0) : 0);
  const problems = checkPipeline(name, stages, otherNames);

  const setStage = (i: number, v: string) => setStages((all) => all.map((s, j) => (j === i ? { ...s, name: v } : s)));
  const move = (i: number, by: -1 | 1) =>
    setStages((all) => {
      const next = [...all];
      const j = i + by;
      if (j < 0 || j >= next.length) return all;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const save = async () => {
    setTried(true);
    if (problems.length) return;
    setBusy(true);
    try {
      if (pipeline) await savePipeline(pipeline, name, stages);
      else await createPipeline(name, stages.map((s) => s.name));
      toast.success(pipeline ? t("saved") : t("created", { name: name.trim() }));
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{pipeline ? t("editTitle") : t("newTitle")}</DialogTitle>
        <DialogDescription>{t("editDesc")}</DialogDescription>
      </DialogHeader>

      <div className="space-y-1.5">
        <label htmlFor="pipeline-name" className="text-sm font-medium text-foreground">
          {t("name")}
        </label>
        <Input id="pipeline-name" value={name} maxLength={NAME_MAX} onChange={(e) => setName(e.target.value)} placeholder={t("namePh")} className="min-h-11" aria-invalid={tried && problems.some((p) => p.startsWith("name"))} />
      </div>

      {!pipeline && (
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-foreground">{t("startFrom")}</p>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(PIPELINE_PRESETS) as (keyof typeof PIPELINE_PRESETS)[]).map((k) => (
              <Button
                key={k}
                type="button"
                variant="outline"
                size="sm"
                className="min-h-11 sm:min-h-9"
                onClick={() => {
                  setStages(presetStages(k).map((n) => ({ name: n })));
                  if (!name.trim()) setName(t(`preset_${k}`));
                }}
              >
                {t(`preset_${k}`)}
              </Button>
            ))}
          </div>
        </div>
      )}

      <fieldset className="space-y-2">
        <legend className="mb-1.5 text-sm font-medium text-foreground">{t("stages")}</legend>
        <ol className="space-y-2">
          {stages.map((s, i) => {
            const count = leadsIn(s.id);
            return (
              <li key={s.id ?? `new-${i}`} className="flex items-center gap-1.5">
                <span className="w-5 shrink-0 text-right text-xs text-muted-foreground" aria-hidden>
                  {i + 1}
                </span>
                <Input
                  value={s.name}
                  maxLength={NAME_MAX}
                  onChange={(e) => setStage(i, e.target.value)}
                  aria-label={t("stageN", { n: i + 1 })}
                  className="min-h-11 min-w-0 flex-1"
                  aria-invalid={tried && !s.name.trim()}
                />
                {count > 0 && (
                  <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary" title={t("leadsHere", { count })}>
                    {count}
                  </span>
                )}
                <Button type="button" variant="ghost" size="icon" className="size-11 shrink-0" disabled={i === 0} aria-label={t("moveUp", { name: s.name || i + 1 })} onClick={() => move(i, -1)}>
                  <ArrowUp className="size-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="size-11 shrink-0" disabled={i === stages.length - 1} aria-label={t("moveDown", { name: s.name || i + 1 })} onClick={() => move(i, 1)}>
                  <ArrowDown className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-11 shrink-0 text-muted-foreground hover:text-destructive"
                  disabled={count > 0 || stages.length === 1}
                  title={count > 0 ? t("cantRemove") : undefined}
                  aria-label={t("removeStage", { name: s.name || i + 1 })}
                  onClick={() => setStages((all) => all.filter((_, j) => j !== i))}
                >
                  <X className="size-4" />
                </Button>
              </li>
            );
          })}
        </ol>
        <Button type="button" variant="outline" className="min-h-11 w-full gap-1.5" disabled={stages.length >= MAX_STAGES} onClick={() => setStages((all) => [...all, { name: "" }])}>
          <Plus className="size-4" /> {t("addStage")}
        </Button>
        <p className="text-xs text-muted-foreground">{t("stagesHint")}</p>
      </fieldset>

      {tried && problems.length > 0 && (
        <ul className="space-y-1 rounded-xl bg-destructive/10 p-3 text-sm text-rose-800 dark:text-rose-300" role="alert">
          {problems.map((p) => (
            <li key={p}>{t(`problem_${p}`, { max: MAX_STAGES, chars: NAME_MAX })}</li>
          ))}
        </ul>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" className="min-h-11" onClick={onDone} disabled={busy}>
          {t("cancel")}
        </Button>
        <Button type="button" className="min-h-11 gap-1.5" onClick={() => void save()} disabled={busy}>
          {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {pipeline ? t("save") : t("create")}
        </Button>
      </div>
    </>
  );
}
