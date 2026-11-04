'use client'

import { useEffect } from 'react'

import { startAvailableModelsSync } from '@/lib/admin/ai-models-sync'
import { startBillingSync } from '@/lib/billing/backend-sync'
import { startWalletSync } from '@/lib/wallet/backend-sync'

/** Starts the app-wide syncs with the AutoShift backend. Does nothing without NEXT_PUBLIC_API_URL. */
export function BackendSync() {
  useEffect(() => {
    startWalletSync()
    startBillingSync()
    startAvailableModelsSync()
  }, [])
  return null
}
