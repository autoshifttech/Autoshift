import { useEffect } from 'react'
import { brand } from '../content/brand'

export function usePageTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} — ${brand.name}` : `${brand.name} — ${brand.tagline}`
  }, [title])
}
