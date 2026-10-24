import { Link2, MessageSquareText, QrCode, Type, type LucideIcon } from "lucide-react";

export type ToolEntry = { slug: string; title: string; description: string; icon: LucideIcon; tone: "mint" | "sky" | "peach" | "lilac" };

export const TOOLS: ToolEntry[] = [
  {
    slug: "whatsapp-link-generator",
    title: "WhatsApp link generator",
    description: "A wa.me click-to-chat link with a prefilled message, plus a QR code.",
    icon: Link2,
    tone: "mint",
  },
  {
    slug: "whatsapp-qr-code-generator",
    title: "WhatsApp QR code generator",
    description: "A scannable code in your colours, with your logo, in PNG or SVG.",
    icon: QrCode,
    tone: "sky",
  },
  {
    slug: "whatsapp-text-formatter",
    title: "WhatsApp text formatter",
    description: "Bold, italic, strikethrough, monospace and lists, with a live preview.",
    icon: Type,
    tone: "peach",
  },
  {
    slug: "whatsapp-chat-button",
    title: "WhatsApp chat button",
    description: "A floating “Chat on WhatsApp” button for any website.",
    icon: MessageSquareText,
    tone: "lilac",
  },
];
