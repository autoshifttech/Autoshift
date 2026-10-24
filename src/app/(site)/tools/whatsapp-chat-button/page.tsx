import type { Metadata } from "next";
import { ChatButton } from "@/components/site/tools/chat-button";

export const metadata: Metadata = {
  title: "WhatsApp chat button for your website",
  description: "Generate a floating Chat on WhatsApp button for any website with one copy-paste snippet.",
};

export default function Page() {
  return <ChatButton />;
}
