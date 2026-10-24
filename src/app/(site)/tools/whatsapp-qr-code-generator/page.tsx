import type { Metadata } from "next";
import { QrGenerator } from "@/components/site/tools/qr-generator";

export const metadata: Metadata = {
  title: "Free WhatsApp QR code generator",
  description: "Make a branded WhatsApp QR code with your colours and logo. Download PNG or SVG, no watermark.",
};

export default function Page() {
  return <QrGenerator />;
}
