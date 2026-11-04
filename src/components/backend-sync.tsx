'use client'

import { useEffect } from 'react'

import { startWalletSync } from '@/lib/wallet/backend-sync'

/** Starts the app-wide syncs with the AutoShift backend. Does nothing without NEXT_PUBLIC_API_URL. */
export function BackendSync() {
  useEffect(() => {
    startWalletSync()
  }, [])
  return null
}
