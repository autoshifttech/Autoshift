"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {  } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { backend, backendUrl, BackendError } from "@/lib/backend/client";
import { BUSINESS_TYPES, OPTIONAL_PAGES, type BusinessType, type OptionalPage } from "@/lib/workspace/pages";
import { PAGE_LABEL_KEY } from "./business-pages";
import { TickBox } from "@/components/ui/tick-box";
import { ListSkeleton } from "@/components/ui/skeleton";

type Defaults = Record<BusinessType, OptionalPage[]>;

/** Admin → Settings: the pages each business type starts with. Changes new businesses only. */
export function PageDefaultsPanel() {
  const t = useTranslations("AdminPages");
  const ts = useTranslations("Sidebar");
  const to = useTranslations("Onboarding");
  const [d, setD] = useState<Defaults | null>(null);
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(!backendUrl());

  useEffect(() => {
    if (!backendUrl()) return;
    backend<{ defaults: Defaults }>("/v1/platform/page-defaults")
      .then((r) => {
        setD(r.defaults);
        setSaved(JSON.stringify(r.defaults));
      })
      .catch(() => setHidden(true));
  }, []);

  if (hidden) return null;
  if (!d) return <ListSkeleton rows={3} compact label={t("loading")} className="px-0" />;

  const flip = (kind: BusinessType, p: OptionalPage) =>
    setD({ ...d, [kind]: OPTIONAL_PAGES.filter((x) => (x === p ? !d[kind].includes(p) : d[kind].includes(x))) });

  const save = async () => {
    setBusy(true);
    try {
      const r = await backend<{ defaults: Defaults }>("/v1/platform/page-defaults", { method: "PUT", body: { defaults: d } });
      setD(r.defaults);
      setSaved(JSON.stringify(r.defaults));
      toast.success(t("defaultsSaved"));
    } catch (e) {
      toast.error(e instanceof BackendError ? e.message : t("saveFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-5" aria-labelledby="page-defaults-title">
      <h2 id="page-defaults-title" className="text-base font-semibold text-foreground">{t("defaultsTitle")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("defaultsDesc")}</p>
      <div className="mt-4 overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[720px] text-sm">
          <caption className="sr-only">{t("defaultsTitle")}</caption>
          <thead>
            <tr className="bg-muted/50 text-left">
              <th scope="col" className="px-3 py-2 font-medium text-foreground">{t("type")}</th>
              {OPTIONAL_PAGES.map((p) => (
                <th key={p} scope="col" className="px-2 py-2 text-center text-xs font-medium text-muted-foreground">{ts(PAGE_LABEL_KEY[p])}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {BUSINESS_TYPES.map((k) => (
              <tr key={k}>
                <th scope="row" className="px-3 py-2 text-left font-medium text-foreground">{to(`industry_${k}`)}</th>
                {OPTIONAL_PAGES.map((p) => (
                  <td key={p} className="px-2 py-1 text-center">
                    <label className="inline-flex size-11 cursor-pointer items-center justify-center">
                      <TickBox
                        checked={d[k].includes(p)}
                        onChange={() => flip(k, p)}
                        aria-label={t("cellLabel", { type: to(`industry_${k}`), page: ts(PAGE_LABEL_KEY[p]) })}
                      />
                    </label>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button className="min-h-11" disabled={busy || JSON.stringify(d) === saved} onClick={() => void save()}>{busy ? t("saving") : t("save")}</Button>
        <p className="text-xs text-muted-foreground">{t("defaultsNote")}</p>
      </div>
    </section>
  );
}
