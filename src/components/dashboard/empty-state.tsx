import { BarChart3 } from 'lucide-react'
import type { ComponentType } from 'react'
import { cn } from '@/lib/utils'
import { EmptyPanel } from '@/components/ui/empty-panel'

import { useTranslations } from 'next-intl'

/**
 * Shared empty-state panel for charts that can't render meaningfully
 * without a minimum amount of data. Kept minimal and uniform so the
 * three empty states on the dashboard don't each feel like a
 * different widget.
 */
export function EmptyState({
  title,
  hint,
  icon: Icon = BarChart3,
  className,
}: {
  title?: string
  hint?: string
  icon?: ComponentType<{ className?: string }>
  className?: string
}) {
  const t = useTranslations('Dashboard.emptyState')
  const defaultTitle = t('title')
  
  return (
    <EmptyPanel
      icon={Icon}
      title={title || defaultTitle}
      description={hint}
      className={cn('h-full min-h-40 py-6', className)}
    />
  )
}
