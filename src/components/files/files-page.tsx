"use client";

import { EmptyPanel } from "@/components/ui/empty-panel";
import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Copy, FileText, Film, Image as ImageIcon, Paperclip, Search, Trash2, Upload, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { FILE_KINDS, MAX_SIZE, STORAGE_LIMIT, filesStore, formatSize, kindOf, useFiles, type FileKind, type LibraryFile } from "@/lib/files/model";

const KIND_ICON: Record<FileKind, LucideIcon> = { image: ImageIcon, pdf: FileText, video: Film, other: Paperclip };

function Thumb({ file, className }: { file: LibraryFile; className?: string }) {
  const Icon = KIND_ICON[file.kind];
  if (file.url && file.kind === "image") {
    // eslint-disable-next-line @next/next/no-img-element -- a local object URL from the user's upload
    return <img src={file.url} alt="" className={cn("h-full w-full object-cover", className)} />;
  }
  return (
    <div className={cn("flex h-full w-full items-center justify-center", className)} style={{ background: `linear-gradient(135deg, ${file.tint}26, ${file.tint}55)` }}>
      <Icon className="size-10" style={{ color: file.tint }} />
    </div>
  );
}

export function FilesPage() {
  const t = useTranslations("Files");
  const locale = useLocale();
  const files = useFiles();
  const input = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<FileKind | "all">("all");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const used = files.reduce((s, f) => s + f.size, 0);
  const shown = files.filter((f) => (kind === "all" || f.kind === kind) && f.name.toLowerCase().includes(query.trim().toLowerCase()));
  const open = files.find((f) => f.id === openId) ?? null;

  const add = (list: FileList | null) => {
    if (!list) return;
    const accepted: LibraryFile[] = [];
    for (const file of Array.from(list)) {
      const k = kindOf(file);
      if (file.size > MAX_SIZE[k]) {
        toast.error(t("tooBig", { name: file.name, max: formatSize(MAX_SIZE[k], locale) }));
        continue;
      }
      accepted.push({ id: `f-${Date.now()}-${accepted.length}`, name: file.name, kind: k, size: file.size, tint: "#1E4C41", url: URL.createObjectURL(file), usedIn: [], uploadedAt: new Date().toISOString() });
    }
    if (accepted.length) {
      filesStore.set((s) => ({ files: [...accepted, ...s.files] }));
      toast.success(t("uploaded", { count: accepted.length }));
    }
  };

  return (
    <div
      className="space-y-5"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        add(e.dataTransfer.files);
      }}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="sr-only">{t("title")}</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <Button onClick={() => input.current?.click()} className="gap-1.5 self-start">
          <Upload className="size-4" />
          {t("upload")}
        </Button>
        <input ref={input} type="file" multiple className="hidden" accept="image/*,application/pdf,video/mp4,.doc,.docx,.xls,.xlsx" onChange={(e) => add(e.target.files)} />
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)] sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex justify-between text-sm">
            <span className="text-foreground">{t("storage")}</span>
            <span className="text-muted-foreground">{t("storageUsed", { used: formatSize(used, locale), total: formatSize(STORAGE_LIMIT, locale) })}</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(1, (used / STORAGE_LIMIT) * 100)}%` }} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground sm:max-w-xs">{t("limits")}</p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" value={query} placeholder={t("search")} aria-label={t("search")} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(["all", ...FILE_KINDS] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
              className={cn("rounded-full border px-3 py-1 text-xs font-medium", kind === k ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted")}
            >
              {t(`kind_${k}`)}
            </button>
          ))}
        </div>
      </div>

      <div className={cn("grid grid-cols-2 gap-4 rounded-2xl transition-colors sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5", dragging && "bg-primary/5 ring-2 ring-primary/40 ring-dashed")}>
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="flex aspect-[4/5] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border p-4 text-center text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
        >
          <Upload className="size-6" />
          {t("dropHere")}
        </button>
        {shown.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setOpenId(f.id)}
            className="group flex aspect-[4/5] flex-col overflow-hidden rounded-2xl border border-border bg-card text-left shadow-[var(--shadow-card)] transition-colors hover:border-primary/40"
          >
            <div className="min-h-0 flex-1 overflow-hidden">
              <Thumb file={f} className="transition-transform group-hover:scale-[1.03]" />
            </div>
            <div className="p-3">
              <p className="truncate text-sm font-medium text-foreground">{f.name}</p>
              <p className="text-xs text-muted-foreground">
                {formatSize(f.size, locale)} · {f.usedIn.length ? t("usedCount", { count: f.usedIn.length }) : t("notUsed")}
              </p>
            </div>
          </button>
        ))}
      </div>
      {shown.length === 0 && <EmptyPanel icon={FileText} title={t("empty")} />}

      <Sheet open={!!open} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          {open && (
            <>
              <SheetHeader>
                <SheetTitle className="pr-6 break-all">{open.name}</SheetTitle>
                <SheetDescription>
                  {t(`kind_${open.kind}`)} · {formatSize(open.size, locale)} · {new Date(open.uploadedAt).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })}
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-5 px-4 pb-6">
                <div className="aspect-video overflow-hidden rounded-xl border border-border">
                  <Thumb file={open} />
                </div>
                <div className="grid gap-1.5">
                  <label htmlFor="file-name" className="text-xs text-muted-foreground">
                    {t("rename")}
                  </label>
                  <Input id="file-name" value={open.name} onChange={(e) => filesStore.set((s) => ({ files: s.files.map((x) => (x.id === open.id ? { ...x, name: e.target.value } : x)) }))} />
                </div>
                <section>
                  <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t("usedIn")}</p>
                  {open.usedIn.length === 0 ? (
                    <p className="mt-1 text-sm text-muted-foreground">{t("notUsedLong")}</p>
                  ) : (
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {open.usedIn.map((u) => (
                        <li key={u} className="rounded-full bg-muted px-2.5 py-1 text-xs text-foreground">
                          {u}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    className="gap-1.5"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(open.url ?? `https://files.autoshift.app/demo/${encodeURIComponent(open.name)}`);
                        toast.success(t("copied"));
                      } catch {
                        toast.error(t("copyFailed"));
                      }
                    }}
                  >
                    <Copy className="size-4" />
                    {t("copyLink")}
                  </Button>
                  <Button
                    variant="outline"
                    className="gap-1.5 text-destructive hover:text-destructive"
                    onClick={() => {
                      filesStore.set((s) => ({ files: s.files.filter((x) => x.id !== open.id) }));
                      setOpenId(null);
                      toast.success(t("deleted"));
                    }}
                  >
                    <Trash2 className="size-4" />
                    {t("delete")}
                  </Button>
                </div>
                {open.usedIn.length > 0 && <p className="text-xs text-muted-foreground">{t("deleteWarning")}</p>}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
