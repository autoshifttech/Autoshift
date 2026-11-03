import { redirect } from "next/navigation";

/** Moved into Settings. */
export default function Page() {
  redirect("/settings?tab=files");
}
