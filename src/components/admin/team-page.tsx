"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, Minus, ShieldCheck, ShieldOff, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import { ROLE_LABEL, type AdminRole, type AdminUser } from "@/lib/admin/data";
import { relTime } from "@/lib/admin/format";
import { CURRENT_ADMIN, act, useAdmin } from "@/lib/admin/store";
import { DataTable, Initials, PageHeader, Panel, Pill, td } from "./admin-ui";

const PERMISSIONS: { label: string; roles: AdminRole[] }[] = [
  { label: "See overview and businesses", roles: ["super_admin", "support", "finance"] },
  { label: "View as business (read-only)", roles: ["super_admin", "support"] },
  { label: "Extend trials, block businesses", roles: ["super_admin", "support"] },
  { label: "Change plans and add credits", roles: ["super_admin", "finance"] },
  { label: "Refund payments, download invoices", roles: ["super_admin", "finance"] },
  { label: "Edit prices, plans and coupons", roles: ["super_admin"] },
  { label: "Answer support tickets", roles: ["super_admin", "support"] },
  { label: "Send announcements", roles: ["super_admin", "support"] },
  { label: "Manage the admin team", roles: ["super_admin"] },
  { label: "Read the audit log", roles: ["super_admin", "finance"] },
];
const ROLES: AdminRole[] = ["super_admin", "support", "finance"];

export function TeamPage() {
  const { team } = useAdmin();
  const [inviting, setInviting] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AdminRole>("support");
  const taken = team.some((m) => m.email.toLowerCase() === email.trim().toLowerCase());
  const validEmail = /^\S+@\S+\.\S+$/.test(email.trim());

  const update = (m: AdminUser, patch: Partial<AdminUser>, action: string, details: string) => act(action, m.email, details, (s) => ({ team: s.team.map((x) => (x.id === m.id ? { ...x, ...patch } : x)) }));

  return (
    <>
      <PageHeader
        title="Admin team"
        description="People who can open this admin panel. Give each person only the access they need. 2-step sign-in is required for everyone."
        actions={
          <Button className="gap-1.5" onClick={() => setInviting(true)}>
            <UserPlus className="size-4" />
            Invite admin
          </Button>
        }
      />

      <Panel bodyClassName="px-0 pb-0">
        <DataTable head={["Person", "Role", "2-step sign-in", "Status", "Last active", ""]} className="[&_table]:min-w-[760px]">
          {team.map((m) => {
            const me = m.name === CURRENT_ADMIN.name;
            return (
              <tr key={m.id}>
                <td className={td}>
                  <div className="flex items-center gap-3">
                    <Initials name={me ? "Founder Admin" : m.name} />
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">
                        {m.name}
                        {me && <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                    </div>
                  </div>
                </td>
                <td className={td}>
                  {me ? (
                    <span className="text-sm">{ROLE_LABEL[m.role]}</span>
                  ) : (
                    <NativeSelect size="sm" className="w-36" aria-label={`Role for ${m.name}`} value={m.role} onChange={(e) => update(m, { role: e.target.value as AdminRole }, "Changed admin role", `${ROLE_LABEL[m.role]} → ${ROLE_LABEL[e.target.value as AdminRole]}`)}>
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </NativeSelect>
                  )}
                </td>
                <td className={td}>
                  {m.twoFactor ? (
                    <span className="inline-flex items-center gap-1 text-sm text-emerald-700 dark:text-emerald-400">
                      <ShieldCheck className="size-4" /> On
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-sm text-amber-700 dark:text-amber-400">
                      <ShieldOff className="size-4" /> {m.status === "invited" ? "Set up on first sign-in" : "Not set up"}
                    </span>
                  )}
                </td>
                <td className={td}>
                  <Pill tone={m.status === "active" ? "green" : m.status === "invited" ? "blue" : "gray"}>{m.status === "active" ? "Active" : m.status === "invited" ? "Invited" : "Disabled"}</Pill>
                </td>
                <td className={cn(td, "whitespace-nowrap text-muted-foreground")}>{m.lastActiveAt ? relTime(m.lastActiveAt) : "Never"}</td>
                <td className={cn(td, "text-right whitespace-nowrap")}>
                  {!me && m.status === "invited" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        act("Resent admin invite", m.email, ROLE_LABEL[m.role]);
                        toast.success(`Invite sent again to ${m.email}`);
                      }}
                    >
                      Resend
                    </Button>
                  )}
                  {!me && m.status !== "invited" && (
                    <Button size="sm" variant="ghost" className={m.status === "active" ? "text-rose-600 hover:text-rose-600" : undefined} onClick={() => update(m, { status: m.status === "active" ? "disabled" : "active" }, m.status === "active" ? "Disabled admin" : "Enabled admin", m.name)}>
                      {m.status === "active" ? "Disable" : "Enable"}
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </DataTable>
      </Panel>

      <Panel title="What each role can do" bodyClassName="px-0 pb-0">
        <DataTable head={["Permission", ...ROLES.map((r) => ROLE_LABEL[r])]}>
          {PERMISSIONS.map((p) => (
            <tr key={p.label}>
              <td className={td}>{p.label}</td>
              {ROLES.map((r) => (
                <td key={r} className={td}>
                  {p.roles.includes(r) ? <Check className="size-4 text-emerald-600" aria-label="Allowed" /> : <Minus className="size-4 text-muted-foreground/50" aria-label="Not allowed" />}
                </td>
              ))}
            </tr>
          ))}
        </DataTable>
      </Panel>

      <Dialog open={inviting} onOpenChange={setInviting}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invite an admin</DialogTitle>
            <DialogDescription>They get an email to set a password and 2-step sign-in. The link expires in 48 hours.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="inv-name">Name</Label>
              <Input id="inv-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Sara Thomas" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-email">Work email</Label>
              <Input id="inv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="sara@autoshift.app" />
              {taken && <p className="text-xs text-rose-600">This person is already on the team.</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-role">Role</Label>
              <NativeSelect id="inv-role" value={role} onChange={(e) => setRole(e.target.value as AdminRole)}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </NativeSelect>
              <p className="text-xs text-muted-foreground">{PERMISSIONS.filter((p) => p.roles.includes(role)).length} of {PERMISSIONS.length} permissions. See the table below for details.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviting(false)}>
              Cancel
            </Button>
            <Button
              disabled={!name.trim() || !validEmail || taken}
              onClick={() => {
                const m: AdminUser = { id: `adm_${Date.now()}`, name: name.trim(), email: email.trim().toLowerCase(), role, status: "invited", twoFactor: false, lastActiveAt: null };
                act("Invited admin", m.email, `Role: ${ROLE_LABEL[role]}`, (s) => ({ team: [...s.team, m] }));
                toast.success(`Invite sent to ${m.email}`);
                setName("");
                setEmail("");
                setInviting(false);
              }}
            >
              Send invite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
