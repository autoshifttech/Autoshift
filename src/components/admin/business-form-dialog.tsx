"use client";

import { useState } from "react";
import { toast } from "@/lib/toast";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { PLANS, PLAN_IDS, type PlanId } from "@/lib/billing/plans";
import { INDUSTRY_LABEL, type Business } from "@/lib/admin/data";
import { createBusiness, updateBusiness } from "@/lib/admin/store";
import { useAdminT } from "@/lib/admin/strings";

const EMAIL = /^\S+@\S+\.\S+$/;

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && (
        <p role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/** Create a business (no `business`) or edit one's profile and owner. */
export function BusinessFormDialog({ open, onOpenChange, business, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; business?: Business; onCreated?: (id: string) => void }) {
  const tr = useAdminT();
  const editing = !!business;
  const [name, setName] = useState(business?.name ?? "");
  const [industry, setIndustry] = useState(business?.industry ?? "services");
  const [city, setCity] = useState(business?.city ?? "");
  const [ownerName, setOwnerName] = useState(business?.owner.name ?? "");
  const [email, setEmail] = useState(business?.owner.email ?? "");
  const [phone, setPhone] = useState(business?.owner.phone ?? "");
  const [plan, setPlan] = useState<PlanId>(business?.plan ?? "starter");
  const [tried, setTried] = useState(false);

  const errors = {
    name: name.trim() ? "" : tr("Enter the business name"),
    ownerName: ownerName.trim() ? "" : tr("Enter the owner's name"),
    email: EMAIL.test(email.trim()) ? "" : tr("Enter a valid email"),
  };
  const invalid = Object.values(errors).some(Boolean);

  const submit = () => {
    setTried(true);
    if (invalid) return;
    const owner = { name: ownerName.trim(), email: email.trim().toLowerCase(), phone: phone.trim() };
    if (editing && business) {
      updateBusiness(business, "Edited business", `${business.name} → ${name.trim()} · owner ${owner.email}`, (o) => ({ ...o, name: name.trim(), industry, city: city.trim(), owner }));
      toast.success(tr("Business updated"));
    } else {
      const id = createBusiness({ name: name.trim(), industry, city: city.trim(), owner, plan });
      toast.success(tr("Business created"));
      onCreated?.(id);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(90dvh,42rem)] flex-col gap-4 overflow-y-auto rounded-3xl sm:max-w-lg">
        <DialogHeader className="pr-8">
          <DialogTitle>{editing ? tr("Edit business") : tr("Add a business")}</DialogTitle>
          <DialogDescription>{editing ? tr("Change the workspace details and the owner's account.") : tr("Creates a workspace on a 14-day trial and an owner account for it.")}</DialogDescription>
        </DialogHeader>

        <Field id="bf-name" label={tr("Business name")} error={tried ? errors.name : ""}>
          <Input id="bf-name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={tried && !!errors.name} autoComplete="off" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="bf-industry" label={tr("Industry")}>
            <NativeSelect id="bf-industry" value={industry} onChange={(e) => setIndustry(e.target.value)}>
              {Object.entries(INDUSTRY_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {tr(v)}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field id="bf-city" label={tr("City")}>
            <Input id="bf-city" value={city} onChange={(e) => setCity(e.target.value)} autoComplete="off" />
          </Field>
        </div>

        <div className="rounded-2xl border border-border p-4">
          <p className="mb-3 text-sm font-semibold text-foreground">{tr("Owner account")}</p>
          <div className="grid gap-4">
            <Field id="bf-owner" label={tr("Owner name")} error={tried ? errors.ownerName : ""}>
              <Input id="bf-owner" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} aria-invalid={tried && !!errors.ownerName} autoComplete="off" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="bf-email" label={tr("Email")} error={tried ? errors.email : ""}>
                <Input id="bf-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={tried && !!errors.email} autoComplete="off" />
              </Field>
              <Field id="bf-phone" label={tr("Phone")}>
                <Input id="bf-phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" autoComplete="off" />
              </Field>
            </div>
          </div>
        </div>

        {!editing && (
          <Field id="bf-plan" label={tr("Plan after the trial")}>
            <NativeSelect id="bf-plan" value={plan} onChange={(e) => setPlan(e.target.value as PlanId)}>
              {PLAN_IDS.map((p) => (
                <option key={p} value={p}>
                  {p.charAt(0).toUpperCase() + p.slice(1)} · {PLANS[p].seats ?? tr("unlimited")} {tr("seats")}
                </option>
              ))}
            </NativeSelect>
          </Field>
        )}

        <DialogFooter className="mx-0 mb-0 rounded-b-3xl">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="min-h-10">
            {tr("Cancel")}
          </Button>
          <Button onClick={submit} className="min-h-10">
            {editing ? tr("Save changes") : tr("Create business")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
