/** Loads Razorpay Checkout once. */
export interface RazorpayInstance {
  open(): void
  on(event: string, cb: (r: { error?: { description?: string } }) => void): void
}
export type RazorpayConstructor = new (opts: Record<string, unknown>) => RazorpayInstance
declare global {
  interface Window {
    Razorpay?: RazorpayConstructor
  }
}

const SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js'

export function loadRazorpay(): Promise<RazorpayConstructor> {
  if (window.Razorpay) return Promise.resolve(window.Razorpay)
  return new Promise((resolve, reject) => {
    const el = document.createElement('script')
    el.src = SCRIPT
    el.onload = () => (window.Razorpay ? resolve(window.Razorpay) : reject(new Error('The payment window did not start.')))
    el.onerror = () => reject(new Error('Could not load the payment window. Check your connection.'))
    document.head.appendChild(el)
  })
}
