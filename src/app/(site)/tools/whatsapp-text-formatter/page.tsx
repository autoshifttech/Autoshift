import type { Metadata } from "next";
import { TextFormatter } from "@/components/site/tools/text-formatter";

export const metadata: Metadata = {
  title: "WhatsApp text formatter",
  description: "Format WhatsApp messages with bold, italic, strikethrough, monospace and lists, with a live preview.",
};

export default function Page() {
  return <TextFormatter />;
}
