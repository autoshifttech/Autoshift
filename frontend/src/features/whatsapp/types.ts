export type ConnectionStatus = 'pending' | 'connected' | 'subscribe_failed' | 'registration_failed' | 'disconnected' | 'restricted'

export type WhatsAppAccount = {
  waba_id: string
  phone_number_id: string
  onboarding_type: 'cloud' | 'coexistence'
  display_phone_number: string | null
  verified_name: string | null
  quality_rating: string | null
  number_status: string | null
  code_verification_status: string | null
  name_status: string | null
  connection_status: ConnectionStatus
  webhooks_subscribed: boolean
  phone_registered: boolean
  last_error: { step?: string; message?: string; event?: string; code?: number } | null
  connected_at: string | null
  last_webhook_at: string | null
  updated_at: string
}

export const statusLabel: Record<ConnectionStatus, { label: string; tone: string }> = {
  connected: { label: 'Connected', tone: 'bg-brand-100 text-brand-900' },
  pending: { label: 'Finishing setup', tone: 'bg-sky-100 text-sky-800' },
  subscribe_failed: { label: 'Webhook subscription failed', tone: 'bg-red-100 text-red-800' },
  registration_failed: { label: 'Number registration failed', tone: 'bg-red-100 text-red-800' },
  restricted: { label: 'Restricted by Meta', tone: 'bg-amber-100 text-amber-900' },
  disconnected: { label: 'Disconnected', tone: 'bg-slate-100 text-slate-700' },
}
