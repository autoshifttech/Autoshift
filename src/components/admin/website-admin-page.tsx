"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ExternalLink, Globe, Info, Maximize2, RotateCcw } from "lucide-react";

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
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-col gap-3 border-b border-border bg-background px-4 py-3 sm:px-6 lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--tone-mint)] text-primary">
            <Globe className="size-5" />
          </span>
          <div className="min-w-0">
            <h1 className="text-lg font-bold tracking-tight text-foreground">Website admin</h1>
            <p className="hidden text-xs text-muted-foreground sm:block">Edit the public AutoShift website: pages, services, pricing, blog, theme, photos, SEO and contact leads.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.open("/", "_blank", "noopener")}>
            <ExternalLink className="size-3.5" />
            View live site
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.open(EDITOR_URL, "_blank", "noopener")}>
            <Maximize2 className="size-3.5" />
            Open full screen
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 text-rose-600 hover:text-rose-600" onClick={() => setResetting(true)}>
            <RotateCcw className="size-3.5" />
            Reset
          </Button>
        </div>
      </div>
      <p className="flex items-start gap-2 border-b border-amber-500/20 bg-amber-500/5 px-4 py-2 text-xs text-amber-900 sm:px-6 dark:text-amber-200">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        <span>
          Design preview: Publish saves changes in this browser only<span className="hidden sm:inline">, so you see them on the site here. Once the backend is connected, Publish will update the live site for every visitor</span>.
        </span>
      </p>
      <iframe key={frameKey} src={EDITOR_URL} title="Website admin" className="min-h-0 w-full flex-1 border-0 bg-background" />

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
