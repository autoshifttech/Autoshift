import { BusinessDetail } from "@/components/admin/business-detail";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BusinessDetail id={id} />;
}
