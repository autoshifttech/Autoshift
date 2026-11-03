"use client";

/**
 * The "Use a connection" step: pick a service, one of the accounts connected
 * under Flows → Connections, and fill in the service's few fields.
 */

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Link2 } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ACTION_SERVICES, ACTION_SERVICE_IDS, isActionService, type ActionService } from "@/lib/flows/actions";
import { useConnections } from "@/lib/flows/connections";
import { ConnectionLogo } from "../connection-logos";
import type { BuilderNode } from "../shared";
import { NextNodeRow } from "./fields";

export interface ActionCfg {
  service?: string;
  connection_id?: string;
  params?: Record<string, string>;
  save_as?: string;
  next_node_key?: string;
}

const label = "mb-1 block text-xs text-muted-foreground";

export function ActionForm({
  cfg,
  allNodes,
  currentKey,
  onUpdateConfig,
}: {
  cfg: ActionCfg;
  allNodes: BuilderNode[];
  currentKey: string;
  onUpdateConfig: (patch: Record<string, unknown>) => void;
}) {
  const t = useTranslations("Flows.builder.action");
  const tForm = useTranslations("Flows.builder.form");
  const connections = useConnections();

  const service: ActionService = isActionService(cfg.service) ? cfg.service : "google_sheets_append";
  const def = ACTION_SERVICES[service];
  const options = connections.filter((c) => c.kind === def.kind);
  const params = cfg.params ?? {};
  const selected = options.find((c) => c.id === cfg.connection_id);

  const setParam = (key: string, value: string) => onUpdateConfig({ params: { ...params, [key]: value } });

  return (
    <>
      <div>
        <label className={label}>{t("serviceLabel")}</label>
        <Select
          value={service}
          onValueChange={(v) => {
            const next = v as ActionService;
            // A different kind of account can't be reused, so clear the pick.
            const keep = ACTION_SERVICES[next].kind === def.kind;
            onUpdateConfig({ service: next, params: {}, connection_id: keep ? cfg.connection_id ?? "" : "", save_as: "" });
          }}
        >
          <SelectTrigger className="bg-muted">
            <SelectValue>{t(`service.${service}`)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {ACTION_SERVICE_IDS.map((id) => (
              <SelectItem key={id} value={id}>
                {t(`service.${id}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <label className={label}>{t("accountLabel")}</label>
        {options.length > 0 ? (
          <Select value={cfg.connection_id ?? ""} onValueChange={(v) => onUpdateConfig({ connection_id: v })}>
            <SelectTrigger className="bg-muted" aria-label={t("accountLabel")}>
              {selected ? (
                <span className="flex min-w-0 items-center gap-2">
                  <ConnectionLogo kind={selected.kind} className="size-4 shrink-0" />
                  <span className="truncate">{selected.name}</span>
                </span>
              ) : (
                <SelectValue placeholder={t("pickAccount")} />
              )}
            </SelectTrigger>
            <SelectContent>
              {options.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="rounded-lg border border-dashed border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            {t(`noAccount.${def.kind}`)}{" "}
            <Link href="/flows/connections" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
              <Link2 className="size-3.5" aria-hidden /> {t("openConnections")}
            </Link>
          </p>
        )}
      </div>

      {def.fields.map((f) => (
        <div key={f.key}>
          <label className={label}>{t(`field.${f.key}`)}</label>
          {f.multiline ? (
            <Textarea rows={4} value={params[f.key] ?? ""} placeholder={f.placeholder} onChange={(e) => setParam(f.key, e.target.value)} className="bg-muted font-mono text-xs" />
          ) : (
            <Input value={params[f.key] ?? ""} placeholder={f.placeholder} onChange={(e) => setParam(f.key, e.target.value)} className="bg-muted" />
          )}
          {f.key === "values" && <p className="mt-1 text-xs text-muted-foreground">{t("valuesHint")}</p>}
        </div>
      ))}

      {def.savesLink && (
        <div>
          <label className={label}>{t("saveAs")}</label>
          <Input
            value={cfg.save_as ?? ""}
            onChange={(e) => onUpdateConfig({ save_as: e.target.value.replace(/[^a-zA-Z0-9_]/g, "") })}
            placeholder={service === "google_calendar_event" ? "event_link" : "payment_link"}
            className="bg-muted font-mono text-xs"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {t("saveAsHint")} <code className="rounded bg-muted px-1">{"{{vars." + (cfg.save_as || (service === "google_calendar_event" ? "event_link" : "payment_link")) + "}}"}</code>
          </p>
        </div>
      )}

      <NextNodeRow
        value={cfg.next_node_key ?? ""}
        allNodes={allNodes}
        currentKey={currentKey}
        onChange={(v) => onUpdateConfig({ next_node_key: v })}
        label={tForm("thenAdvanceTo")}
      />
    </>
  );
}
