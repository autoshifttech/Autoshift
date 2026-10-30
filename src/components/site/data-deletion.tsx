"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Clock, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { LEGAL } from "@/lib/legal";

type Who = "business" | "customer" | "facebook";
interface DeletionRequest {
  code: string;
  who: Who;
  contact: string;
  business: string;
  details: string;
  at: string;
}

const KEY = "autoshift.deletionRequests";

function load(): DeletionRequest[] {
  try {
    return JSON.parse(window.localStorage.getItem(KEY) || "[]") as DeletionRequest[];
  } catch {
    return [];
  }
}

function newCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `DEL-${s.slice(0, 4)}-${s.slice(4)}`;
}

const fmt = (iso: string, days = 0) => new Date(new Date(iso).getTime() + days * 864e5).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

/** Request form and status lookup. Meta's data deletion callback links here with ?code=. */
export function DataDeletion() {
  const [who, setWho] = useState<Who>("business");
  const [contact, setContact] = useState("");
  const [business, setBusiness] = useState("");
  const [details, setDetails] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState<DeletionRequest | null>(null);
  const [lookup, setLookup] = useState("");
  const [found, setFound] = useState<DeletionRequest | null | "none">(null);

  // Meta sends people to this page with their confirmation code.
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("code");
    if (!code) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLookup(code);
    setFound(load().find((r) => r.code === code.trim().toUpperCase()) ?? "none");
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const okContact = /^\S+@\S+\.\S+$/.test(contact.trim()) || contact.replace(/\D/g, "").length >= 10;
    if (!okContact) return setError("Enter the email or WhatsApp number on the account.");
    if (who !== "facebook" && !business.trim()) return setError("Enter the business name.");
    if (!confirm) return setError("Tick the box to confirm you want the data deleted.");
    setError("");
    const req: DeletionRequest = { code: newCode(), who, contact: contact.trim(), business: business.trim(), details: details.trim(), at: new Date().toISOString() };
    try {
      window.localStorage.setItem(KEY, JSON.stringify([req, ...load()]));
    } catch {}
    setSent(req);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section className="rounded-[24px] bg-card p-6 shadow-[var(--shadow-card)] ring-1 ring-border/70 sm:p-8">
        {sent ? (
          <div role="status" className="space-y-4">
            <CheckCircle2 className="size-10 text-primary" />
            <h2 className="text-2xl font-extrabold tracking-tight">We&apos;ve received your request</h2>
            <p className="text-muted-foreground">
              We&apos;ll confirm it with you at {sent.contact} and finish deleting the data by <strong className="text-foreground">{fmt(sent.at, 30)}</strong>.
            </p>
            <div className="rounded-2xl bg-[var(--tone-mint)] p-4">
              <p className="text-sm text-muted-foreground">Your confirmation code</p>
              <p className="mt-1 font-mono text-2xl font-bold tracking-wider text-foreground">{sent.code}</p>
              <p className="mt-2 text-sm text-muted-foreground">Keep it to check the status on this page.</p>
            </div>
            <Button variant="outline" onClick={() => setSent(null)}>
              Make another request
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4" noValidate>
            <h2 className="text-2xl font-extrabold tracking-tight">Request deletion</h2>
            <div className="space-y-1.5">
              <Label htmlFor="dd-who">I am</Label>
              <NativeSelect id="dd-who" value={who} onChange={(e) => setWho(e.target.value as Who)}>
                <option value="business">A business using AutoShift</option>
                <option value="customer">A customer who chatted with a business</option>
                <option value="facebook">Someone who connected AutoShift with Facebook</option>
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dd-contact">{who === "customer" ? "Your WhatsApp number" : "Email or WhatsApp number on the account"}</Label>
              <Input id="dd-contact" value={contact} onChange={(e) => setContact(e.target.value)} placeholder={who === "customer" ? "+91 98765 43210" : "you@business.com"} />
            </div>
            {who !== "facebook" && (
              <div className="space-y-1.5">
                <Label htmlFor="dd-business">{who === "customer" ? "Business you chatted with" : "Business name"}</Label>
                <Input id="dd-business" value={business} onChange={(e) => setBusiness(e.target.value)} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="dd-details">Anything we should know (optional)</Label>
              <Textarea id="dd-details" rows={3} value={details} onChange={(e) => setDetails(e.target.value)} placeholder={who === "customer" ? "e.g. Please delete my chat history and number." : "e.g. Delete the whole workspace and our WhatsApp connection."} />
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} className="mt-0.5 accent-[var(--primary)]" />
              I understand deleted data can&apos;t be recovered.
            </label>
            {error && (
              <p role="alert" className="text-sm text-rose-700 dark:text-rose-400">
                {error}
              </p>
            )}
            <Button type="submit" className="h-11 w-full sm:w-auto">
              Send request
            </Button>
          </form>
        )}
      </section>

      <aside className="space-y-4">
        <section className="rounded-[24px] bg-card p-6 shadow-[var(--shadow-card)] ring-1 ring-border/70">
          <h2 className="text-lg font-extrabold tracking-tight">Check a request</h2>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setFound(load().find((r) => r.code === lookup.trim().toUpperCase()) ?? "none");
            }}
          >
            <Input value={lookup} onChange={(e) => setLookup(e.target.value)} placeholder="DEL-XXXX-XXXX" aria-label="Confirmation code" className="font-mono" />
            <Button type="submit" variant="outline" size="icon" aria-label="Check status">
              <Search className="size-4" />
            </Button>
          </form>
          {found === "none" && <p className="mt-3 text-sm text-muted-foreground">We couldn&apos;t find that code. Check it, or contact us below.</p>}
          {found && found !== "none" && (
            <div className="mt-4 space-y-2 text-sm">
              <p className="flex items-center gap-2 font-medium text-foreground">
                <Clock className="size-4 text-amber-500" /> In progress
              </p>
              <p className="text-muted-foreground">Received {fmt(found.at)}. Deletion completes by {fmt(found.at, 30)}.</p>
            </div>
          )}
        </section>
        <section className="rounded-[24px] bg-[var(--tone-butter)] p-6 text-sm">
          <p className="font-semibold text-foreground">Prefer to ask directly?</p>
          <p className="mt-1 text-muted-foreground">
            Email <a className="font-medium text-primary" href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a> or message us on WhatsApp at{" "}
            <a className="font-medium text-primary" href={`https://wa.me/${LEGAL.whatsapp.replace(/\D/g, "")}`}>
              {LEGAL.whatsapp}
            </a>
            .
          </p>
        </section>
      </aside>
    </div>
  );
}
