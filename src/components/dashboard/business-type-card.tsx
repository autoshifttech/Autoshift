"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { LayoutGrid, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { useAuth } from "@/hooks/use-auth";
import { BackendError, backendUrl } from "@/lib/backend/client";
import { BUSINESS_TYPES, SHOP_SOURCES, chooseBusinessType, isShopType, usePages, type BusinessType, type ShopSource } from "@/lib/workspace/pages";

const DISMISS_KEY = "autoshift.type-card.dismissed";

/**
 * For businesses that never said what they use AutoShift for (signed up before the question existed,
 * or skipped onboarding). Nothing changes until they answer; then the menu shows that type's pages.
 */
export function BusinessTypeCard() {
  const t = useTranslations("BusinessType");
  const to = useTranslations("Onboarding");
  const pages = usePages();
  const { canEditSettings } = useAuth();
  const [kind, setKind] = useState<BusinessType | null>(null);
  const [source, setSource] = useState<ShopSource>("whatsapp");
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(() => {
    try {
      return typeof window !== "undefined" && window.localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });

  if (!pages.loaded || pages.businessType || !canEditSettings || hidden || !backendUrl()) return null;

  const dismiss = () => {
    setHidden(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Storage blocked: it comes back next visit, which is fine.
    }
  };

  const save = async () => {
    if (!kind) return;
    setBusy(true);
    try {
      await chooseBusinessType(kind, isShopType(kind) ? source : null);
      toast.success(t("saved"));
    } catch (e) {
      toast.error(e instanceof BackendError ? e.message : t("failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="business-type-title" className="relative rounded-2xl border border-primary/30 bg-card p-5 shadow-[var(--shadow-card)]">
      <button type="button" onClick={dismiss} aria-label={t("later")} className="absolute top-2 right-2 flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
        <X className="size-4" />
      </button>
      <div className="flex items-start gap-3 pr-10">
        <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <LayoutGrid className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 id="business-type-title" className="font-semibold text-foreground">
            {t("title")}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{t("help")}</p>
        </div>
      </div>
      <div role="radiogroup" aria-labelledby="business-type-title" className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {BUSINESS_TYPES.map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={kind === id}
            onClick={() => setKind(id)}
            className={cn("min-h-11 rounded-xl border px-3 py-2 text-left text-sm transition-colors", kind === id ? "border-primary bg-primary/5 font-medium text-primary" : "border-border text-foreground hover:bg-muted")}
          >
            {to(`industry_${id}`)}
          </button>
        ))}
      </div>
      {kind && isShopType(kind) && (
        <div className="mt-4">
          <p id="business-type-source" className="mb-2 text-sm font-medium text-foreground">
            {to("shopSourceQ")}
          </p>
          <div role="radiogroup" aria-labelledby="business-type-source" className="grid gap-2 sm:grid-cols-3">
            {SHOP_SOURCES.map((id) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={source === id}
                onClick={() => setSource(id)}
                className={cn("min-h-11 rounded-xl border px-3 py-2 text-left text-sm", source === id ? "border-primary bg-primary/5 font-medium text-primary" : "border-border text-foreground hover:bg-muted")}
              >
                {to(`shopSource_${id}`)}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button className="min-h-11" disabled={!kind || busy} onClick={() => void save()}>
          {busy ? t("saving") : t("save")}
        </Button>
        <p className="text-xs text-muted-foreground">{t("note")}</p>
      </div>
    </section>
  );
}
