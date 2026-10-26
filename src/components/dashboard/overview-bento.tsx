'use client'

import Link from 'next/link'
import { ArrowRight, Plus, Wallet } from 'lucide-react'
import { useFormatter, useLocale, useTranslations } from 'next-intl'

import { RollingNumber } from '@/components/motion/rolling-number'
import { cn } from '@/lib/utils'
import {
  bucketDate,
  minutesBetween,
  ratio,
  type DashboardOverview,
} from '@/lib/dashboard/overview'
import { balanceOf, formatMoney, runway, useWallet } from '@/lib/wallet/model'
import { MessageVolumeCard } from './message-volume-card'
import { Skeleton } from './skeleton'
import { useFormatDuration } from './use-format-duration'

const MAX_BARS = 10

/** Sums the series into at most MAX_BARS bars, oldest first. */
function groupBars(data: DashboardOverview) {
  const series = data.volume.series
  const size = Math.max(1, Math.ceil(series.length / MAX_BARS))
  const bars: { t: string; total: number }[] = []
  for (let i = 0; i < series.length; i += size) {
    const chunk = series.slice(i, i + size)
    bars.push({ t: chunk[0].t, total: chunk.reduce((s, p) => s + p.incoming + p.outgoing, 0) })
  }
  return bars
}

/** A row of thin bars; the first `pct`% are filled, the rest striped. */
function Ticks({ pct, className }: { pct: number; className?: string }) {
  const n = 44
  return (
    <div className="mt-auto flex h-8 gap-[3px]" aria-hidden>
      {Array.from({ length: n }, (_, i) => (
        <i
          key={i}
          className={cn('animate-grow-y flex-1 rounded-[2px]', i / n < pct / 100 ? className ?? 'bg-primary' : 'hatch')}
          style={{ animationDelay: `${i * 10}ms` }}
        />
      ))}
    </div>
  )
}

function MiniCard({ title, note, children, href }: { title: React.ReactNode; note?: React.ReactNode; children: React.ReactNode; href?: string }) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-bold">{title}</h3>
        {note}
      </div>
      {children}
    </>
  )
  const cls = 'flex min-h-[170px] flex-col rounded-[20px] border border-border bg-card p-5 shadow-[var(--shadow-card)] transition-transform'
  return href ? (
    <Link href={href} className={cn(cls, 'hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none')}>
      {body}
    </Link>
  ) : (
    <section className={cls}>{body}</section>
  )
}

function Big({ value, unit, children }: { value: React.ReactNode; unit?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="mt-3 mb-4 flex flex-wrap items-baseline gap-1.5">
      <b className="text-[32px] leading-none font-bold tracking-[-0.04em] tabular-nums"><RollingNumber>{value}</RollingNumber></b>
      {unit && <span className="text-sm font-semibold text-muted-foreground">{unit}</span>}
      {children}
    </div>
  )
}

