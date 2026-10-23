import {
  Bot,
  Braces,
  Inbox,
  Megaphone,
  MessageSquareText,
  PhoneCall,
  QrCode,
  Tags,
  Type,
  Link2,
  type LucideIcon,
} from 'lucide-react'

export type NavLink = { label: string; to: string; description?: string; icon?: LucideIcon }
export type NavGroup = { label: string; items: NavLink[] }

export const productLinks: NavLink[] = [
  { label: 'AI chatbot', to: '/#ai-chatbot', description: 'Replies that understand text, voice notes and images', icon: Bot },
  { label: 'Lead segmentation', to: '/#segmentation', description: 'AI tags every chat and extracts the details', icon: Tags },
  { label: 'Campaigns', to: '/#campaigns', description: 'Broadcasts, drips and scheduled follow-ups', icon: Megaphone },
  { label: 'Shared inbox', to: '/#inbox', description: 'Every channel and teammate in one place', icon: Inbox },
  { label: 'AI calling & comment-to-DM', to: '/#automations', description: 'Voice calls and Instagram comment replies', icon: PhoneCall },
  { label: 'Integrations & API', to: '/#integrations', description: 'Store, CRM, webhooks and REST API', icon: Braces },
]

export const toolLinks: NavLink[] = [
  { label: 'WhatsApp link generator', to: '/tools/whatsapp-link-generator', description: 'wa.me links with a prefilled message', icon: Link2 },
  { label: 'WhatsApp QR code generator', to: '/tools/whatsapp-qr-code-generator', description: 'Branded QR codes in PNG or SVG', icon: QrCode },
  { label: 'WhatsApp text formatter', to: '/tools/whatsapp-text-formatter', description: 'Bold, italic, lists and a live preview', icon: Type },
  { label: 'WhatsApp chat button', to: '/tools/whatsapp-chat-button', description: 'A floating chat widget for your website', icon: MessageSquareText },
]

export const primaryLinks: NavLink[] = [
  { label: 'Pricing', to: '/pricing' },
  { label: 'Release notes', to: '/release-notes' },
  { label: 'Contact', to: '/contact' },
]

export const footerGroups: NavGroup[] = [
  { label: 'Product', items: productLinks.map(({ label, to }) => ({ label, to })) },
  { label: 'Free tools', items: toolLinks.map(({ label, to }) => ({ label, to })) },
  {
    label: 'Company',
    items: [
      { label: 'Pricing', to: '/pricing' },
      { label: 'Release notes', to: '/release-notes' },
      { label: 'Contact', to: '/contact' },
      { label: 'Sign in', to: '/login' },
    ],
  },
  {
    label: 'Legal',
    items: [
      { label: 'Terms of service', to: '/terms' },
      { label: 'Privacy policy', to: '/privacy' },
    ],
  },
]
