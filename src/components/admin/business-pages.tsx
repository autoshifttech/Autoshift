"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Lock, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { NativeSelect } from "@/components/ui/native-select";
import { toast } from "@/lib/toast";
import { backend, backendUrl, BackendError } from "@/lib/backend/client";
import { BUSINESS_TYPES, OPTIONAL_PAGES, SHOP_SOURCES, isShopType, type BusinessType, type OptionalPage, type ShopSource } from "@/lib/workspace/pages";

interface PagesInfo {
  business_type: BusinessType | null;
  shop_source: ShopSource | null;
  optional_on: OptionalPage[];
  all: boolean;
  defaults: Record<BusinessType, OptionalPage[]>;
}

export const PAGE_LABEL_KEY: Record<OptionalPage, string> = {
  leads: "leads", orders: "orders", insights: "insights", broadcasts: "broadcasts", templates: "templates",
  drips: "drips", segments: "segments", automations: "automations", flows: "flows", ai_tools: "aiTools",
};
const CORE_KEYS = ["dashboard", "inbox", "contacts", "aiAgents", "settings", "wallet"];

/**
 * Admin → a business → Pages: which pages this business gets. Starts from its business type;
 * any page can be switched on or off. Nothing is deleted when a page is switched off.
 */
export function BusinessPages({ businessId }: { businessId: string }) {
  const t = useTranslations("AdminPages");
  const ts = useTranslations("Sidebar");
  const to = useTranslations("Onboarding");
  const [info, setInfo] = useState<PagesInfo | null>(null);
  const [on, setOn] = useState<OptionalPage[]>([]);
  const [kind, setKind] = useState<BusinessType | "">("");
  const [source, setSource] = useState<ShopSource>("whatsapp");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const take = (i: PagesInfo) => {
    setInfo(i);
    setOn(i.optional_on);
    setKind(i.business_type ?? "");
    setSource(i.shop_source ?? "whatsapp");
  };

  useEffect(() => {
    if (!backendUrl()) return;
    backend<PagesInfo>(`/v1/platform/businesses/${businessId}/pages`)
      .then(take)
      .catch((e) => setError(e instanceof BackendError ? e.message : t("loadFailed")));
  }, [businessId, t]);

  if (!backendUrl()) return <p className="text-sm text-muted-foreground">{t("noBackend")}</p>;
  if (error) return <p role="alert" className="text-sm text-destructive">{error}</p>;
  if (!info) return <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden /> {t("loading")}</p>;

  const changed = info.all || on.join() !== info.optional_on.join() || (kind || null) !== info.business_type || (isShopType(kind) && source !== (info.shop_source ?? "whatsapp"));
  const toggle = (p: OptionalPage, value: boolean) => setOn((list) => OPTIONAL_PAGES.filter((x) => (x === p ? value : list.includes(x))));

  const run = async (call: () => Promise<PagesInfo>, done: string) => {
    setBusy(true);
    try {
      const out = await call();
      take({ ...out, defaults: info.defaults });
      toast.success(done);
    } catch (e) {
      toast.error(e instanceof BackendError ? e.message : t("saveFailed"));
    } finally {
      setBusy(false);
    }
  };
  const save = () =>
    run(() => backend<PagesInfo>(`/v1/platform/businesses/${businessId}/pages`, { method: "PUT", body: { pages: on, business_type: kind || null, shop_source: isShopType(kind) ? source : null } }), t("saved"));
  const reset = () =>
    run(() => backend<PagesInfo>(`/v1/platform/businesses/${businessId}/pages/reset`, { method: "POST", body: { business_type: kind || null } }), t("resetDone"));
  const allOn = () => run(() => backend<PagesInfo>(`/v1/platform/businesses/${businessId}/pages`, { method: "PUT", body: { pages: null } }), t("allDone"));

  return (
    <section className="space-y-5 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]" aria-labelledby="biz-pages-title">
      <div>
        <h2 id="biz-pages-title" className="text-base font-semibold text-foreground">{t("title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("desc")}</p>
        {info.all && <p className="mt-2 rounded-lg bg-muted/60 p-3 text-sm text-foreground">{t("allNow")}</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="biz-type">{t("type")}</Label>
          <NativeSelect id="biz-type" value={kind} onChange={(e) => setKind(e.target.value as BusinessType)}>
            <option value="">{t("typeNone")}</option>
            {BUSINESS_TYPES.map((k) => (
              <option key={k} value={k}>{to(`industry_${k}`)}</option>
            ))}
          </NativeSelect>
        </div>
        {isShopType(kind) && (
          <div className="grid gap-1.5">
            <Label htmlFor="biz-source">{t("source")}</Label>
            <NativeSelect id="biz-source" value={source} onChange={(e) => setSource(e.target.value as ShopSource)}>
              {SHOP_SOURCES.map((s) => (
                <option key={s} value={s}>{to(`shopSource_${s}`)}</option>
              ))}
            </NativeSelect>
          </div>
        )}
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-foreground">{t("pages")}</legend>
        <ul className="divide-y divide-border rounded-xl border border-border">
          {OPTIONAL_PAGES.map((p) => {
            const isDefault = kind ? (info.defaults[kind] ?? []).includes(p) : false;
            return (
              <li key={p} className="flex min-h-12 items-center justify-between gap-3 px-3 py-2">
                <label htmlFor={`pg-${p}`} className="min-w-0 flex-1 cursor-pointer">
                  <span className="block text-sm font-medium text-foreground">{ts(PAGE_LABEL_KEY[p])}</span>
                  <span className="block text-xs text-muted-foreground">
                    {t(`about_${p}`)}
                    {isDefault && <> · {t("inDefaults")}</>}
                  </span>
                </label>
                <Switch id={`pg-${p}`} checked={on.includes(p)} onCheckedChange={(v) => toggle(p, v)} />
              </li>
            );
          })}
        </ul>
      </fieldset>

      <div>
        <p className="mb-2 text-sm font-medium text-foreground">{t("alwaysOn")}</p>
        <div className="flex flex-wrap gap-2">
          {CORE_KEYS.map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs text-foreground">
              <Lock className="size-3" aria-hidden /> {ts(k)}
            </span>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        <Button className="min-h-11" disabled={busy || !changed} onClick={() => void save()}>{busy ? t("saving") : t("save")}</Button>
        <Button variant="outline" className="min-h-11 gap-1.5" disabled={busy || !kind} onClick={() => void reset()}>
          <RotateCcw className="size-4" aria-hidden /> {kind ? t("reset", { type: to(`industry_${kind}`) }) : t("resetNoType")}
        </Button>
        {!info.all && <Button variant="ghost" className="min-h-11" disabled={busy} onClick={() => void allOn()}>{t("allPages")}</Button>}
      </div>
      <p className="text-xs text-muted-foreground">{t("safe")}</p>
    </section>
  );
}
