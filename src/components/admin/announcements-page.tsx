"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Eye, Megaphone, Newspaper, Pencil, Plus, Trash2, Wrench, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ADMIN_NOW, type Announcement } from "@/lib/admin/data";
import { dateTime, num } from "@/lib/admin/format";
import { act, useAdmin, useBusinesses } from "@/lib/admin/store";
import { EmptyState, PageHeader, Panel, Pill, Segmented } from "./admin-ui";

const KIND_META: Record<Announcement["kind"], { label: string; icon: LucideIcon; hint: string }> = {
  news: { label: "What's new", icon: Newspaper, hint: "Shows in the help panel and release notes." },
  banner: { label: "Banner", icon: Megaphone, hint: "A strip at the top of the app until dismissed." },
  maintenance: { label: "Maintenance", icon: Wrench, hint: "A yellow notice before and during the window." },
};

const AUDIENCE_LABEL: Record<Announcement["audience"], string> = { all: "Everyone", trial: "On trial", paying: "Paying", starter: "Starter plan", growth: "Growth plan", pro: "Pro plan" };
const STATUS_TONE: Record<Announcement["status"], "gray" | "blue" | "green"> = { draft: "gray", scheduled: "blue", published: "green" };

type Draft = Omit<Announcement, "id" | "views" | "status"> & { id?: string; when: "now" | "later" | "draft"; date: string };

const blank = (): Draft => ({ title: "", body: "", kind: "news", audience: "all", at: new Date(ADMIN_NOW).toISOString(), when: "now", date: new Date(ADMIN_NOW + 864e5).toISOString().slice(0, 16) });

function Preview({ d }: { d: Pick<Draft, "title" | "body" | "kind"> }) {
  if (d.kind === "banner")
    return (
      <div className="rounded-lg bg-[#1E4C41] px-3 py-2 text-center text-xs text-white">
        <strong>{d.title || "Your title"}</strong> {d.body && <span className="text-white/80">· {d.body}</span>}
      </div>
    );
  if (d.kind === "maintenance")
    return (
      <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-800">
        <Wrench className="mr-1 inline size-3.5" />
        <strong>{d.title || "Your title"}</strong> {d.body}
      </div>
    );
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <span className="rounded-full bg-[var(--tone-mint)] px-2 py-0.5 text-[10px] font-semibold text-primary uppercase">New</span>
      <p className="mt-1.5 text-sm font-semibold text-foreground">{d.title || "Your title"}</p>
      <p className="text-xs text-muted-foreground">{d.body || "What changed and why it helps."}</p>
    </div>
  );
}

