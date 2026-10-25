import { Suspense } from "react";
import { BusinessesPage } from "@/components/admin/businesses-page";

export default function Page() {
  return (
    <Suspense>
      <BusinessesPage />
    </Suspense>
  );
}
