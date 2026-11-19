import { Suspense } from "react";
import { AdminLogin } from "@/components/admin/admin-login";

export default function Page() {
  // The sign-in reads ?continue=1 (back from Google), which needs a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <AdminLogin />
    </Suspense>
  );
}