export function AnnouncementsPage() {
  const { announcements } = useAdmin();
  const businesses = useBusinesses();
  const [filter, setFilter] = useState<Announcement["status"] | "all">("all");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState<Announcement | null>(null);

  const reach = (a: Announcement["audience"]) =>
    businesses.filter((b) => {
      if (b.status === "cancelled" || b.status === "blocked" || b.status === "expired") return false;
      if (a === "all") return true;
      if (a === "trial") return b.status === "trial";
      if (a === "paying") return b.status === "active" || b.status === "past_due";
      return b.plan === a && b.status !== "trial";
    }).length;

  const list = announcements.filter((a) => filter === "all" || a.status === filter);

  const save = () => {
    if (!draft) return;
    const status: Announcement["status"] = draft.when === "draft" ? "draft" : draft.when === "later" ? "scheduled" : "published";
    const at = draft.when === "later" ? new Date(draft.date).toISOString() : new Date().toISOString();
    const item: Announcement = { id: draft.id ?? `an_${Date.now()}`, title: draft.title.trim(), body: draft.body.trim(), kind: draft.kind, audience: draft.audience, status, at, views: announcements.find((a) => a.id === draft.id)?.views ?? 0 };
    const verb = status === "published" ? "Published announcement" : status === "scheduled" ? "Scheduled announcement" : "Saved draft announcement";
    act(verb, item.title, `${KIND_META[item.kind].label} · ${AUDIENCE_LABEL[item.audience]}`, (s) => ({ announcements: draft.id ? s.announcements.map((a) => (a.id === draft.id ? item : a)) : [item, ...s.announcements] }));
    toast.success(status === "published" ? `Sent to ${reach(item.audience)} businesses` : status === "scheduled" ? "Scheduled" : "Draft saved");
    setDraft(null);
  };

  return (
    <>
      <PageHeader
        title="Announcements"
        description="Tell businesses about new features, offers and maintenance. Choose who sees it and when."
        actions={
          <Button className="gap-1.5" onClick={() => setDraft(blank())}>
            <Plus className="size-4" />
            New announcement
          </Button>
        }
      />
      <Segmented
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: `All · ${announcements.length}` },
          { value: "published", label: "Published" },
          { value: "scheduled", label: "Scheduled" },
          { value: "draft", label: "Drafts" },
        ]}
      />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
        {list.map((a) => {
          const K = KIND_META[a.kind];
          return (
            <Panel key={a.id} className="flex flex-col">
              <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--tone-sky)] text-foreground">
                  <K.icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-foreground">{a.title}</p>
                    <Pill tone={STATUS_TONE[a.status]}>{a.status[0].toUpperCase() + a.status.slice(1)}</Pill>
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">{a.body}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {K.label} · {AUDIENCE_LABEL[a.audience]} ({reach(a.audience)} businesses) · {a.status === "scheduled" ? "goes out" : a.status === "draft" ? "edited" : "sent"} {dateTime(a.at)}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between gap-2 border-t border-border pt-3">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Eye className="size-3.5" />
                  {num(a.views)} views
                </span>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" className="gap-1" onClick={() => setDraft({ ...a, when: a.status === "draft" ? "draft" : a.status === "scheduled" ? "later" : "now", date: a.at.slice(0, 16) })}>
                    <Pencil className="size-3.5" />
                    Edit
                  </Button>
                  {a.status === "published" ? (
                    <Button size="sm" variant="ghost" onClick={() => act("Unpublished announcement", a.title, "Moved back to drafts", (s) => ({ announcements: s.announcements.map((x) => (x.id === a.id ? { ...x, status: "draft" as const } : x)) }))}>
                      Unpublish
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        act("Published announcement", a.title, `${K.label} · ${AUDIENCE_LABEL[a.audience]}`, (s) => ({ announcements: s.announcements.map((x) => (x.id === a.id ? { ...x, status: "published" as const, at: new Date().toISOString() } : x)) }));
                        toast.success(`Sent to ${reach(a.audience)} businesses`);
                      }}
                    >
                      Publish now
                    </Button>
                  )}
                  <Button size="icon-sm" variant="ghost" aria-label={`Delete ${a.title}`} onClick={() => setDeleting(a)}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            </Panel>
          );
        })}
      </div>
      {list.length === 0 && (
        <Panel>
          <EmptyState icon={Megaphone} title="Nothing here yet" detail="Create an announcement to reach your businesses." />
        </Panel>
      )}

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          {draft && (
            <>
              <DialogHeader>
                <DialogTitle>{draft.id ? "Edit announcement" : "New announcement"}</DialogTitle>
                <DialogDescription>{KIND_META[draft.kind].hint}</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_240px]">
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    {(Object.keys(KIND_META) as Announcement["kind"][]).map((k) => {
                      const K = KIND_META[k];
                      return (
                        <button key={k} type="button" onClick={() => setDraft({ ...draft, kind: k })} className={cn("flex flex-col items-center gap-1 rounded-xl border p-2.5 text-xs font-medium", draft.kind === k ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:bg-muted")}>
                          <K.icon className="size-4" />
                          {K.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="an-title">Title</Label>
                    <Input id="an-title" value={draft.title} maxLength={80} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Drip campaigns are here" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="an-body">Message</Label>
                    <Textarea id="an-body" rows={3} value={draft.body} maxLength={280} onChange={(e) => setDraft({ ...draft, body: e.target.value })} placeholder="One or two short sentences." />
                    <p className="text-right text-[11px] text-muted-foreground">{draft.body.length}/280</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="an-audience">Who sees it</Label>
                      <NativeSelect id="an-audience" value={draft.audience} onChange={(e) => setDraft({ ...draft, audience: e.target.value as Announcement["audience"] })}>
                        {(Object.keys(AUDIENCE_LABEL) as Announcement["audience"][]).map((a) => (
                          <option key={a} value={a}>
                            {AUDIENCE_LABEL[a]}
                          </option>
                        ))}
                      </NativeSelect>
                      <p className="text-[11px] text-muted-foreground">{reach(draft.audience)} businesses</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="an-when">When</Label>
                      <NativeSelect id="an-when" value={draft.when} onChange={(e) => setDraft({ ...draft, when: e.target.value as Draft["when"] })}>
                        <option value="now">Publish now</option>
                        <option value="later">Schedule</option>
                        <option value="draft">Save as draft</option>
                      </NativeSelect>
                    </div>
                  </div>
                  {draft.when === "later" && (
                    <div className="space-y-1.5">
                      <Label htmlFor="an-date">Date and time</Label>
                      <Input id="an-date" type="datetime-local" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
                    </div>
                  )}
                </div>
                <div>
                  <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Preview</p>
                  <Preview d={draft} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDraft(null)}>
                  Cancel
                </Button>
                <Button disabled={!draft.title.trim() || !draft.body.trim()} onClick={save}>
                  {draft.when === "now" ? "Publish" : draft.when === "later" ? "Schedule" : "Save draft"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete this announcement?</DialogTitle>
            <DialogDescription>“{deleting?.title}” disappears for every business. This can&apos;t be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleting) act("Deleted announcement", deleting.title, "", (s) => ({ announcements: s.announcements.filter((a) => a.id !== deleting.id) }));
                setDeleting(null);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
