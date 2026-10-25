"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Bell, Mail, MessageCircle, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { buildAlerts } from "@/lib/admin/alerts";
import { act, useAdmin, useBusinesses, type AlertSettings } from "@/lib/admin/store";
import { PageHeader, Panel } from "./admin-ui";

const RULES: { key: keyof AlertSettings["rules"]; title: string; detail: string }[] = [
  { key: "quality", title: "Number quality drops to low", detail: "Meta may limit or ban the number if nothing changes." },
  { key: "paymentFailed", title: "Subscription payment fails", detail: "Razorpay retries automatically; you hear about it straight away." },
  { key: "lowWallet", title: "Wallet balance is low", detail: "Messages stop sending when a business runs out of credits." },
  { key: "trialEnding", title: "Trial ends in 3 days or less", detail: "A good moment to offer help or a plan." },
  { key: "marketingSpike", title: "Unusual marketing volume", detail: "Big sends with falling quality can mean spam." },
  { key: "systemDown", title: "A service is slow or down", detail: "Meta, Razorpay, database, AI provider or webhooks." },
];

function Channel({ icon: Icon, title, detail, checked, onChange, locked, children }: { icon: typeof Bell; title: string; detail: string; checked: boolean; onChange: (v: boolean) => void; locked?: boolean; children?: React.ReactNode }) {
  return (
    <div className={cn("rounded-xl border p-4", checked ? "border-primary/40 bg-primary/5" : "border-border")}>
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--tone-mint)] text-primary">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-foreground">{title}</p>
          <p className="text-sm text-muted-foreground">{detail}</p>
        </div>
        <Switch checked={checked} onCheckedChange={onChange} disabled={locked} aria-label={title} />
      </div>
      {checked && children && <div className="mt-3 pl-12">{children}</div>}
    </div>
  );
}

export function AlertSettingsPage() {
  const state = useAdmin();
  return <AlertSettingsForm key={JSON.stringify(state.alerts)} saved={state.alerts} />;
}

function AlertSettingsForm({ saved }: { saved: AlertSettings }) {
  const state = useAdmin();
  const businesses = useBusinesses();
  const [d, setD] = useState<AlertSettings>(saved);
  const dirty = JSON.stringify(d) !== JSON.stringify(saved);
  const emailOk = !d.channels.email || /^\S+@\S+\.\S+$/.test(d.destinations.email);
  const waOk = !d.channels.whatsapp || d.destinations.whatsapp.replace(/\D/g, "").length >= 10;
  const preview = buildAlerts(businesses, { ...state, alerts: d });

  return (
    <>
      <PageHeader
        title="Alert settings"
        description="Choose what you want to hear about and where. The bell and the overview always show alerts in the panel."
        actions={
          <Button
            disabled={!dirty || !emailOk || !waOk}
            className="gap-1.5"
            onClick={() => {
              const on = Object.entries(d.rules)
                .filter(([, v]) => v)
                .map(([k]) => k);
              act("Changed alert settings", "Alerts", `${on.length} rules on · ${Object.entries(d.channels).filter(([, v]) => v).map(([k]) => k).join(", ")}`, () => ({ alerts: d }));
              toast.success("Alert settings saved");
            }}
          >
            <Save className="size-4" />
            Save
          </Button>
        }
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-2">
        <Panel title="Where to send alerts">
          <div className="space-y-3">
            <Channel icon={Bell} title="Admin panel" detail="Bell and overview. Always on." checked locked onChange={() => {}} />
            <Channel icon={Mail} title="Email" detail="One email per critical alert, or a daily summary." checked={d.channels.email} onChange={(v) => setD({ ...d, channels: { ...d.channels, email: v } })}>
              <Label htmlFor="alert-email" className="text-xs text-muted-foreground">
                Send to
              </Label>
              <Input id="alert-email" type="email" className={cn("mt-1", !emailOk && "border-rose-500")} value={d.destinations.email} onChange={(e) => setD({ ...d, destinations: { ...d.destinations, email: e.target.value } })} />
            </Channel>
            <Channel icon={MessageCircle} title="WhatsApp" detail="Critical alerts only, from the AutoShift number." checked={d.channels.whatsapp} onChange={(v) => setD({ ...d, channels: { ...d.channels, whatsapp: v } })}>
              <Label htmlFor="alert-wa" className="text-xs text-muted-foreground">
                Your WhatsApp number
              </Label>
              <Input id="alert-wa" inputMode="tel" placeholder="+91 98765 43210" className={cn("mt-1", !waOk && "border-rose-500")} value={d.destinations.whatsapp} onChange={(e) => setD({ ...d, destinations: { ...d.destinations, whatsapp: e.target.value } })} />
            </Channel>
            <label className="flex items-center justify-between gap-3 rounded-xl border border-border p-4">
              <span>
                <span className="block font-medium text-foreground">Daily summary instead</span>
                <span className="block text-sm text-muted-foreground">One message at 9 AM with everything from the last day. Critical alerts still come straight away.</span>
              </span>
              <Switch checked={d.digest} onCheckedChange={(v) => setD({ ...d, digest: v })} aria-label="Daily summary" />
            </label>
          </div>
        </Panel>

        <Panel title="What to alert on" description={`${preview.length} alerts would be open right now with these settings.`}>
          <ul className="divide-y divide-border">
            {RULES.map((r) => (
              <li key={r.key} className="flex items-start justify-between gap-4 py-3 first:pt-0">
                <span>
                  <span className="block font-medium text-foreground">{r.title}</span>
                  <span className="block text-sm text-muted-foreground">{r.detail}</span>
                  {r.key === "lowWallet" && d.rules.lowWallet && (
                    <span className="mt-2 flex items-center gap-2 text-sm">
                      Below ₹
                      <Input inputMode="numeric" aria-label="Low wallet threshold" className="h-8 w-24" value={String(d.lowWalletBelow)} onChange={(e) => setD({ ...d, lowWalletBelow: Number(e.target.value.replace(/\D/g, "")) || 0 })} />
                    </span>
                  )}
                </span>
                <Switch checked={d.rules[r.key]} onCheckedChange={(v) => setD({ ...d, rules: { ...d.rules, [r.key]: v } })} aria-label={r.title} />
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </>
  );
}
