// AutoShift's own WhatsApp templates (order updates, appointment reminders) for this business:
// used only when the customer's 24-hour window is closed. Meta reviews them after one click.
import { backend } from '@/lib/backend/client'

export type SystemTemplateKind = 'order' | 'reminder'
export type SystemTemplateStatus = 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED' | string

export interface SystemTemplateInfo {
  name: string
  status: SystemTemplateStatus
  language: string | null
  rejection_reason: string | null
}

export type SystemTemplates = Record<SystemTemplateKind, SystemTemplateInfo>

export const getSystemTemplates = () => backend<SystemTemplates>('/v1/system-templates')
export const submitSystemTemplate = (kind: SystemTemplateKind, language: string) =>
  backend<SystemTemplates>(`/v1/system-templates/${kind}`, { method: 'POST', body: { language } })
export const refreshSystemTemplates = () => backend<SystemTemplates>('/v1/system-templates/refresh', { method: 'POST' })
