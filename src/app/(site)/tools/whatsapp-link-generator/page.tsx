import type { Metadata } from "next";
import { LinkGenerator } from "@/components/site/tools/link-generator";

export const metadata: Metadata = {
  title: "Free WhatsApp link generator",
  description: "Create a free wa.me click-to-chat link with a prefilled message and a QR code.",
};

export default function Page() {
  return <LinkGenerator />;
}
