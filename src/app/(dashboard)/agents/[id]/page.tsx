"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { AssistantEditor } from "@/components/assistants/assistant-editor";

export default function AssistantPage() {
  const { id } = useParams<{ id: string }>();
  // useSearchParams (the ?new=1 setup flow) needs a Suspense boundary for the build.
  return (
    <Suspense fallback={null}>
      <AssistantEditor id={id} />
    </Suspense>
  );
}