/** Donut of who sent the replies in this period: AI assistants and teammates. */
function WhoReplied({ data }: { data: DashboardOverview }) {
  const t = useTranslations('Dashboard.overview.bento')
  const format = useFormatter()
  const team = [...data.replies.team].sort((a, b) => b.replies - a.replies)
  const parts = [
    { label: t('ai'), value: data.replies.ai.replies, color: 'var(--chart-1)' },
    ...team.slice(0, 2).map((m, i) => ({ label: m.name ?? t('teammate'), value: m.replies, color: i ? 'var(--chart-3)' : 'var(--chart-5)' })),
    { label: t('others'), value: team.slice(2).reduce((s, m) => s + m.replies, 0), color: 'var(--chart-2)' },
  ].filter((p) => p.value > 0)
  const total = parts.reduce((s, p) => s + p.value, 0)
  const r = 52
  const c = 2 * Math.PI * r
  let offset = 0

  return (
    <section className="flex flex-col rounded-[20px] border border-border bg-card p-5 shadow-[var(--shadow-card)]">
      <h3 className="text-sm font-bold">{t('whoReplied')}</h3>
      {total === 0 ? (
        <p className="my-auto py-8 text-center text-sm text-muted-foreground">{t('noReplies')}</p>
      ) : (
        <>
          <div className="relative mx-auto my-4 size-36">
            <svg viewBox="0 0 140 140" className="size-full -rotate-90" role="img" aria-label={t('whoReplied')}>
              {parts.map((p) => {
                const len = Math.max(0, (p.value / total) * c - (parts.length > 1 ? 6 : 0))
                const el = (
                  <circle key={p.label} cx="70" cy="70" r={r} fill="none" stroke={p.color} strokeWidth="12" strokeLinecap="round" strokeDasharray={`${len} ${c}`} strokeDashoffset={-offset} className="animate-ring">
                    <title>{`${p.label}: ${format.number(p.value)}`}</title>
                  </circle>
                )
                offset += (p.value / total) * c
                return el
              })}
            </svg>
            <div className="absolute inset-0 grid place-items-center text-center">
              <div>
                <b className="block text-xl tracking-[-0.03em] tabular-nums">{format.number(total, { notation: 'compact' })}</b>
                <span className="text-[11px] text-muted-foreground">{t('replies')}</span>
              </div>
            </div>
          </div>
          <ul className="space-y-1.5 text-sm">
            {parts.map((p) => (
              <li key={p.label} className="flex items-center gap-2.5">
                <i className="size-2.5 shrink-0 rounded-full" style={{ background: p.color }} />
                <span className="min-w-0 flex-1 truncate">{p.label}</span>
                <b className="tabular-nums">{format.number(p.value / total, { style: 'percent', maximumFractionDigits: 0 })}</b>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

/**
 * The top of the overview: a big messages card, three small meters,
 * the message volume chart on a dark card and who replied.
 */
export function OverviewBento({ data, now }: { data: DashboardOverview | null; now: number }) {
  const t = useTranslations('Dashboard.overview.bento')
  const tk = useTranslations('Dashboard.overview.kpi')
  const format = useFormatter()
  const locale = useLocale()
  const formatDuration = useFormatDuration()
  const wallet = useWallet()
  const balance = balanceOf(wallet.transactions)
  const { daysLeft } = runway(wallet.transactions, 14, now)

  if (!data) {
    return (
      <div className="grid gap-4 lg:grid-cols-4">
        <Skeleton className="h-[440px] rounded-[22px] lg:row-span-2" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className={cn('h-[200px] rounded-[20px]', i === 3 && 'lg:col-span-2')} />
        ))}
      </div>
    )
  }

  const bars = groupBars(data)
  const peak = Math.max(1, ...bars.map((b) => b.total))
  const peakIndex = bars.findIndex((b) => b.total === peak)
  const totalIn = data.volume.series.reduce((s, p) => s + p.incoming, 0)
  const totalOut = data.volume.series.reduce((s, p) => s + p.outgoing, 0)
  const barLabel = (iso: string) => {
    const d = bucketDate(iso)
    return data.unit === 'hour' ? format.dateTime(d, { hour: 'numeric' }) : format.dateTime(d, data.days <= 7 ? { weekday: 'narrow' } : { day: 'numeric', month: 'short' })
  }

  const readRate = ratio(data.kpis.broadcastRead, data.kpis.broadcastDelivered)
  const { waiting, oldestWaitingSince } = data.attention

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1.05fr)_repeat(3,minmax(0,1fr))]">
      {/* Hero: every message in and out, by period */}
      <section className="bg-hero relative flex min-h-[420px] flex-col overflow-hidden rounded-[22px] p-5 text-white shadow-[0_24px_50px_-28px_var(--primary)] md:row-span-2">
        <span aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(400px_200px_at_80%_0%,rgb(255_255_255/0.14),transparent_70%)]" />
        <div className="relative flex items-center justify-between">
          <h3 className="text-[15px] font-semibold">{t('handled')}</h3>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-bold tracking-[0.08em]">
            <span className="size-1.5 animate-pulse rounded-full bg-[#7ff0b8]" />
            {t('live')}
          </span>
        </div>
        <b className="relative mt-3 text-[46px] leading-none font-bold tracking-[-0.04em] tabular-nums"><RollingNumber>{format.number(totalIn + totalOut)}</RollingNumber></b>
        <p className="relative mt-2 text-xs text-white/85">{t('split', { incoming: format.number(totalIn), outgoing: format.number(totalOut) })}</p>
        <div className="relative mt-auto grid h-[230px] items-end gap-2" style={{ gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))` }}>
          {bars.map((b, i) => (
            <div key={b.t} className="relative flex h-full flex-col items-center justify-end gap-2" title={`${barLabel(b.t)}: ${format.number(b.total)}`}>
              {i === peakIndex && b.total > 0 && (
                <b className="absolute left-1/2 -translate-x-1/2 rounded-full bg-white px-1.5 py-0.5 text-[10px] font-bold text-[#1a1d1b] shadow-md" style={{ bottom: `calc(${(b.total / peak) * 82}% + 30px)` }}>
                  {format.number(b.total, { notation: 'compact' })}
                </b>
              )}
              <i
                className={cn('animate-grow-y block w-full max-w-9 rounded-full', i === bars.length - 1 && bars.length > 1 ? 'hatch-light' : 'bg-[#fffdf9]')}
                style={{ height: `${Math.max(4, (b.total / peak) * 82)}%`, animationDelay: `${i * 50}ms` }}
              />
              <span className="text-[10px] text-white/75">{barLabel(b.t)}</span>
            </div>
          ))}
        </div>
      </section>

      <MiniCard
        href="/inbox"
        title={t('waiting')}
        note={<ArrowRight className="size-4 text-muted-foreground" aria-hidden />}
      >
        <Big value={format.number(waiting)} />
        <p className="mt-auto text-xs text-muted-foreground">
          {waiting > 0 && oldestWaitingSince ? t('oldest', { wait: formatDuration(minutesBetween(oldestWaitingSince, now)) }) : t('allAnswered')}
        </p>
        <div className="mt-3">
          <Ticks pct={waiting ? Math.max(4, (1 - data.attention.waitingOverTarget / waiting) * 100) : 100} />
        </div>
      </MiniCard>

      <MiniCard title={tk('readRate')} note={<span className="text-[11px] text-muted-foreground">{data.kpis.broadcastDelivered ? tk('readOfDelivered', { read: format.number(data.kpis.broadcastRead), delivered: format.number(data.kpis.broadcastDelivered) }) : ''}</span>}>
        <Big value={readRate == null ? tk('none') : format.number(readRate * 100, { maximumFractionDigits: 1 })} unit={readRate == null ? undefined : '%'} />
        {readRate == null ? <p className="mt-auto text-xs text-muted-foreground">{tk('noBroadcasts')}</p> : <Ticks pct={readRate * 100} className="bg-[var(--chart-3)]" />}
      </MiniCard>

      <MiniCard
        title={
          <span className="flex items-center gap-1.5">
            <Wallet className="size-4" aria-hidden />
            {t('wallet')}
          </span>
        }
        note={
          <Link href="/wallet" aria-label={t('topUp')} className="flex size-8 items-center justify-center rounded-full bg-foreground text-background transition-transform hover:scale-105">
            <Plus className="size-4" />
          </Link>
        }
      >
        <Big value={formatMoney(balance, locale, 0)} unit={t('balance')} />
        <div className="mt-auto h-2 overflow-hidden rounded-full hatch">
          <i className="animate-grow-x block h-full rounded-full bg-[var(--chart-3)]" style={{ width: `${Math.min(100, daysLeft == null ? 100 : (daysLeft / 30) * 100)}%` }} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{daysLeft == null ? t('noSpend') : t('daysLeft', { days: Math.floor(daysLeft) })}</p>
      </MiniCard>

      {/* Message volume on a dark card, spanning two columns */}
      <div className="ink-scope md:col-span-2">
        <MessageVolumeCard data={data} />
      </div>

      <div className="md:col-span-2 xl:col-span-1">
        <WhoReplied data={data} />
      </div>

    </div>
  )
}
