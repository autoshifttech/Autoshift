"use client";

import { useState } from "react";
import { toast } from "@/lib/toast";
import { Crown, Plus, Trash2, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { PLANS } from "@/lib/billing/plans";
import type { Business } from "@/lib/admin/data";
import { newMember, saveTeam, teamOf, useAdmin, type BusinessMember, type MemberRole } from "@/lib/admin/store";
import { useAdminT } from "@/lib/admin/strings";
import { EmptyState, Initials, Panel } from "./admin-ui";

const ROLES: MemberRole[] = ["admin", "agent", "viewer"];
const EMAIL = /^\S+@\S+\.\S+$/;

/** The people on one business: an admin can add, change the role of, and remove them. */
export function BusinessTeam({ business }: { business: Business }) {
  const tr = useAdminT();
  const state = useAdmin();
  const team = teamOf(state, business);
  const seats = PLANS[business.plan].seats;
  const full = seats !== null && team.length >= seats;
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<BusinessMember | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>("agent");
  const [tried, setTried] = useState(false);

  const nameErr = name.trim() ? "" : tr("Enter a name");
  const emailErr = !EMAIL.test(email.trim()) ? tr("Enter a valid email") : team.some((m) => m.email.toLowerCase() === email.trim().toLowerCase()) ? tr("That email is already on this team") : "";

  const reset = () => {
    setName("");
    setEmail("");
    setRole("agent");
    setTried(false);
  };

  const add = () => {
    setTried(true);
    if (nameErr || emailErr) return;
    const member = newMember(name.trim(), email.trim().toLowerCase(), role);
    saveTeam(business, [...team, member], "Added team member", `${member.email} as ${role}`);
    toast.success(tr("Team member added"));
    reset();
    setAdding(false);
  };

  const changeRole = (m: BusinessMember, next: MemberRole) => {
    saveTeam(business, team.map((x) => (x.id === m.id ? { ...x, role: next } : x)), "Changed team role", `${m.email}: ${m.role} → ${next}`);
    toast.success(tr("Role updated"));
  };

  return (
    <Panel
      title="Team"
      description={`${team.length} / ${seats ?? tr("unlimited")} ${tr("seats used")} · ${business.plan.charAt(0).toUpperCase() + business.plan.slice(1)}`}
      actions={
        <Button size="sm" onClick={() => setAdding(true)} disabled={full} className="min-h-10 sm:min-h-0">
          <UserPlus className="mr-1.5 size-4" /> {tr("Add member")}
        </Button>
      }
      bodyClassName="px-0 pb-0"
    >
      {full && <p className="mx-5 mb-3 rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">{tr("All seats are used. Change the plan to add more people.")}</p>}
      {team.length === 0 ? (
        <EmptyState icon={UserPlus} title="No team members" />
      ) : (
        <ul className="divide-y divide-border">
          {team.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <Initials name={m.name} className="size-9 text-xs" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{m.name}</p>
                <p className="truncate text-xs text-muted-foreground">{m.email}</p>
              </div>
              {m.role === "owner" ? (
                <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-800 dark:text-amber-300">
                  <Crown className="size-3.5" /> {tr("Owner")}
                </span>
              ) : (
                <>
                  <NativeSelect aria-label={`${tr("Role")}: ${m.name}`} value={m.role} onChange={(e) => changeRole(m, e.target.value as MemberRole)} className="w-32">
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {tr(r.charAt(0).toUpperCase() + r.slice(1))}
                      </option>
                    ))}
                  </NativeSelect>
                  <Button variant="ghost" size="icon" aria-label={`${tr("Remove")} ${m.name}`} onClick={() => setRemoving(m)} className="size-10 text-muted-foreground hover:text-destructive">
                    <Trash2 className="size-4" />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={adding}
        onOpenChange={(o) => {
          if (!o) reset();
          setAdding(o);
        }}
      >
        <DialogContent className="rounded-3xl sm:max-w-md">
          <DialogHeader className="pr-8">
            <DialogTitle>{tr("Add a team member")}</DialogTitle>
            <DialogDescription>{tr("They get a login on this business with the role you choose.")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="tm-name">{tr("Name")}</Label>
            <Input id="tm-name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={tried && !!nameErr} autoComplete="off" />
            {tried && nameErr && <p role="alert" className="text-xs font-medium text-destructive">{nameErr}</p>}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="tm-email">{tr("Email")}</Label>
            <Input id="tm-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={tried && !!emailErr} autoComplete="off" />
            {tried && emailErr && <p role="alert" className="text-xs font-medium text-destructive">{emailErr}</p>}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="tm-role">{tr("Role")}</Label>
            <NativeSelect id="tm-role" value={role} onChange={(e) => setRole(e.target.value as MemberRole)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {tr(r.charAt(0).toUpperCase() + r.slice(1))}
                </option>
              ))}
            </NativeSelect>
          </div>
          <DialogFooter className="mx-0 mb-0 rounded-b-3xl">
            <Button variant="outline" onClick={() => setAdding(false)} className="min-h-10">
              {tr("Cancel")}
            </Button>
            <Button onClick={add} className="min-h-10">
              <Plus className="mr-1.5 size-4" /> {tr("Add member")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`${tr("Remove")} ${removing?.name ?? ""}?`}
        description={tr("They lose access to this business straight away.")}
        confirmLabel={tr("Remove")}
        cancelLabel={tr("Cancel")}
        onConfirm={() => {
          if (removing) {
            saveTeam(business, team.filter((x) => x.id !== removing.id), "Removed team member", removing.email);
            toast.success(tr("Team member removed"));
          }
          setRemoving(null);
        }}
      />
    </Panel>
  );
}
