import { AdminShell } from "@/components/admin/admin-shell";

export default function AdminPanelLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
