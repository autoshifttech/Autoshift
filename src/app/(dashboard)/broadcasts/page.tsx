'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Broadcast } from '@/types';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Radio, Plus, Loader2, Search, Send, CheckCheck, Eye, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCan } from '@/hooks/use-can';
import { GatedButton } from '@/components/ui/gated-button';
import { getBroadcastStatus } from '@/lib/broadcast-status';
import { useTranslations } from 'next-intl';

/**
 * Poll cadence while any broadcast is sending. Kept modest so we don't
 * beat on Supabase — the aggregate trigger in migration 003 keeps
 * counts consistent; we just need to surface the freshest snapshot.
 */
const POLL_INTERVAL_MS = 5_000;

function percent(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 100);
}

function RateCell({
  value,
  total,
  color,
}: {
  value: number;
  total: number;
  /** Tailwind bg class for the fill, e.g. "bg-primary" */
  color: string;
}) {
  const pct = percent(value, total);
  return (
    <div className="flex items-center gap-2">
      <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
        {pct}%
      </span>
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-1.5 rounded-full ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function BroadcastsPage() {
  const router = useRouter();
  const t = useTranslations('Broadcasts.page');
  const tStatus = useTranslations('Broadcasts.status');
  const tGate = useTranslations('GatedButton');
  const canCreate = useCan('send-messages');
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Used to kick off polling only while something is actively sending.
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  async function fetchBroadcasts() {
    try {
      const supabase = createClient();
      const { data, error: fetchError } = await supabase
        .from('broadcasts')
        .select('*')
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      setBroadcasts(data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errorLoad'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchBroadcasts();
  }, []);

  const anySending = useMemo(
    () => broadcasts.some((b) => b.status === 'sending'),
    [broadcasts],
  );

  useEffect(() => {
    function startPolling() {
      if (pollTimer.current) return;
      pollTimer.current = setInterval(fetchBroadcasts, POLL_INTERVAL_MS);
    }
    function stopPolling() {
      if (!pollTimer.current) return;
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }

    // Pause polling while the tab is hidden — keeps Supabase cold when
    // the user is away, and ensures a fresh fetch the moment they
    // refocus so they don't see stale data on return.
    function handleVisibilityChange() {
      if (!anySending) return;
      if (document.visibilityState === 'hidden') {
        stopPolling();
      } else {
        fetchBroadcasts();
        startPolling();
      }
    }

    if (anySending && document.visibilityState === 'visible') {
      startPolling();
    } else {
      stopPolling();
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [anySending]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          {t('retry')}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top indeterminate progress bar: only visible while a broadcast
          is mid-send. Pure CSS animation so no extra deps. */}
      {anySending && (
        <div
          role="progressbar"
          aria-label={t('broadcastInProgress')}
          className="broadcast-indeterminate fixed inset-x-0 top-0 z-40 h-0.5 overflow-hidden bg-muted"
        >
          <div className="broadcast-indeterminate-bar h-0.5 bg-primary" />
          <style jsx>{`
            .broadcast-indeterminate-bar {
              width: 33%;
              transform: translateX(-100%);
              animation: broadcast-slide 1.6s cubic-bezier(0.4, 0, 0.2, 1)
                infinite;
            }
            @keyframes broadcast-slide {
              0% {
                transform: translateX(-100%);
              }
              100% {
                transform: translateX(400%);
              }
            }
          `}</style>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="sr-only">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('subtitle')}
          </p>
        </div>
        <GatedButton
          canAct={canCreate}
          gateReason={tGate('reasons.createBroadcasts')}
          onClick={() => router.push('/broadcasts/new')}
          className="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          {t('newBroadcast')}
        </GatedButton>
      </div>

      {broadcasts.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-border bg-card">
          <Radio className="mb-3 h-10 w-10 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">{t('noBroadcastsYet')}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('createFirst')}
          </p>
          <GatedButton
            canAct={canCreate}
            gateReason={tGate('reasons.createBroadcasts')}
            onClick={() => router.push('/broadcasts/new')}
            className="mt-4 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            {t('newBroadcast')}
          </GatedButton>
        </div>
      ) : (
        <>
          <BroadcastKpis broadcasts={broadcasts} />
          <section className="rounded-[20px] border border-border bg-card p-4 shadow-[var(--shadow-card)] sm:p-5">
            <h2 className="mb-3 text-[15px] font-bold">{t('allBroadcasts')}</h2>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-1.5">
                {['all', ...Array.from(new Set(broadcasts.map((b) => b.status)))].map((key) => {
                  const count = key === 'all' ? broadcasts.length : broadcasts.filter((b) => b.status === key).length;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setStatusFilter(key)}
                      aria-pressed={statusFilter === key}
                      className={cn(
                        'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors',
                        statusFilter === key ? 'border-foreground bg-foreground text-background' : 'border-input bg-card text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {key === 'all' ? t('all') : tStatus(getBroadcastStatus(key as Broadcast['status']).label)}
                      <span className="opacity-60">{count}</span>
                    </button>
                  );
                })}
              </div>
              <label className="flex h-9 w-full items-center gap-2 rounded-xl border border-input bg-card px-3 text-sm sm:w-60">
                <Search className="size-3.5 text-muted-foreground" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('search')} aria-label={t('search')} className="w-full bg-transparent outline-none placeholder:text-muted-foreground" />
              </label>
            </div>
        <div className="-mx-2 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground">{t('table.name')}</TableHead>
                <TableHead className="hidden text-muted-foreground md:table-cell">{t('table.template')}</TableHead>
                <TableHead className="hidden text-right text-muted-foreground sm:table-cell">
                  {t('table.recipients')}
                </TableHead>
                <TableHead className="hidden text-muted-foreground lg:table-cell">{t('table.delivery')}</TableHead>
                <TableHead className="hidden text-muted-foreground lg:table-cell">{t('table.read')}</TableHead>
                <TableHead className="text-muted-foreground">{t('table.status')}</TableHead>
                <TableHead className="hidden text-muted-foreground sm:table-cell">{t('table.date')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {broadcasts
                .filter((b) => (statusFilter === 'all' || b.status === statusFilter) && (!query.trim() || `${b.name} ${b.template_name}`.toLowerCase().includes(query.trim().toLowerCase())))
                .map((broadcast) => {
                const status = getBroadcastStatus(broadcast.status);
                return (
                  <TableRow
                    key={broadcast.id}
                    className="cursor-pointer border-border hover:bg-muted/50"
                    onClick={() => router.push(`/broadcasts/${broadcast.id}`)}
                  >
                    <TableCell className="font-medium text-foreground">
                      {broadcast.name}
                      {broadcast.status === 'sending' && broadcast.total_recipients > 0 && (
                        <span className="mt-1.5 flex items-center gap-2 text-[11px] font-normal text-muted-foreground">
                          <span className="h-1.5 w-28 overflow-hidden rounded-full bg-muted">
                            <span className="block h-full rounded-full bg-primary transition-[width] duration-700" style={{ width: `${percent(broadcast.sent_count, broadcast.total_recipients)}%` }} />
                          </span>
                          {percent(broadcast.sent_count, broadcast.total_recipients)}% · {broadcast.sent_count} / {broadcast.total_recipients}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {broadcast.template_name}
                    </TableCell>
                    <TableCell className="hidden text-right text-muted-foreground tabular-nums sm:table-cell">
                      {broadcast.total_recipients}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <RateCell
                        value={broadcast.delivered_count}
                        total={broadcast.total_recipients}
                        color="bg-primary"
                      />
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <RateCell
                        value={broadcast.read_count}
                        total={broadcast.total_recipients}
                        color="bg-[var(--chart-3)]"
                      />
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${status.classes}`}
                      >
                        {status.pulse && (
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-yellow-400 opacity-75" />
                            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-yellow-400" />
                          </span>
                        )}
                        {tStatus(status.label)}
                      </span>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">
                      {new Date(broadcast.created_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
          </section>
        </>
      )}
    </div>
  );
}

/** Totals across every broadcast: sent, delivered, read and replied. */
function BroadcastKpis({ broadcasts }: { broadcasts: Broadcast[] }) {
  const t = useTranslations('Broadcasts.page.kpi');
  const sent = broadcasts.reduce((s, b) => s + b.sent_count, 0);
  const delivered = broadcasts.reduce((s, b) => s + b.delivered_count, 0);
  const read = broadcasts.reduce((s, b) => s + b.read_count, 0);
  const replied = broadcasts.reduce((s, b) => s + b.replied_count, 0);
  const tiles = [
    { icon: Send, label: t('sent'), value: sent.toLocaleString(), note: t('sentNote', { count: broadcasts.length }) },
    { icon: CheckCheck, label: t('delivery'), value: `${percent(delivered, sent)}%`, note: t('deliveryNote') },
    { icon: Eye, label: t('read'), value: `${percent(read, delivered)}%`, note: t('readNote') },
    { icon: MessageCircle, label: t('replied'), value: `${percent(replied, delivered)}%`, note: t('repliedNote') },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map(({ icon: Icon, label, value, note }) => (
        <section key={label} className="rounded-[18px] border border-border bg-card p-4 shadow-[var(--shadow-card)]">
          <p className="flex items-center gap-2 text-xs font-semibold">
            <Icon className="size-3.5 text-muted-foreground" />
            {label}
          </p>
          <p className="mt-2 text-[26px] leading-none font-bold tracking-[-0.035em] tabular-nums">{value}</p>
          <p className="mt-1.5 text-[11px] text-muted-foreground">{note}</p>
        </section>
      ))}
    </div>
  );
}
