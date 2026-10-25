"use client";

import { useParams } from "next/navigation";
import { DripBuilder } from "@/components/drips/drip-builder";

export default function DripPage() {
  const { id } = useParams<{ id: string }>();
  return <DripBuilder id={id} />;
}
