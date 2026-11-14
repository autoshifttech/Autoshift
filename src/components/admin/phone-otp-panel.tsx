'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { KeyRound, RefreshCw, ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';
import { SettingsPanelHead } from '@/components/settings/settings-panel-head';
import { toast } from '@/lib/toast';
import { backendUrl } from '@/lib/backend/client';
import { useBusinesses } from '@/lib/admin/store';

interface CustomSender {
  phone_number_id: string;
  waba_id: string;
  display_phone: string | null;
  verified_name: string | null;
  token_tail: string | null;
}

interface State {
  settings: { enabled: boolean; sender_account_id: string | null; custom_sender: CustomSender | null; admin_2fa?: boolean; template_name: string; required_since: string | null };
  my_phone_verified?: boolean;
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
  const [mode, setMode] = useState<'business' | 'custom'>('business');
  const [form, setForm] = useState({ phone_number_id: '', waba_id: '', access_token: '' });
  const connected = backendUrl() !== null;

  const load = useCallback(async () => {
    try {
      const next = await call<State>('GET');
      setState(next);
      const custom = next.settings.custom_sender;
      if (custom) {
        setMode('custom');
        setForm({ phone_number_id: custom.phone_number_id, waba_id: custom.waba_id, access_token: '' });
      }
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
  const custom = state?.settings.custom_sender ?? null;
  const hasSender = !!(custom || state?.settings.sender_account_id);

  return (
    <div className="space-y-6">
      <SettingsPanelHead title={t('title')} description={t('desc')} />

      {failed && (
        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {failed}
        </p>
      )}

      <div className="space-y-5 rounded-2xl border border-border bg-card p-4">
        <fieldset className="grid gap-3">
          <legend className="mb-1 text-sm font-medium text-foreground">{t('sender')}</legend>
          <div role="radiogroup" aria-label={t('sender')} className="flex flex-wrap gap-2">
            {(['business', 'custom'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                onClick={() => setMode(m)}
                className={`min-h-11 rounded-full border px-4 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${mode === m ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground hover:bg-muted'}`}
              >
                {t(m === 'business' ? 'modeBusiness' : 'modeCustom')}
              </button>
            ))}
          </div>

          {mode === 'business' ? (
            <div className="grid gap-1.5">
              <Label htmlFor="otp-sender">{t('chooseSender')}</Label>
              <NativeSelect
                id="otp-sender"
                value={state?.settings.sender_account_id ?? ''}
                disabled={!state || busy}
                onChange={(e) => void run(() => call('PUT', { sender_account_id: e.target.value || null, ...(custom ? { custom_sender: null } : {}) }), t('saved'))}
              >
                <option value="">{t('chooseSender')}</option>
                {businesses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </NativeSelect>
              <p className="text-xs text-muted-foreground">{t('senderHelp')}</p>
            </div>
          ) : (
            <form
              className="grid gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  await call('PUT', { custom_sender: { phone_number_id: form.phone_number_id, waba_id: form.waba_id, access_token: form.access_token } });
                  setForm((f) => ({ ...f, access_token: '' }));
                }, t('customSaved'));
              }}
            >
              <p className="text-xs text-muted-foreground">{t('customHelp')}</p>
              <div className="grid gap-1.5">
                <Label htmlFor="otp-pnid">{t('phoneNumberId')}</Label>
                <Input id="otp-pnid" inputMode="numeric" autoComplete="off" value={form.phone_number_id} onChange={(e) => setForm({ ...form, phone_number_id: e.target.value.trim() })} className="min-h-11 font-mono" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="otp-waba">{t('wabaId')}</Label>
                <Input id="otp-waba" inputMode="numeric" autoComplete="off" value={form.waba_id} onChange={(e) => setForm({ ...form, waba_id: e.target.value.trim() })} className="min-h-11 font-mono" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="otp-token">{t('accessToken')}</Label>
                <Input
                  id="otp-token"
                  type="password"
                  autoComplete="off"
                  value={form.access_token}
                  placeholder={custom?.token_tail ? t('tokenSaved', { tail: custom.token_tail }) : ''}
                  onChange={(e) => setForm({ ...form, access_token: e.target.value })}
                  className="min-h-11 font-mono"
                />
                <p className="text-xs text-muted-foreground">{t('tokenHelp')}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" className="min-h-11" disabled={busy || !form.phone_number_id || !form.waba_id || (!form.access_token && !custom)}>
                  <KeyRound className="size-4" aria-hidden />
                  {t('checkAndSave')}
                </Button>
                {custom && (
                  <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={() => void run(() => call('PUT', { custom_sender: null }), t('customRemoved'))}>
                    {t('removeCustom')}
                  </Button>
                )}
              </div>
              {custom && (
                <p className="text-xs text-foreground">
                  {t('customConnected', { phone: custom.display_phone ?? custom.phone_number_id, name: custom.verified_name ?? '' })}
                </p>
              )}
            </form>
          )}
          {state?.problem && <p className="text-xs text-destructive">{state.problem}</p>}
        </fieldset>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{t('template', { name: state?.settings.template_name ?? 'autoshift_otp' })}</p>
            <p className="text-xs text-muted-foreground">
              {!hasSender ? t('templateNeedsSender') : status ? t(`status.${['APPROVED', 'PENDING', 'REJECTED'].includes(status) ? status : 'OTHER'}`, { status, reason: state?.template?.reason ?? '' }) : t('templateMissing')}
            </p>
          </div>
          <div className="flex gap-2">
            {hasSender && !status && (
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

        <div className="flex items-start justify-between gap-4 border-t border-border pt-4">
          <div className="min-w-0">
            <Label htmlFor="otp-admin" className="text-sm font-medium text-foreground">
              {t('adminCodes')}
            </Label>
            <p className="text-xs text-muted-foreground">{!approved ? t('requireNeedsTemplate') : state?.my_phone_verified ? t('adminCodesHelp') : t('adminCodesNeedsPhone')}</p>
            {state && !state.my_phone_verified && hasSender && (
              <a href={`/verify-phone?next=${encodeURIComponent('/admin/settings')}`} className="mt-1 inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                {t('verifyMyPhone')}
              </a>
            )}
          </div>
          <Switch
            id="otp-admin"
            checked={!!state?.settings.admin_2fa}
            disabled={!state || busy || (!state.settings.admin_2fa && (!approved || !state.my_phone_verified))}
            onCheckedChange={(v) => void run(() => call('PUT', { admin_2fa: v }), v ? t('adminOn') : t('adminOff'))}
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
