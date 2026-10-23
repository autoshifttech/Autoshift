/** Single place to rebrand the site. */
export const brand = {
  name: 'Autoshift',
  tagline: 'AI conversations on WhatsApp, Instagram & Messenger',
  description:
    'Autoshift answers, qualifies and follows up with customers on WhatsApp, Instagram and Messenger — with AI that holds real conversations, campaigns that reach the right people, and one shared inbox for your team.',
  contactEmail: import.meta.env.VITE_CONTACT_EMAIL || '',
  appPath: '/app',
  loginPath: '/login',
  signupPath: '/login?mode=signup',
} as const
