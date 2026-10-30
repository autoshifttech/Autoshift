"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Ban, CheckCircle2, Megaphone, Plus, Search, ShieldCheck, ShieldOff, UserMinus, UserPlus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  classifyReply,
  consentStore,
  excludedPhones,
  isValidPhone,
  phoneKey,
  useConsent,
  type ConsentRecord,
  type ConsentSettings,
  type ConsentSource,
  type ConsentStatus,
} from "@/lib/consent/model";

type Tab = "people" | "blocklist" | "rules" | "collect";
const COLLECT: Exclude<ConsentSource, "manual">[] = ["website", "keyword", "ad", "booking", "import"];

function StatusPill({ status }: { status: ConsentStatus }) {
  const t = useTranslations("Consent");
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", status === "opted_in" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-rose-500/10 text-rose-700 dark:text-rose-400")}>
      {status === "opted_in" ? <CheckCircle2 className="size-3" /> : <ShieldOff className="size-3" />}
      {t(`status_${status}`)}
    </span>
  );
}

/** Editable list of keywords shown as chips. */
function KeywordChips({ value, onChange, label }: { value: string[]; onChange: (v: string[]) => void; label: string }) {
  const t = useTranslations("Consent");
  const [draft, setDraft] = useState("");
  const add = () => {
    const k = draft.trim().toUpperCase();
    if (!k || value.some((v) => v.toUpperCase() === k)) return setDraft("");
    onChange([...value, k]);
    setDraft("");
  };
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {value.map((k) => (
          <span key={k} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 font-mono text-xs text-foreground">
            {k}
            <button type="button" aria-label={t("removeKeyword", { keyword: k })} onClick={() => onChange(value.filter((v) => v !== k))} className="rounded-full text-muted-foreground hover:text-foreground">
              <X className="size-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <Input
          value={draft}
          aria-label={label}
          placeholder={t("addKeywordPlaceholder")}
          onChange={(e) => setDraft(e.target.value.slice(0, 24))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          className="h-9 max-w-56"
        />
        <Button type="button" variant="outline" size="sm" onClick={add} disabled={!draft.trim()}>
          {t("add")}
        </Button>
      </div>
    </div>
  );
}

function RulesTab({ saved }: { saved: ConsentSettings }) {
  const t = useTranslations("Consent");
  const [s, setS] = useState(saved);
  const [test, setTest] = useState("Stop");
  const dirty = JSON.stringify(s) !== JSON.stringify(saved);
  const result = classifyReply(test, s);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-2">
      <section className="space-y-5 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
        <div>
          <h2 className="font-semibold text-foreground">{t("optOutTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("optOutDesc")}</p>
          <div className="mt-3">
            <KeywordChips value={s.optOutKeywords} onChange={(v) => setS({ ...s, optOutKeywords: v })} label={t("optOutTitle")} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="opt-out-reply">{t("optOutReply")}</Label>
          <Textarea id="opt-out-reply" rows={2} value={s.optOutReply} onChange={(e) => setS({ ...s, optOutReply: e.target.value })} />
          <label className="flex items-center justify-between gap-3 pt-1 text-sm text-foreground">
            {t("confirmOptOut")}
            <Switch checked={s.confirmOptOut} onCheckedChange={(v) => setS({ ...s, confirmOptOut: v })} aria-label={t("confirmOptOut")} />
          </label>
        </div>
        <div className="border-t border-border pt-5">
          <h2 className="font-semibold text-foreground">{t("optInTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("optInDesc")}</p>
          <div className="mt-3">
            <KeywordChips value={s.optInKeywords} onChange={(v) => setS({ ...s, optInKeywords: v })} label={t("optInTitle")} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="opt-in-reply">{t("optInReply")}</Label>
          <Textarea id="opt-in-reply" rows={2} value={s.optInReply} onChange={(e) => setS({ ...s, optInReply: e.target.value })} />
        </div>
      </section>

      <div className="space-y-5">
        <section className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
          <label className="flex items-start justify-between gap-4">
            <span>
              <span className="block font-semibold text-foreground">{t("requireOptIn")}</span>
              <span className="block text-sm text-muted-foreground">{t("requireOptInDesc")}</span>
            </span>
            <Switch checked={s.requireOptIn} onCheckedChange={(v) => setS({ ...s, requireOptIn: v })} aria-label={t("requireOptIn")} />
          </label>
          {!s.requireOptIn && <p className="mt-3 rounded-xl bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">{t("requireOptInWarning")}</p>}
        </section>

        <section className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
          <h2 className="font-semibold text-foreground">{t("testTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("testDesc")}</p>
          <Input className="mt-3" value={test} onChange={(e) => setTest(e.target.value)} aria-label={t("testTitle")} />
          <div className={cn("mt-3 rounded-xl p-3 text-sm", result === "opt_out" ? "bg-rose-500/10 text-rose-800 dark:text-rose-300" : result === "opt_in" ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300" : "bg-muted text-muted-foreground")}>
            <p className="font-medium">{t(result === "opt_out" ? "testOptOut" : result === "opt_in" ? "testOptIn" : "testNone")}</p>
            {result === "opt_out" && s.confirmOptOut && <p className="mt-1 text-xs opacity-90">“{s.optOutReply}”</p>}
            {result === "opt_in" && <p className="mt-1 text-xs opacity-90">“{s.optInReply}”</p>}
          </div>
        </section>

        <div className="flex justify-end gap-2">
          {dirty && (
            <Button variant="ghost" onClick={() => setS(saved)}>
              {t("undo")}
            </Button>
          )}
          <Button
            disabled={!dirty || s.optOutKeywords.length === 0}
            onClick={() => {
              consentStore.set((st) => ({ ...st, settings: s }));
              toast.success(t("saved"));
            }}
          >
            {t("save")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function CollectTab({ saved }: { saved: ConsentSettings }) {
  const t = useTranslations("Consent");
  const [s, setS] = useState(saved);
  const dirty = JSON.stringify(s) !== JSON.stringify(saved);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <section className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
        <h2 className="font-semibold text-foreground">{t("collectTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("collectDesc")}</p>
        <ul className="mt-4 divide-y divide-border">
          {COLLECT.map((k) => (
            <li key={k} className="flex items-start justify-between gap-4 py-3">
              <span>
                <span className="block font-medium text-foreground">{t(`collect_${k}`)}</span>
                <span className="block text-sm text-muted-foreground">{t(`collect_${k}_desc`)}</span>
              </span>
              <Switch checked={s.collect[k]} onCheckedChange={(v) => setS({ ...s, collect: { ...s.collect, [k]: v } })} aria-label={t(`collect_${k}`)} />
            </li>
          ))}
        </ul>
      </section>
      <div className="space-y-5">
        <section className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
          <Label htmlFor="checkbox-text">{t("checkboxText")}</Label>
          <Textarea id="checkbox-text" rows={2} className="mt-1.5" value={s.checkboxText} onChange={(e) => setS({ ...s, checkboxText: e.target.value })} />
          <p className="mt-4 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t("preview")}</p>
          <div className="mt-2 rounded-xl border border-border bg-background p-4">
            <div className="h-9 rounded-lg border border-border bg-muted/50 px-3 text-sm leading-9 text-muted-foreground">+91 98765 43210</div>
            <label className="mt-3 flex items-start gap-2 text-sm text-foreground">
              <input type="checkbox" defaultChecked={false} className="mt-0.5 accent-[var(--primary)]" />
              {s.checkboxText || t("checkboxText")}
            </label>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">{t("checkboxHint")}</p>
        </section>
        <div className="flex justify-end">
          <Button
            disabled={!dirty || !s.checkboxText.trim()}
            onClick={() => {
              consentStore.set((st) => ({ ...st, settings: s }));
              toast.success(t("saved"));
            }}
          >
            {t("save")}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ConsentPage() {
  const t = useTranslations("Consent");
  const locale = useLocale();
  const state = useConsent();
  const [tab, setTab] = useState<Tab>("people");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ConsentStatus | "all">("all");
  const [adding, setAdding] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", status: "opted_in" as ConsentStatus, note: "" });
  const [block, setBlock] = useState({ phone: "", name: "", reason: "" });

  const when = (iso: string) => new Date(iso).toLocaleString(locale, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  const optedIn = state.records.filter((r) => r.status === "opted_in").length;
  const optedOut = state.records.filter((r) => r.status === "opted_out").length;
  const skipped = excludedPhones(state).size;
  const q = query.trim().toLowerCase();
  const qDigits = phoneKey(q);
  const rows = [...state.records]
    .sort((a, b) => b.at.localeCompare(a.at))
    .filter((r) => (filter === "all" || r.status === filter) && (!q || `${r.name} ${r.phone} ${r.evidence}`.toLowerCase().includes(q) || (qDigits.length > 2 && phoneKey(r.phone).includes(qDigits))));

  const change = (r: ConsentRecord, status: ConsentStatus) => {
    consentStore.set((s) => ({ ...s, records: [{ ...r, id: `c${Date.now()}`, status, source: "manual", evidence: t(status === "opted_in" ? "evidenceManualIn" : "evidenceManualOut"), at: new Date().toISOString() }, ...s.records] }));
    toast.success(t(status === "opted_in" ? "markedIn" : "markedOut", { name: r.name }));
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "people", label: t("tabPeople") },
    { id: "blocklist", label: t("tabBlocklist", { count: state.blocked.length }) },
    { id: "rules", label: t("tabRules") },
    { id: "collect", label: t("tabCollect") },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="sr-only">{t("title")}</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("description")}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { icon: UserPlus, tone: "mint", value: optedIn, label: t("kpiOptedIn") },
          { icon: UserMinus, tone: "peach", value: optedOut, label: t("kpiOptedOut") },
          { icon: Ban, tone: "lilac", value: state.blocked.length, label: t("kpiBlocked") },
          { icon: Megaphone, tone: "sky", value: skipped, label: t("kpiSkipped") },
        ].map(({ icon: Icon, tone, value, label }) => (
          <div key={label} className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
            <span className="flex size-8 items-center justify-center rounded-lg text-foreground" style={{ background: `var(--tone-${tone})` }}>
              <Icon className="size-4" />
            </span>
            <p className="mt-3 text-2xl font-bold text-foreground tabular-nums">{value.toLocaleString(locale)}</p>
            <p className="text-sm text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      <div className="flex items-start gap-3 rounded-2xl border border-primary/20 bg-[var(--tone-mint)] p-4 text-sm text-foreground">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
        <p>{t("policyNote")}</p>
      </div>

      <div role="tablist" className="flex gap-1 overflow-x-auto rounded-full bg-muted p-1 [scrollbar-width:none] sm:w-fit [&::-webkit-scrollbar]:hidden">
        {tabs.map((x) => (
          <button key={x.id} type="button" role="tab" aria-selected={tab === x.id} onClick={() => setTab(x.id)} className={cn("rounded-full px-3.5 py-1.5 text-sm font-medium whitespace-nowrap", tab === x.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
            {x.label}
          </button>
        ))}
      </div>

      {tab === "people" && (
        <section className="rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
          <div className="flex flex-col gap-2 border-b border-border p-4 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("search")} aria-label={t("search")} />
            </div>
            <NativeSelect value={filter} onChange={(e) => setFilter(e.target.value as ConsentStatus | "all")} aria-label={t("filterStatus")} className="sm:w-44">
              <option value="all">{t("filterAll")}</option>
              <option value="opted_in">{t("status_opted_in")}</option>
              <option value="opted_out">{t("status_opted_out")}</option>
            </NativeSelect>
            <Button variant="outline" className="gap-1.5" onClick={() => setAdding(true)}>
              <Plus className="size-4" />
              {t("addRecord")}
            </Button>
          </div>
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:px-5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground">{r.name}</span>
                    <StatusPill status={r.status} />
                    <span className="font-mono text-xs text-muted-foreground">{r.phone}</span>
                  </div>
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">
                    {t(`source_${r.source}`)} · “{r.evidence}” · {when(r.at)}
                  </p>
                </div>
                <Button size="sm" variant="ghost" className="self-start sm:self-center" onClick={() => change(r, r.status === "opted_in" ? "opted_out" : "opted_in")}>
                  {r.status === "opted_in" ? t("markOut") : t("markIn")}
                </Button>
              </li>
            ))}
            {rows.length === 0 && <li className="px-5 py-10 text-center text-sm text-muted-foreground">{t("empty")}</li>}
          </ul>
        </section>
      )}

      {tab === "blocklist" && (
        <section className="rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
          <div className="flex flex-col gap-2 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">{t("blocklistDesc")}</p>
            <Button className="gap-1.5 self-start" onClick={() => setBlockOpen(true)}>
              <Ban className="size-4" />
              {t("blockNumber")}
            </Button>
          </div>
          <ul className="divide-y divide-border">
            {state.blocked.map((b) => (
              <li key={b.phone} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">
                    {b.name} <span className="font-mono text-xs font-normal text-muted-foreground">{b.phone}</span>
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    {b.reason} · {when(b.at)}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    consentStore.set((s) => ({ ...s, blocked: s.blocked.filter((x) => x.phone !== b.phone) }));
                    toast.success(t("unblocked", { phone: b.phone }));
                  }}
                >
                  {t("unblock")}
                </Button>
              </li>
            ))}
            {state.blocked.length === 0 && <li className="px-5 py-10 text-center text-sm text-muted-foreground">{t("blocklistEmpty")}</li>}
          </ul>
        </section>
      )}

      {tab === "rules" && <RulesTab key={JSON.stringify(state.settings)} saved={state.settings} />}
      {tab === "collect" && <CollectTab key={JSON.stringify(state.settings)} saved={state.settings} />}

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("addRecord")}</DialogTitle>
            <DialogDescription>{t("addRecordDesc")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cr-name">{t("name")}</Label>
                <Input id="cr-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cr-phone">{t("phone")}</Label>
                <Input id="cr-phone" inputMode="tel" placeholder="+91 98765 43210" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cr-status">{t("filterStatus")}</Label>
              <NativeSelect id="cr-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ConsentStatus })}>
                <option value="opted_in">{t("status_opted_in")}</option>
                <option value="opted_out">{t("status_opted_out")}</option>
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cr-note">{t("howAgreed")}</Label>
              <Input id="cr-note" value={form.note} placeholder={t("howAgreedPlaceholder")} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdding(false)}>
              {t("cancel")}
            </Button>
            <Button
              disabled={!form.name.trim() || !isValidPhone(form.phone) || !form.note.trim()}
              onClick={() => {
                const rec: ConsentRecord = { id: `c${Date.now()}`, name: form.name.trim(), phone: form.phone.trim(), status: form.status, source: "manual", evidence: form.note.trim(), at: new Date().toISOString() };
                consentStore.set((s) => ({ ...s, records: [rec, ...s.records] }));
                setForm({ name: "", phone: "", status: "opted_in", note: "" });
                setAdding(false);
                toast.success(t("recordAdded"));
              }}
            >
              {t("add")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={blockOpen} onOpenChange={setBlockOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("blockNumber")}</DialogTitle>
            <DialogDescription>{t("blockDesc")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="bl-phone">{t("phone")}</Label>
              <Input id="bl-phone" inputMode="tel" placeholder="+91 98765 43210" value={block.phone} onChange={(e) => setBlock({ ...block, phone: e.target.value })} />
              {state.blocked.some((b) => phoneKey(b.phone) === phoneKey(block.phone)) && <p className="text-xs text-rose-700 dark:text-rose-400">{t("alreadyBlocked")}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bl-name">{t("nameOptional")}</Label>
              <Input id="bl-name" value={block.name} onChange={(e) => setBlock({ ...block, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bl-reason">{t("reason")}</Label>
              <Input id="bl-reason" value={block.reason} placeholder={t("reasonPlaceholder")} onChange={(e) => setBlock({ ...block, reason: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBlockOpen(false)}>
              {t("cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={!isValidPhone(block.phone) || !block.reason.trim() || state.blocked.some((b) => phoneKey(b.phone) === phoneKey(block.phone))}
              onClick={() => {
                consentStore.set((s) => ({ ...s, blocked: [{ phone: block.phone.trim(), name: block.name.trim() || t("unknown"), reason: block.reason.trim(), at: new Date().toISOString() }, ...s.blocked] }));
                toast.success(t("blocked", { phone: block.phone.trim() }));
                setBlock({ phone: "", name: "", reason: "" });
                setBlockOpen(false);
              }}
            >
              {t("blockNumber")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
