"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { CheckCircle2, FileUp, Loader2, PackageSearch } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { importCatalog, importCatalogBlob, useCatalog, type ImportSummary } from "@/lib/catalog";

/**
 * On an Excel or CSV file: make it the business's product list. The file is checked first
 * (how many products, which columns, which rows were skipped) and only saved after "Use it".
 */
export function ProductListPanel({ file }: { file?: { name: string; url: string } }) {
  const t = useTranslations("ProductList");
  const locale = useLocale();
  const { catalog } = useCatalog();
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<ImportSummary | null>(null);
  const [error, setError] = useState("");
  // Without a stored file: the person picks one on their device and it goes straight to AutoShift.
  const [picked, setPicked] = useState<File | null>(null);
  const pick = useRef<HTMLInputElement>(null);
  const name = file?.name ?? picked?.name ?? "";
  const isCurrent = Boolean(name) && catalog?.file_name === name;

  const run = async (dryRun: boolean, chosen: File | null = picked) => {
    setBusy(true);
    setError("");
    try {
      const summary = file ? await importCatalog(file, dryRun) : await importCatalogBlob({ name: chosen!.name, blob: chosen! }, dryRun);
      if (dryRun) setPreview(summary);
      else {
        setPreview(null);
        setPicked(null);
        toast.success(t("saved", { count: summary.count }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <PackageSearch className="size-4 text-primary" aria-hidden /> {t("title")}
      </p>
      {!file && catalog && !preview && (
        <p className="mt-2 flex items-start gap-2 text-sm text-foreground">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <span>{t("currentNamed", { name: catalog.file_name, count: catalog.products.length, date: new Date(catalog.updated_at).toLocaleDateString(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) })}</span>
        </p>
      )}
      {!file ? null : isCurrent && catalog ? (
        <p className="mt-2 flex items-start gap-2 text-sm text-foreground">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <span>{t("current", { count: catalog.products.length, date: new Date(catalog.updated_at).toLocaleDateString(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) })}</span>
        </p>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">{catalog ? t("replaceHint", { name: catalog.file_name }) : t("hint")}</p>
      )}

      {preview ? (
        <div className="mt-3 space-y-3" aria-live="polite">
          <div className="rounded-xl bg-muted/60 p-3 text-sm">
            <p className="font-medium text-foreground">{t("found", { count: preview.count })}</p>
            {preview.columns.length > 0 && <p className="mt-1 text-xs text-muted-foreground">{t("extraColumns", { columns: preview.columns.join(", ") })}</p>}
            {preview.skipped_rows.length > 0 && <p className="mt-1 text-xs text-rose-800 dark:text-rose-300">{t("skipped", { rows: preview.skipped_rows.slice(0, 10).join(", ") })}</p>}
            <ul className="mt-2 space-y-1 text-xs text-foreground">
              {preview.sample.map((p) => (
                <li key={p.code} className="truncate">
                  {p.code} · {p.name} · ₹{p.price.toLocaleString("en-IN")}
                </li>
              ))}
            </ul>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" className="min-h-11" disabled={busy} onClick={() => setPreview(null)}>
              {t("cancel")}
            </Button>
            <Button className="min-h-11 gap-1.5" disabled={busy} onClick={() => void run(false)}>
              {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {t("useIt")}
            </Button>
          </div>
        </div>
      ) : file ? (
        <Button variant={isCurrent ? "outline" : "default"} className="mt-3 min-h-11 w-full gap-1.5" disabled={busy} onClick={() => void run(true)}>
          {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {isCurrent ? t("update") : t("use")}
        </Button>
      ) : (
        <>
          <Button className="mt-3 min-h-11 w-full gap-1.5" disabled={busy} onClick={() => pick.current?.click()}>
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <FileUp className="size-4" aria-hidden />}
            {catalog ? t("importNew") : t("import")}
          </Button>
          {/* No accept filter: some phones hide spreadsheets behind one. The server checks the file. */}
          <input
            ref={pick}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              e.target.value = "";
              if (!f) return;
              setPicked(f);
              void run(true, f);
            }}
          />
        </>
      )}
      {error && (
        <p className="mt-2 rounded-lg bg-destructive/10 p-2 text-sm text-rose-800 dark:text-rose-300" role="alert">
          {error}
        </p>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        {t("format")}{" "}
        <Link href="/agents" className="font-medium text-primary hover:underline">
          {t("toAssistant")}
        </Link>
      </p>
    </section>
  );
}
