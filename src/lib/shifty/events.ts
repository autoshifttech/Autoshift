// ============================================================
// Real moments Shifty reacts to. Any screen can call shiftySays(...) and the companion responds
// (celebrates a paid order, launches when a flow goes live, worries when the wallet runs low...).
// ============================================================

export type ShiftyEventType =
  | 'paid'        // an order or payment came in
  | 'lead'        // a new lead arrived
  | 'flow-live'   // a flow was activated
  | 'saved'       // something was saved
  | 'error'       // something went wrong that the person should look at
  | 'wallet-low'  // the wallet is running low
  | 'thinking'    // work in progress (AI writing, uploading)
  | 'done'        // that work finished

export interface ShiftyEvent {
  type: ShiftyEventType
  /** What Shifty says (already translated). */
  text?: string
}

export const SHIFTY_EVENT = 'autoshift:shifty'

export function shiftySays(type: ShiftyEventType, text?: string) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<ShiftyEvent>(SHIFTY_EVENT, { detail: { type, text } }))
}
