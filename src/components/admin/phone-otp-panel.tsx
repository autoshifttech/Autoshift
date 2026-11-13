'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { RefreshCw, ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';
import { SettingsPanelHead } from '@/components/settings/settings-panel-head';
import { toast } from '@/lib/toast';
import { backendUrl } from '@/lib/backend/client';
import { useBusinesses } from '@/lib/admin/store';

interface State {
  settings: { enabled: boolean; sender_account_id: string | null; template_name: string; required_since: string | null };
  sender: { phone_number_id: string } | null;
  template: { status: string; reason: string | null } | null;
  problem: string | null;
  verified_users: number;
}

async function call<T>(method: string, body?: unknown): Promise<T> {
  const res = await fetch('/api/admin/phone-otp', { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data as T;
}

/**
 * Phone verification for new sign-ups (super admins): which business's WhatsApp number sends the
 * codes, Meta's OTP template, and the on/off switch. Hidden without the backend.
 */
export function PhoneOtpPanel() {
  const t = useTranslations('Settings.phoneOtp');
  const businesses = useBusinesses();
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const connected = backendUrl() !== null;

  const load = useCallback(async () => {
    try {
      setState(await call<State>('GET'));
      setFailed(null);
    } catch (e) {
      setFailed(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    if (connected) void load();
  }, [connected, load]);

  if (!connected) return null;

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    try {
      await fn();
      if (ok) toast.success(ok);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      await load();
    }
  };

  const status = state?.template?.status ?? null;
  const approved = status === 'APPROVED';

  return (
    <div className="space-y-6">
      <SettingsPanelHead title={t('title')} description={t('desc')} />

      {failed && (
        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {failed}
        </p>
      )}

      <div className="space-y-5 rounded-2xl border border-border bg-card p-4">
        <div className="grid gap-1.5">
          <Label htmlFor="otp-sender">{t('sender')}</Label>
          <NativeSelect
            id="otp-sender"
            value={state?.settings.sender_account_id ?? ''}
            disabled={!state || busy}
            onChange={(e) => void run(() => call('PUT', { sender_account_id: e.target.value || null }), t('saved'))}
          >
            <option value="">{t('chooseSender')}</option>
            {businesses.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </NativeSelect>
          <p className="text-xs text-muted-foreground">{t('senderHelp')}</p>
          {state?.problem && <p className="text-xs text-destructive">{state.problem}</p>}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{t('template', { name: state?.settings.template_name ?? 'autoshift_otp' })}</p>
            <p className="text-xs text-muted-foreground">
              {!state?.settings.sender_account_id ? t('templateNeedsSender') : status ? t(`status.${['APPROVED', 'PENDING', 'REJECTED'].includes(status) ? status : 'OTHER'}`, { status, reason: state?.template?.reason ?? '' }) : t('templateMissing')}
            </p>
          </div>
          <div className="flex gap-2">
            {state?.settings.sender_account_id && !status && (
              <Button type="button" className="min-h-11" disabled={busy} onClick={() => void run(() => call('POST'), t('submitted'))}>
                {t('createTemplate')}
              </Button>
            )}
            <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={() => void load()} aria-label={t('refresh')}>
              <RefreshCw className="size-4" aria-hidden />
            </Button>
          </div>
        </div>

        <div className="flex items-start justify-between gap-4 border-t border-border pt-4">
          <div className="min-w-0">
            <Label htmlFor="otp-enabled" className="text-sm font-medium text-foreground">
              {t('require')}
            </Label>
            <p className="text-xs text-muted-foreground">{approved ? t('requireHelp') : t('requireNeedsTemplate')}</p>
          </div>
          <Switch
            id="otp-enabled"
            checked={!!state?.settings.enabled}
            disabled={!state || busy || (!approved && !state.settings.enabled)}
            onCheckedChange={(v) => void run(() => call('PUT', { enabled: v }), v ? t('on') : t('off'))}
          />
        </div>

        {state && (
          <p className="flex items-center gap-2 border-t border-border pt-4 text-xs text-muted-foreground">
            <ShieldCheck className="size-4 text-primary" aria-hidden />
            {t('verifiedCount', { count: state.verified_users })}
          </p>
        )}
      </div>
    </div>
  );
}
