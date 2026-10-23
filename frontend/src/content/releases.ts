/** Changelog entries, newest first. Add a new object to publish a release note. */
export type ReleaseCategory = 'New' | 'Improved' | 'Fixed'
export type Release = { date: string; title: string; category: ReleaseCategory; items: string[] }

export const releases: Release[] = [
  {
    date: '2026-10-23',
    title: 'Connect WhatsApp with Embedded Signup',
    category: 'New',
    items: [
      'Workspace owners and admins can connect a WhatsApp Business number from Settings → WhatsApp in a few clicks.',
      'Numbers already on the WhatsApp Business app can be connected without moving them (coexistence).',
      'Settings shows the connected number, verified name, quality rating and webhook health.',
    ],
  },
  {
    date: '2026-10-23',
    title: 'Inbox receives WhatsApp messages and delivery statuses',
    category: 'New',
    items: ['Incoming WhatsApp messages are saved to your workspace and listed in the inbox.', 'Sent, delivered, read and failed statuses are tracked per message.'],
  },
  {
    date: '2026-10-23',
    title: 'Free WhatsApp tools',
    category: 'New',
    items: ['Link generator, QR code generator, text formatter and chat button — all free, no sign-up.'],
  },
]
