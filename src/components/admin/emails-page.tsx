"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Lock, Mail, RotateCcw, Save, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { LogoMark } from "@/components/brand/logo-mark";
import { cn } from "@/lib/utils";
import { DEFAULT_EMAILS, EMAIL_VARIABLES, emailsStore, fill, unknownVariables, useOwnerEmails, type OwnerEmail } from "@/lib/admin/emails";
import { num, pct } from "@/lib/admin/format";
import { act } from "@/lib/admin/store";
import { PageHeader, Panel, Pill } from "./admin-ui";

function Preview({ email }: { email: OwnerEmail }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-[#f4f1ea] dark:bg-[#1b1f1d]">
      <div className="border-b border-border bg-card px-4 py-2.5 text-xs text-muted-foreground">
        <p>
          <span className="font-medium text-foreground">AutoShift</span> &lt;hello@autoshift.app&gt;
        </p>
        <p className="mt-0.5 truncate font-semibold text-foreground">{fill(email.subject)}</p>
      </div>
      <div className="p-4 sm:p-6">
        <div className="mx-auto max-w-md rounded-xl bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <LogoMark className="size-7" />
            <span className="font-extrabold tracking-tight text-foreground">AutoShift</span>
          </div>
          <p className="mt-4 text-sm whitespace-pre-wrap text-foreground">{fill(email.body)}</p>
          {email.button && <span className="mt-5 inline-block rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">{email.button}</span>}
          <p className="mt-6 border-t border-border pt-3 text-xs text-muted-foreground">You get this because you own a workspace on AutoShift. Manage alerts in Settings → Email &amp; WhatsApp alerts.</p>
        </div>
      </div>
    </div>
  );
}

function Editor({ saved }: { saved: OwnerEmail }) {
  const [d, setD] = useState(saved);
  const dirty = JSON.stringify(d) !== JSON.stringify(saved);
  const unknown = unknownVariables(`${d.subject} ${d.body}`);
  const original = DEFAULT_EMAILS.find((x) => x.id === d.id);
  const save = (next: OwnerEmail, details: string) => {
    act("Edited owner email", next.name, details, () => ({}));
    emailsStore.set((s) => ({ emails: s.emails.map((x) => (x.id === next.id ? next : x)) }));
  };
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-2">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
          <span className="text-sm">
            <span className="block font-medium text-foreground">{d.enabled ? "Sending" : "Not sending"}</span>
            <span className="block text-xs text-muted-foreground">When: {d.trigger}</span>
          </span>
          {d.required ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Lock className="size-3.5" /> Always on
            </span>
          ) : (
            <Switch checked={d.enabled} onCheckedChange={(v) => setD({ ...d, enabled: v })} aria-label="Send this email" />
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="em-subject">Subject</Label>
          <Input id="em-subject" value={d.subject} onChange={(e) => setD({ ...d, subject: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="em-body">Message</Label>
          <Textarea id="em-body" rows={9} value={d.body} onChange={(e) => setD({ ...d, body: e.target.value })} className="font-mono text-[13px]" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="em-button">Button text</Label>
          <Input id="em-button" value={d.button} onChange={(e) => setD({ ...d, button: e.target.value })} />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Insert a variable:</p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {EMAIL_VARIABLES.map((v) => (
              <button key={v} type="button" onClick={() => setD({ ...d, body: `${d.body}{{${v}}}` })} className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground hover:bg-primary/10">
                {`{{${v}}}`}
              </button>
            ))}
          </div>
          {unknown.length > 0 && <p className="mt-2 text-xs text-rose-700 dark:text-rose-400">Unknown variable: {unknown.map((u) => `{{${u}}}`).join(", ")}. It would be sent as typed.</p>}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {original && JSON.stringify({ ...original, enabled: d.enabled }) !== JSON.stringify(d) && (
            <Button variant="ghost" className="gap-1.5" onClick={() => setD({ ...original, enabled: d.enabled })}>
              <RotateCcw className="size-4" />
              Restore default
            </Button>
          )}
          <Button variant="outline" className="gap-1.5" onClick={() => toast.success(`Test of “${d.name}” sent to founder@autoshift.app`)}>
            <Send className="size-4" />
            Send test to me
          </Button>
          <Button
            className="gap-1.5"
            disabled={!dirty || !d.subject.trim() || !d.body.trim()}
            onClick={() => {
              save(d, d.enabled !== saved.enabled ? (d.enabled ? "Turned on" : "Turned off") : "Subject or text changed");
              toast.success("Email saved");
            }}
          >
            <Save className="size-4" />
            Save
          </Button>
        </div>
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Preview with sample data</p>
        <Preview email={d} />
      </div>
    </div>
  );
}

export function EmailsPage() {
  const emails = useOwnerEmails();
  const [openId, setOpenId] = useState(emails[0].id);
  const open = emails.find((x) => x.id === openId) ?? emails[0];
  const groups = ["Account", "Billing", "WhatsApp"] as const;

  return (
    <>
      <PageHeader title="Owner emails" description="The emails AutoShift sends to business owners. Owners choose which alerts they also get on WhatsApp in their own settings." />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <Panel bodyClassName="p-2">
          {groups.map((g) => (
            <div key={g} className="mb-2">
              <p className="px-3 pt-2 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{g}</p>
              <ul>
                {emails
                  .filter((x) => x.group === g)
                  .map((x) => (
                    <li key={x.id}>
                      <button type="button" onClick={() => setOpenId(x.id)} aria-current={x.id === open.id ? "true" : undefined} className={cn("flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm", x.id === open.id ? "bg-primary/10 text-primary" : "hover:bg-muted")}>
                        <Mail className="size-4 shrink-0" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{x.name}</span>
                          <span className="block text-xs text-muted-foreground">
                            {num(x.sent30d)} sent · {pct(x.openRate)} opened
                          </span>
                        </span>
                        {!x.enabled && <Pill tone="gray">Off</Pill>}
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </Panel>
        <Panel title={open.name} description={open.trigger}>
          <Editor key={`${open.id}-${JSON.stringify(open)}`} saved={open} />
        </Panel>
      </div>
    </>
  );
}
