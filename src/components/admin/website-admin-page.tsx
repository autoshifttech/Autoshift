"use client";

import { useState } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Globe, Info, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { act } from "@/lib/admin/store";

/** Where the public website's own editor lives (served from public/site). */
const EDITOR_URL = "/site/index.html#admin";
/** Keys the website and its admin bridge keep in this browser. */
const SITE_KEYS = ["autoshift.site.published", "autoshift.site.db", "as-draft"];

/**
 * The public website's built-in editor (content, pages, theme, media, leads,
 * publishing), opened inside the platform admin panel.
 */
export function WebsiteAdminPage() {
  const [resetting, setResetting] = useState(false);
  const [frameKey, setFrameKey] = useState(0);

  const reset = () => {
    try {
      for (const k of SITE_KEYS) window.localStorage.removeItem(k);
    } catch {}
    act("Reset website", "Public website", "Published changes, draft and sample leads cleared in this browser");
    setResetting(false);
    setFrameKey((k) => k + 1);
    toast.success("Website reset to the original version");
  };

  return (
    <div className="app-canvas flex h-dvh flex-col bg-background">
      {/* Full screen: the platform admin's sidebar and header are left behind. */}
      <div className="flex flex-wrap items-center gap-2 px-3 pt-3 pb-2 sm:px-4">
        <Link href="/admin" className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-sm font-medium text-foreground shadow-[var(--shadow-card)] hover:bg-card-2">
          <ArrowLeft className="size-4" />
          <span className="hidden sm:inline">Back to admin panel</span>
          <span className="sm:hidden">Admin</span>
        </Link>
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <Globe className="size-4 shrink-0 text-primary" />
          <span className="truncate text-sm font-semibold text-foreground">Website admin</span>
        </span>
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => window.open("/", "_blank", "noopener")}>
          <ExternalLink className="size-3.5" />
          <span className="hidden sm:inline">View live site</span>
        </Button>
        <Button variant="ghost" size="sm" className="gap-1.5 text-rose-700 dark:text-rose-400 hover:text-rose-600" onClick={() => setResetting(true)}>
          <RotateCcw className="size-3.5" />
          <span className="hidden sm:inline">Reset</span>
        </Button>
      </div>
      <p className="mx-3 mb-2 flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-1.5 text-xs text-amber-900 sm:mx-4 dark:text-amber-200">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        <span>
          Design preview: Publish saves changes in this browser only<span className="hidden sm:inline">, so you see them on the site here. Once the backend is connected, Publish will update the live site for every visitor</span>.
        </span>
      </p>
      <iframe key={frameKey} src={EDITOR_URL} title="Website admin" className="min-h-0 w-full flex-1 border-0 border-t border-border bg-background" />

      <Dialog open={resetting} onOpenChange={setResetting}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Reset the website?</DialogTitle>
            <DialogDescription>Removes everything you published, your unpublished draft and the sample leads from this browser, and goes back to the original website.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetting(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={reset}>
              Reset website
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
