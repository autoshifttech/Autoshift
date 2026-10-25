import { Suspense } from "react";
import { PaymentsPage } from "@/components/admin/payments-page";

export default function Page() {
  return (
    <Suspense>
      <PaymentsPage />
    </Suspense>
  );
}
