import { WhatsAppSettings } from '../../features/whatsapp/WhatsAppSettings'
import { usePageTitle } from '../../hooks/usePageTitle'

export default function WhatsAppSettingsPage() {
  usePageTitle('WhatsApp settings')
  return (
    <div className="mx-auto max-w-4xl">
      <p className="text-sm font-semibold text-muted">Settings</p>
      <h1 className="mt-1 text-2xl font-extrabold tracking-tight">WhatsApp</h1>
      <p className="mt-1 mb-8 text-sm text-ink-soft">Connect your WhatsApp Business number and check its status.</p>
      <WhatsAppSettings />
    </div>
  )
}
