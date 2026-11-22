"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import type { Contact, ContactNote, Tag } from "@/types";
import {
  Phone,
  Mail,
  Copy,
  Check,
  User,
  Tag as TagIcon,
  StickyNote,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { useTranslations } from "next-intl";
import { contactHandle } from "@/lib/whatsapp/wa-identity";
import { LeadCard } from "@/components/leads/lead-card";

interface ContactSidebarProps {
  contact: Contact | null;
}

export function ContactSidebar({ contact }: ContactSidebarProps) {
  const tSidebar = useTranslations("Inbox.sidebar");
  const tThread = useTranslations("Inbox.messageThread");

  const { accountId } = useAuth();
  const [copied, setCopied] = useState(false);
  const [notes, setNotes] = useState<ContactNote[]>([]);
  const [tags, setTags] = useState<(Tag & { contact_tag_id: string })[]>([]);
  const [newNote, setNewNote] = useState("");
  const [addingNote, setAddingNote] = useState(false);

  const fetchContactData = useCallback(async () => {
    if (!contact) return;

    const supabase = createClient();

    // Fetch notes and tags in parallel
    const [notesRes, tagsRes] = await Promise.all([
      supabase
        .from("contact_notes")
        .select("*")
        .eq("contact_id", contact.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("contact_tags")
        .select("id, tag_id, tags(*)")
        .eq("contact_id", contact.id),
    ]);

    if (notesRes.data) setNotes(notesRes.data);
    if (tagsRes.data) {
      const mapped = tagsRes.data
        .filter((ct: Record<string, unknown>) => ct.tags)
        .map((ct: Record<string, unknown>) => ({
          ...(ct.tags as Tag),
          contact_tag_id: ct.id as string,
        }));
      setTags(mapped);
    }
  }, [contact]);

  // Load on contact change. setContactData/setTags run inside async
  // Supabase callbacks, not synchronously in the effect body.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchContactData();
  }, [fetchContactData]);

  const handleCopyPhone = useCallback(async () => {
    // Copies whatever the row displays — a BSUID-only contact has no
    // phone number to copy, but its @username still identifies them.
    const handle = contact ? contactHandle(contact) : '';
    if (!handle) return;
    await navigator.clipboard.writeText(handle);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    // Dep is the whole `contact` object (not `contact?.phone`) so the
    // React Compiler's inference agrees with the manual dep list —
    // fixes the `preserve-manual-memoization` lint error.
  }, [contact]);

  const handleAddNote = useCallback(async () => {
    if (!contact || !newNote.trim()) return;
    if (!accountId) return;
    setAddingNote(true);

    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;

    const { data, error } = await supabase
      .from("contact_notes")
      .insert({
        contact_id: contact.id,
        account_id: accountId,
        user_id: user?.id,
        note_text: newNote.trim(),
      })
      .select()
      .single();

    if (!error && data) {
      setNotes((prev) => [data, ...prev]);
      setNewNote("");
    }
    setAddingNote(false);
  }, [contact, newNote, accountId]);

  if (!contact) {
    return (
      <div className="flex h-full w-70 items-center justify-center bg-card">
        <p className="text-sm text-muted-foreground">{tThread("selectConversation")}</p>
      </div>
    );
  }

  const displayName = contact.name || contactHandle(contact);
  const initials = (Array.from(displayName)[0] ?? "").toUpperCase();

  return (
    <div className="flex h-full min-h-0 w-70 flex-col bg-card">
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 p-3">
          {/* Who: avatar on a soft brand glow, name, company. */}
          <div className="relative overflow-hidden rounded-2xl px-4 pt-6 pb-4 text-center ring-1 ring-border">
            <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-[radial-gradient(120%_100%_at_50%_0%,color-mix(in_oklab,var(--primary)_16%,transparent),transparent_75%)]" />
            <div className="relative mx-auto flex size-16 items-center justify-center overflow-hidden rounded-full bg-hero text-xl font-semibold text-white shadow-[0_8px_20px_-10px_var(--primary)] ring-4 ring-card">
              {contact.avatar_url ? (
                <img src={contact.avatar_url} alt={displayName} className="size-16 object-cover" />
              ) : (
                initials
              )}
            </div>
            <h2 className="relative mt-3 truncate text-[15px] font-semibold tracking-[-0.01em] text-foreground">{displayName}</h2>
            {contact.company && <p className="relative mt-0.5 truncate text-xs text-muted-foreground">{contact.company}</p>}
          </div>

          {/* How to reach them. */}
          <div className="overflow-hidden rounded-2xl ring-1 ring-border">
            <button
              onClick={handleCopyPhone}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-foreground transition-colors hover:bg-muted/60"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Phone className="size-4" />
              </span>
              <span className="min-w-0 flex-1 truncate font-medium tabular-nums">{contactHandle(contact)}</span>
              {copied ? <Check className="size-3.5 text-primary" /> : <Copy className="size-3.5 text-muted-foreground" />}
            </button>
            {contact.email && (
              <div className="flex items-center gap-3 border-t border-border px-3 py-2.5 text-sm text-foreground">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Mail className="size-4" />
                </span>
                <span className="truncate">{contact.email}</span>
              </div>
            )}
          </div>

          {/* Tags */}
          <section className="rounded-2xl p-3 ring-1 ring-border">
            <h3 className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
              <TagIcon className="size-3.5" />
              {tSidebar("tags")}
            </h3>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {tags.length === 0 ? (
                <p className="text-xs text-muted-foreground">{tSidebar("noTags")}</p>
              ) : (
                tags.map((tag) => (
                  <span
                    key={tag.contact_tag_id}
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
                    style={{
                      backgroundColor: `color-mix(in oklab, ${tag.color} 14%, transparent)`,
                      color: `color-mix(in oklab, ${tag.color} 45%, var(--foreground))`,
                    }}
                  >
                    <span aria-hidden className="size-1.5 rounded-full" style={{ backgroundColor: tag.color }} />
                    {tag.name}
                  </span>
                ))
              )}
            </div>
          </section>

          {/* Lead score (only when this number is a lead). */}
          <LeadCard phone={contact.phone} />

          {/* Notes */}
          <section className="rounded-2xl p-3 ring-1 ring-border">
            <h3 className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
              <StickyNote className="size-3.5" />
              {tSidebar("notes")}
            </h3>
            <div className="mt-2.5 rounded-xl bg-muted/60 ring-1 ring-transparent transition-shadow focus-within:bg-card focus-within:ring-primary/40">
              <textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder={tSidebar("addNotePlaceholder")}
                rows={2}
                className="block w-full resize-none bg-transparent px-3 pt-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none"
              />
              <div className="flex justify-end px-2 pb-2">
                <Button
                  size="icon-sm"
                  aria-label={tSidebar("addNotePlaceholder")}
                  className="rounded-full"
                  onClick={handleAddNote}
                  disabled={!newNote.trim() || addingNote}
                >
                  <Plus className="size-4" />
                </Button>
              </div>
            </div>
            {notes.length > 0 && (
              <ol className="mt-3 space-y-3 border-l border-border pl-3">
                {notes.map((note) => (
                  <li key={note.id} className="relative">
                    <span aria-hidden className="absolute top-1.5 -left-[16.5px] size-2 rounded-full bg-primary ring-2 ring-card" />
                    <p className="whitespace-pre-wrap text-sm text-foreground">{note.note_text}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
                      {format(new Date(note.created_at), "MMM d, yyyy · HH:mm")}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </ScrollArea>
    </div>
  );
}
