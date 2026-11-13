/**
 * WhatsApp's 24-hour customer service window.
 *
 * Meta only accepts free-form messages (text, media) within 24 hours of the customer's last
 * message; outside it, only an approved template goes through. The inbox normally locks the
 * composer when the window is closed.
 *
 * TEMPORARILY OFF: the lock is disabled while incoming-message webhooks are being fixed, so the
 * team can type in any chat. Meta still refuses free-form messages outside the window (error
 * 131047), and that error shows on the message. Set NEXT_PUBLIC_ENFORCE_WHATSAPP_WINDOW=true
 * (and ENFORCE_WHATSAPP_WINDOW=true on the backend) to turn the lock back on.
 */
export const ENFORCE_WHATSAPP_WINDOW = process.env.NEXT_PUBLIC_ENFORCE_WHATSAPP_WINDOW === 'true'
