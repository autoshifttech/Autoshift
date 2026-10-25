import { createStore, useStore } from './store'

/** Business types offered in onboarding; each one seeds AI, lead and booking presets. */
export const INDUSTRIES = ['clinic', 'salon', 'real_estate', 'retail', 'education', 'restaurant', 'services', 'other'] as const
export type Industry = (typeof INDUSTRIES)[number]

export const FEATURES = ['ai_support', 'lead_capture', 'booking'] as const
export type Feature = (typeof FEATURES)[number]

export type WhatsAppStatus = 'not_started' | 'connected' | 'skipped'

export interface BusinessDetails {
  name: string
  industry: Industry | ''
  country: string
  timeZone: string
  currency: string
  displayName: string
  website: string
}

export interface ConnectedNumber {
  displayPhoneNumber: string
  verifiedName: string
  quality: 'GREEN' | 'YELLOW' | 'RED'
  wabaId: string
  phoneNumberId: string
}

export interface WorkspaceSetup {
  /** Furthest onboarding step reached (0–4; 4 = finished). */
  step: number
  business: BusinessDetails
  whatsapp: WhatsAppStatus
  number: ConnectedNumber | null
  features: Feature[]
  completedAt: string | null
}

export const COUNTRIES: { code: string; timeZone: string; currency: string }[] = [
  { code: 'IN', timeZone: 'Asia/Kolkata', currency: 'INR' },
  { code: 'AE', timeZone: 'Asia/Dubai', currency: 'AED' },
  { code: 'US', timeZone: 'America/New_York', currency: 'USD' },
  { code: 'GB', timeZone: 'Europe/London', currency: 'GBP' },
  { code: 'SG', timeZone: 'Asia/Singapore', currency: 'SGD' },
  { code: 'BR', timeZone: 'America/Sao_Paulo', currency: 'BRL' },
  { code: 'ES', timeZone: 'Europe/Madrid', currency: 'EUR' },
  { code: 'KR', timeZone: 'Asia/Seoul', currency: 'KRW' },
]

export const TIME_ZONES = [...new Set(COUNTRIES.map((c) => c.timeZone)), 'UTC']
export const CURRENCIES = [...new Set(COUNTRIES.map((c) => c.currency))]

export function emptySetup(): WorkspaceSetup {
  return {
    step: 0,
    business: { name: '', industry: '', country: 'IN', timeZone: 'Asia/Kolkata', currency: 'INR', displayName: '', website: '' },
    whatsapp: 'not_started',
    number: null,
    features: ['ai_support', 'lead_capture', 'booking'],
    completedAt: null,
  }
}

/** Fields that must be filled before leaving step 1. */
export function businessErrors(b: BusinessDetails): (keyof BusinessDetails)[] {
  const errors: (keyof BusinessDetails)[] = []
  if (!b.name.trim()) errors.push('name')
  if (!b.industry) errors.push('industry')
  if (!b.displayName.trim()) errors.push('displayName')
  if (b.website.trim() && !/^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(b.website.trim())) errors.push('website')
  return errors
}

export const setupStore = createStore(emptySetup, 'autoshift.setup')

export function useSetup(): WorkspaceSetup {
  return useStore(setupStore, SERVER_SETUP)
}

const SERVER_SETUP = emptySetup()

/** Sample number the simulated Embedded Signup "connects". */
export function sampleConnectedNumber(displayName: string): ConnectedNumber {
  return {
    displayPhoneNumber: '+91 98765 43210',
    verifiedName: displayName || 'Your business',
    quality: 'GREEN',
    wabaId: '1029384756473829',
    phoneNumberId: '1122334455667788',
  }
}
