/** Razorpay Checkout for wallet top-ups. The server creates the order and decides the amount. */
import { backend } from '@/lib/backend/client'
import { loadWallet } from './backend-sync'
import { loadRazorpay } from '@/lib/razorpay'

interface Order {
  razorpay_order_id: string
  key_id: string
  currency: string
  amount_paise: number
}

interface CheckoutResponse {
  razorpay_order_id: string
  razorpay_payment_id: string
  razorpay_signature: string
}

export type PayResult = { status: 'paid'; balancePaise: number } | { status: 'cancelled' }

/** Opens Razorpay, then asks the server to verify the signature and credit the wallet. */
export async function payTopUp(amountInr: number, prefill: { name?: string; email?: string } = {}): Promise<PayResult> {
  const order = await backend<Order>('/v1/wallet/topups', { method: 'POST', body: { amount_inr: amountInr } })
  const Razorpay = await loadRazorpay()
  const paid = await new Promise<CheckoutResponse | null>((resolve, reject) => {
    const rzp = new Razorpay({
      key: order.key_id,
      order_id: order.razorpay_order_id,
      amount: order.amount_paise,
      currency: order.currency,
      name: 'AutoShift',
      description: 'Wallet credits',
      prefill,
      theme: { color: '#1E4C41' },
      handler: (r: CheckoutResponse) => resolve(r),
      modal: { ondismiss: () => resolve(null) },
    })
    rzp.on('payment.failed', (r) => reject(new Error(r.error?.description || 'The payment did not go through.')))
    rzp.open()
  })
  if (!paid) return { status: 'cancelled' }
  const { balance_paise } = await backend<{ balance_paise: number }>('/v1/wallet/topups/verify', { method: 'POST', body: paid })
  await loadWallet()
  return { status: 'paid', balancePaise: balance_paise }
}
