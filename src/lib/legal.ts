/**
 * Details shown on the privacy policy, terms and data deletion pages.
 * Before submitting the Meta app for review, replace these with the
 * registered company name and address and an inbox someone reads.
 */
export const LEGAL = {
  product: 'AutoShift',
  /** Registered legal entity that runs AutoShift. */
  company: 'AutoShift',
  address: 'India',
  email: 'privacy@autoshift.app',
  whatsapp: '+91 93441 62278',
  /** Named under India's Digital Personal Data Protection Act, 2023. */
  grievanceOfficer: 'Grievance Officer, AutoShift',
  effective: '25 October 2026',
  /** Days before a deleted workspace's data is erased for good. */
  deletionGraceDays: 30,
} as const

export const waLink = (number: string) => `https://wa.me/${number.replace(/\D/g, '')}`
