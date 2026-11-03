import { redirect } from "next/navigation";

/** Moved into Settings; keeps the "new request" shortcut working. */
export default async function Page({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const { new: isNew } = await searchParams;
  redirect(isNew === "1" ? "/settings?tab=support&new=1" : "/settings?tab=support");
}
