"use client";

import { EmptyPanel } from "@/components/ui/empty-panel";
import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "@/lib/toast";
import { CheckCircle2, Circle, HardDrive, Copy, ExternalLink, FileText, Film, Image as ImageIcon, Paperclip, Search, Trash2, Upload, X, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import { FILE_KINDS, MAX_SIZE, MEDIA_BUCKET, STORAGE_LIMIT, deleteLiveFile, filesStore, formatSize, kindOf, loadLiveFiles, useFiles, type FileKind, type LibraryFile } from "@/lib/files/model";
import { uploadAccountMedia } from "@/lib/storage/upload-media";
import { UploadButton, type UploadPhase } from "@/components/motion/upload-button";
import { isLive } from "@/lib/workspace/live";
import { isCatalogFile } from "@/lib/catalog";
import { ProductListPanel } from "./product-list-panel";

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

/** The big preview in the file card: the image itself, a playable video, or the type icon. */
function Preview({ file }: { file: LibraryFile }) {
  if (file.url && file.kind === "image") {
    // eslint-disable-next-line @next/next/no-img-element -- the file's own storage URL
    return <img src={file.url} alt={file.name} className="max-h-[42vh] w-full bg-[repeating-conic-gradient(#0000_0_25%,#0000000a_0_50%)] bg-[length:16px_16px] object-contain" />;
  }
  if (file.url && file.kind === "video") {
    return <video src={file.url} controls playsInline preload="metadata" className="max-h-[42vh] w-full bg-black" />;
  }
  return (
    <div className="aspect-[16/9] w-full">
      <Thumb file={file} />
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
  // Select several files: long-press a tile on a phone (or Ctrl/Cmd-click),
  // then tap more and delete them together.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<string[] | null>(null);
  const press = useRef<{ timer: number; fired: boolean; x: number; y: number } | null>(null);
  const selecting = selected.size > 0;
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const removeFiles = (ids: string[]) => {
    filesStore.set((s) => ({ files: s.files.filter((x) => !ids.includes(x.id)) }));
    setSelected(new Set());
    setOpenId(null);
    if (!isLive()) {
      toast.success(t("deletedMany", { count: ids.length }));
      return;
    }
    void Promise.allSettled(ids.map((id) => deleteLiveFile(id))).then((results) => {
      const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
      const ok = results.length - results.filter((r) => r.status === "rejected").length;
      if (ok) toast.success(t("deletedMany", { count: ok }));
      if (failed) {
        toast.error(failed.reason instanceof Error ? failed.reason.message : String(failed.reason));
        void loadLiveFiles(true);
      }
    });
  };
  const pressStart = (id: string) => (e: ReactPointerEvent) => {
    if (e.pointerType !== "touch") return;
    const st = { fired: false, x: e.clientX, y: e.clientY, timer: 0 };
    st.timer = window.setTimeout(() => {
      st.fired = true;
      navigator.vibrate?.(12);
      setSelected((prev) => new Set(prev).add(id));
    }, 450);
    press.current = st;
  };
  const pressMove = (e: ReactPointerEvent) => {
    const st = press.current;
    if (st && Math.hypot(e.clientX - st.x, e.clientY - st.y) > 10) window.clearTimeout(st.timer);
  };
  const pressEnd = () => {
    if (press.current) window.clearTimeout(press.current.timer);
  };
  // The Upload button's liquid fill: real bytes sent across all picked files.
  const [up, setUp] = useState<{ phase: UploadPhase; loaded: number; total: number; ms: number }>({ phase: "idle", loaded: 0, total: 0, ms: 0 });
  const used = files.reduce((s, f) => s + f.size, 0);
  const usedPct = (used / STORAGE_LIMIT) * 100;
  const KIND_COLOR: Record<FileKind, string> = { image: "var(--primary)", video: "#5fbf9f", pdf: "#c2410c", other: "#b49a6a" };
  const byKind = FILE_KINDS.map((k) => ({ kind: k, color: KIND_COLOR[k], size: files.filter((f) => f.kind === k).reduce((n, f) => n + f.size, 0) }));
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
    if (!accepted.length) return;
    if (!isLive()) {
      filesStore.set((s) => ({ files: [...accepted, ...s.files] }));
      toast.success(t("uploaded", { count: accepted.length }));
      return;
    }
    // Real accounts: upload to storage, then show what's really there.
    const picked = Array.from(list).filter((f) => f.size <= MAX_SIZE[kindOf(f)]);
    const total = picked.reduce((n, f) => n + f.size, 0);
    const sent = picked.map(() => 0);
    const started = performance.now();
    setUp({ phase: "connecting", loaded: 0, total, ms: 0 });
    void Promise.allSettled(
      picked.map((f, i) =>
        uploadAccountMedia(MEDIA_BUCKET, f, (loaded) => {
          sent[i] = loaded;
          setUp({ phase: "uploading", loaded: sent.reduce((a, b) => a + b, 0), total, ms: 0 });
        }),
      ),
    ).then(async (results) => {
      const ok = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
      setUp(ok ? { phase: "done", loaded: total, total, ms: performance.now() - started } : { phase: "idle", loaded: 0, total: 0, ms: 0 });
      if (ok) window.setTimeout(() => setUp((u) => (u.phase === "done" ? { phase: "idle", loaded: 0, total: 0, ms: 0 } : u)), 3200);
      if (ok) toast.success(t("uploaded", { count: ok }));
      if (failed) toast.error(failed.reason instanceof Error ? failed.reason.message : String(failed.reason));
      await loadLiveFiles(true);
    });
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
        <UploadButton
          className="self-start"
          phase={up.phase}
          progress={up.total ? up.loaded / up.total : 0}
          labels={{ idle: t("upload"), uploading: t("uploading"), done: t("uploadDone") }}
          caption={
            up.phase === "connecting"
              ? t("connecting")
              : up.phase === "uploading"
                ? t("progressOf", { loaded: formatSize(up.loaded, locale), total: formatSize(up.total, locale) })
                : up.phase === "done"
                  ? t("doneIn", { total: formatSize(up.total, locale), seconds: (up.ms / 1000).toFixed(1) })
                  : null
          }
          onClick={() => input.current?.click()}
        />
        <input ref={input} type="file" multiple className="hidden" accept="image/*,application/pdf,video/mp4,.doc,.docx,.xls,.xlsx,.csv,text/csv,text/comma-separated-values,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => add(e.target.files)} />
      </div>

      {isLive() && <ProductListPanel />}

      {/* Storage: how much is used, split by file type. */}
      <section className="rounded-3xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <HardDrive className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-muted-foreground">{t("storage")}</p>
            <p className="mt-0.5 text-2xl font-bold tracking-[-0.02em] text-foreground tabular-nums">
              {formatSize(used, locale)}
              <span className="ml-1.5 text-sm font-medium text-muted-foreground">{t("ofTotal", { total: formatSize(STORAGE_LIMIT, locale) })}</span>
            </p>
          </div>
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary tabular-nums">{t("percentUsed", { percent: usedPct < 1 && used > 0 ? "<1" : Math.round(usedPct) })}</span>
        </div>
        <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={t("storageUsed", { used: formatSize(used, locale), total: formatSize(STORAGE_LIMIT, locale) })}>
          {byKind.map((k) =>
            k.size > 0 ? <span key={k.kind} className="grow-x-bar h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${Math.max(1.2, (k.size / STORAGE_LIMIT) * 100)}%`, background: k.color }} /> : null,
          )}
        </div>
        <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-5">
          {byKind.map((k) => (
            <li key={k.kind} className="flex items-center gap-2 text-sm">
              <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: k.color }} />
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{t(`kind_${k.kind}`)}</span>
              <span className="font-medium text-foreground tabular-nums">{formatSize(k.size, locale)}</span>
            </li>
          ))}
          <li className="col-span-2 flex items-center gap-2 text-sm sm:col-span-1">
            <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-muted ring-1 ring-border" />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{t("free")}</span>
            <span className="font-medium text-foreground tabular-nums">{formatSize(Math.max(0, STORAGE_LIMIT - used), locale)}</span>
          </li>
        </ul>
      </section>

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

      {/* Drop zone: big, clear, and it lights up while a file is dragged over the page. */}
      <button
        type="button"
        onClick={() => input.current?.click()}
        data-dragging={dragging || undefined}
        className="drop-zone group flex w-full flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-primary/30 bg-card/60 px-6 py-10 text-center transition-[border-color,background-color,scale] duration-200 hover:border-primary/60 hover:bg-primary/[0.04] focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none data-[dragging]:scale-[1.01] data-[dragging]:border-primary data-[dragging]:bg-primary/[0.07] sm:py-14"
      >
        <span className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary ring-8 ring-primary/5 transition-transform duration-300 group-hover:-translate-y-1 group-data-[dragging]:-translate-y-1.5">
          <Upload className="size-7" />
        </span>
        <span className="text-base font-semibold text-foreground sm:text-lg">{t("dropHere")}</span>
        <span className="max-w-md text-sm text-muted-foreground">{t("limits")}</span>
      </button>

      {shown.length > 0 && !selecting && <p className="-mb-2 text-xs text-muted-foreground lg:hidden">{t("holdHint")}</p>}
      <div className={cn("grid grid-cols-2 gap-4 rounded-2xl sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5", selecting && "pb-24")}>
        {shown.map((f) => {
          const isSel = selected.has(f.id);
          return (
          <button
            key={f.id}
            type="button"
            aria-pressed={selecting ? isSel : undefined}
            onPointerDown={pressStart(f.id)}
            onPointerMove={pressMove}
            onPointerUp={pressEnd}
            onPointerCancel={pressEnd}
            onContextMenu={(e) => selecting && e.preventDefault()}
            onClick={(e) => {
              // The lift after a long press must not also open the file.
              if (press.current?.fired) {
                press.current = null;
                return;
              }
              if (selecting || e.metaKey || e.ctrlKey) return toggle(f.id);
              setOpenId(f.id);
            }}
            className={cn(
              "file-tile group relative flex aspect-[4/5] flex-col overflow-hidden rounded-2xl border bg-card text-left shadow-[var(--shadow-card)] transition-[border-color,box-shadow,scale] duration-200 [-webkit-touch-callout:none] select-none hover:border-primary/40",
              isSel ? "scale-[0.96] border-primary ring-2 ring-primary" : "border-border",
            )}
          >
            {selecting && (
              <span aria-hidden className={cn("absolute top-2 left-2 z-10 flex size-7 items-center justify-center rounded-full shadow-sm", isSel ? "bg-primary text-primary-foreground" : "bg-card/90 text-muted-foreground")}>
                {isSel ? <CheckCircle2 className="size-5" /> : <Circle className="size-5" />}
              </span>
            )}
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
          );
        })}
      </div>
      {shown.length === 0 && files.length > 0 && <EmptyPanel icon={FileText} mascot="sleep" title={t("empty")} />}

      {/* A file's details: a centred card with a real preview. */}
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent showCloseButton={false} className="max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto p-0 sm:max-w-lg">
          {open && (
            <>
              <div className="relative overflow-hidden rounded-t-3xl border-b border-border">
                <Preview file={open} />
                <button
                  type="button"
                  onClick={() => setOpenId(null)}
                  aria-label={t("close")}
                  className="absolute top-3 right-3 flex size-9 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm hover:bg-black/60 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="space-y-5 p-5">
                <DialogHeader className="gap-2">
                  <DialogTitle className="text-lg leading-snug font-semibold tracking-[-0.01em] break-all">{open.name}</DialogTitle>
                  <DialogDescription render={<div />} className="flex flex-wrap gap-1.5">
                    <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">{t(`kind_${open.kind}`)}</span>
                    <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground/80 tabular-nums">{formatSize(open.size, locale)}</span>
                    <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground/80">
                      {new Date(open.uploadedAt).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-1.5">
                  <label htmlFor="file-name" className="text-sm font-medium text-foreground">
                    {t("rename")}
                  </label>
                  <Input id="file-name" value={open.name} onChange={(e) => filesStore.set((s) => ({ files: s.files.map((x) => (x.id === open.id ? { ...x, name: e.target.value } : x)) }))} />
                </div>
                {open.url && isCatalogFile(open.name) && <ProductListPanel file={{ name: open.name, url: open.url }} />}
                <section className="rounded-2xl bg-muted/50 p-3.5">
                  <p className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">{t("usedIn")}</p>
                  {open.usedIn.length === 0 ? (
                    <p className="mt-1 text-sm text-muted-foreground">{t("notUsedLong")}</p>
                  ) : (
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {open.usedIn.map((u) => (
                        <li key={u} className="rounded-full bg-card px-2.5 py-1 text-xs text-foreground ring-1 ring-border">
                          {u}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_auto]">
                  <Button
                    variant="outline"
                    className="min-h-11 gap-1.5"
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
                  {open.url ? (
                    <a href={open.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border border-border px-4 text-sm font-medium text-foreground hover:bg-muted">
                      <ExternalLink className="size-4" />
                      {t("openFile")}
                    </a>
                  ) : (
                    <span />
                  )}
                  <Button variant="destructive" className="col-span-2 min-h-11 gap-1.5 sm:col-span-1" onClick={() => setConfirm([open.id])}>
                    <Trash2 className="size-4" />
                    {t("delete")}
                  </Button>
                </div>
                {open.usedIn.length > 0 && <p className="text-xs text-muted-foreground">{t("deleteWarning")}</p>}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Selection bar: appears after a long press (or Ctrl/Cmd-click). */}
      {selecting && (
        <div role="toolbar" aria-label={t("selectedCount", { count: selected.size })} className="select-bar liquid-glass lg-floating fixed inset-x-3 bottom-24 z-50 mx-auto flex max-w-md items-center gap-2 rounded-full p-2 pl-4 lg:bottom-6">
          <span className="flex-1 text-sm font-semibold text-foreground tabular-nums">{t("selectedCount", { count: selected.size })}</span>
          <Button variant="ghost" className="min-h-10 rounded-full" onClick={() => setSelected(new Set())}>
            {t("cancel")}
          </Button>
          <Button variant="destructive" className="min-h-10 gap-1.5 rounded-full" onClick={() => setConfirm(Array.from(selected))}>
            <Trash2 className="size-4" />
            {t("delete")}
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={t("deleteTitle", { count: confirm?.length ?? 1 })}
        description={t("deleteDesc")}
        confirmLabel={t("delete")}
        cancelLabel={t("cancel")}
        onConfirm={() => confirm && removeFiles(confirm)}
      />
    </div>
  );
}
