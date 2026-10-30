'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'

import type { PhoneHealth } from '@/lib/whatsapp/phone-health'
import { cn } from '@/lib/utils'

const DOT_CLASS = {
  GREEN: 'bg-status-good',
  YELLOW: 'bg-status-warning',
  RED: 'bg-status-critical',
  UNKNOWN: 'bg-muted-foreground/60',
} as const

export function WhatsAppHealthChip() {
  const t = useTranslations('Dashboard.overview.health')
  const format = useFormatter()
  const [health, setHealth] = useState<PhoneHealth | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/whatsapp/health')
      .then((res) => (res.ok ? (res.json() as Promise<PhoneHealth>) : null))
      .then((body) => {
        if (!cancelled && body) setHealth(body)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  if (!health) return null

  const limit =
    health.limit?.kind === 'unlimited'
      ? t('unlimited')
      : health.limit
        ? t('perDay', { count: format.number(health.limit.perDay, { notation: 'compact' }) })
        : null

  const label =
    health.state === 'disconnected'
      ? t('disconnected')
      : health.state === 'unavailable'
        ? t('unavailable')
        : [health.displayPhoneNumber, t(`quality.${health.quality}`), limit].filter(Boolean).join(' · ')

  const dot =
    health.state === 'connected' ? DOT_CLASS[health.quality] : health.state === 'disconnected' ? DOT_CLASS.RED : DOT_CLASS.UNKNOWN

  return (
    <Link
      href="/settings?tab=whatsapp"
      title={t('title')}
      className="inline-flex h-10 max-w-full items-center gap-2 rounded-full px-3 text-xs font-semibold liquid-glass transition-[filter] hover:brightness-105 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <span className={cn('size-2 shrink-0 rounded-full', dot)} aria-hidden />
      <span className="truncate">{label}</span>
    </Link>
  )
}
