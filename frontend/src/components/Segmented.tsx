import { cn } from '../lib/cn'

type Option<T extends string> = { value: T; label: string; hint?: string }

/** Accessible single-choice toggle (radio group semantics). */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: {
  label: string
  options: Option<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex flex-wrap justify-center gap-1 rounded-full border border-line bg-white p-1', className)}>
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors',
              active ? 'bg-ink text-white' : 'text-ink-soft hover:bg-surface hover:text-ink',
            )}
          >
            {option.label}
            {option.hint && <span className={cn('ml-1.5 text-xs', active ? 'text-brand-200' : 'text-brand-700')}>{option.hint}</span>}
          </button>
        )
      })}
    </div>
  )
}
