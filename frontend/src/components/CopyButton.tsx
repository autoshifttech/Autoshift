import { Check, Copy } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from './Button'

export function CopyButton({ value, label = 'Copy', disabled }: { value: string; label?: string; disabled?: boolean }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')

  useEffect(() => {
    if (state === 'idle') return
    const timer = window.setTimeout(() => setState('idle'), 2000)
    return () => window.clearTimeout(timer)
  }, [state])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setState('copied')
    } catch {
      setState('failed')
    }
  }

  return (
    <Button variant="secondary" onClick={copy} disabled={disabled} aria-live="polite">
      {state === 'copied' ? <Check aria-hidden className="size-4 text-brand-600" /> : <Copy aria-hidden className="size-4" />}
      {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed — select and copy manually' : label}
    </Button>
  )
}
