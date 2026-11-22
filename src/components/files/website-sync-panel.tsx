"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle, Globe, Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/lib/toast";
import { BackendError } from "@/lib/backend/client";
import { setFeed, stopFeed, syncFeed, useCatalog } from "@/lib/catalog";

/**
 * Files → Product list → "Sync from your website": a feed link (CSV, Excel or JSON on the business's
 * website) that AutoShift re-reads every hour. Their web developer can also send products by API.
 */
export function WebsiteSyncPanel() {
  const t = useTranslations("WebsiteSync");
  const locale = useLocale();
  const { catalog } = useCatalog();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<"connect" | "sync" | "stop" | null>(null);
  const [error, setError] = useState("");
  const linked = catalog?.feed_url;

  const run = async (kind: "connect" | "sync" | "stop") => {
    setBusy(kind);
    setError("");
    try {
      if (kind === "connect") {
        const s = await setFeed(url);
        toast.success(t("connected", { count: s.count }));
        setUrl("");
      } else if (kind === "sync") {
        const s = await syncFeed();
        toast.success(t("synced", { count: s.count }));
      } else {
        await stopFeed();
        toast.success(t("stopped"));
      }
    } catch (e) {
      setError(e instanceof BackendError ? e.message : t("failed"));
    } finally {
      setBusy(null);
    }
  };

  const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

  return (
    <section className="mt-4 rounded-xl border border-border p-4" aria-labelledby="website-sync-title">
      <h3 id="website-sync-title" className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Globe className="size-4 text-primary" aria-hidden /> {t("title")}
      </h3>
      {linked ? (
        <div className="mt-2 space-y-2 text-sm">
          <p className="text-foreground">
            {t("linkedTo")} <span className="break-all font-medium">{linked}</span>
          </p>
          <p className="text-xs text-muted-foreground">{t("lastSync", { when: when(catalog?.feed_synced_at) })}</p>
          {catalog?.feed_error && (
            <p role="alert" className="flex items-start gap-2 rounded-lg bg-amber-100 p-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {t("lastError", { error: catalog.feed_error })}
            </p>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button className="min-h-11 gap-1.5" disabled={!!busy} onClick={() => void run("sync")}>
              {busy === "sync" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />}
              {t("syncNow")}
            </Button>
            <Button variant="ghost" className="min-h-11" disabled={!!busy} onClick={() => void run("stop")}>
              {t("stop")}
            </Button>
          </div>
        </div>
      ) : (
        <form
          className="mt-2 grid gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            void run("connect");
          }}
        >
          <p className="text-xs text-muted-foreground">{t("help")}</p>
          <Label htmlFor="feed-url" className="mt-1">{t("urlLabel")}</Label>
          <Input id="feed-url" type="url" inputMode="url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://yourshop.com/products.csv" className="min-h-11" />
          <Button type="submit" className="mt-1 min-h-11 w-full gap-1.5 px-5 sm:w-auto sm:justify-self-start" disabled={!!busy || !url.trim()}>
            {busy === "connect" && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {t("connect")}
          </Button>
        </form>
      )}
      {error && (
        <p role="alert" className="mt-2 rounded-lg bg-destructive/10 p-2 text-sm text-rose-800 dark:text-rose-300">
          {error}
        </p>
      )}
      <p className="mt-3 text-xs text-muted-foreground">{t("apiNote")}</p>
    </section>
  );
}
