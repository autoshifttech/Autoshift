"use client";

import { useParams } from "next/navigation";
import { AssistantEditor } from "@/components/assistants/assistant-editor";

export default function AssistantPage() {
  const { id } = useParams<{ id: string }>();
  return <AssistantEditor id={id} />;
}
