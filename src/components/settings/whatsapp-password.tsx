'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { KeyRound, Loader2, MessageCircle, ShieldCheck } from 'lucide-react';

import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/lib/toast';
import { PasswordForm } from './password-form';

const MIN_PASSWORD = 8;
const VERIFY_HREF = `/verify-phone?next=${encodeURIComponent('/settings?tab=security')}`;

interface Status {
  available: boolean;
  phone: string | null;
}

/** Shared error text for the code endpoints. */
export function useCodeErrors() {
  const t = useTranslations('Settings.security');
  return (data: { error?: string; retry_after?: number; attempts_left?: number }) => {
    const known = ['not_available', 'no_phone', 'wait', 'too_many', 'send_failed', 'invalid_code', 'no_code', 'expired', 'too_many_attempts', 'wrong_code', 'weak_password'];
    return known.includes(data.error ?? '') ? t(`error.${data.error}`, { seconds: data.retry_after ?? 60, left: data.attempts_left ?? 0, min: MIN_PASSWORD }) : t('error.generic');
  };
}

/** The verified WhatsApp number (codes go here), or a way to verify one. */
function PhoneCard({ status }: { status: Status | null }) {
  const t = useTranslations('Settings.security');
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <MessageCircle className="size-4 text-primary" aria-hidden />
          {t('phoneTitle')}
        </CardTitle>
        <CardDescription className="text-muted-foreground">{t('phoneDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        {status === null ? (
          <p className="text-sm text-muted-foreground">{t('loading')}</p>
        ) : status.phone ? (
          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
            <ShieldCheck className="size-4 text-primary" aria-hidden />
            {t('phoneVerified', { phone: status.phone })}
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">{status.available ? t('phoneMissing') : t('phoneUnavailable')}</p>
            {status.available && (
              <Link href={VERIFY_HREF} className={buttonVariants({ className: 'min-h-11' })}>
                {t('verifyPhone')}
              </Link>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Change the password with a code sent on WhatsApp (no old password needed, so it also covers a forgotten one). */
function CodePasswordForm({ phone }: { phone: string }) {
  const t = useTranslations('Settings.security');
  const errorText = useCodeErrors();
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (wait <= 0) return;
    const id = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  const sendCode = async () => {
    setError(null);
    if (next.length < MIN_PASSWORD) return setError(t('error.weak_password', { min: MIN_PASSWORD }));
    if (next !== confirm) return setError(t('mismatch'));
    setBusy(true);
    try {
      const res = await fetch('/api/account/password/code', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(errorText(data));
        if (data.retry_after) setWait(data.retry_after);
        return;
      }
      setSent(true);
      setWait(data.resend_after ?? 60);
    } finally {
      setBusy(false);
    }
  };

  const change = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/account/password/change', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, password: next }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setError(errorText(data));
      toast.success(t('changed'));
      setNext('');
      setConfirm('');
      setCode('');
      setSent(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <KeyRound className="size-4 text-primary" aria-hidden />
          {t('passwordTitle')}
        </CardTitle>
        <CardDescription className="text-muted-foreground">{t('passwordDesc', { phone })}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void (sent ? change() : sendCode());
          }}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="wa-new-password">{t('newPassword')}</Label>
              <Input id="wa-new-password" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} disabled={sent || busy} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wa-confirm-password">{t('confirmPassword')}</Label>
              <Input id="wa-confirm-password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} disabled={sent || busy} />
            </div>
          </div>

          {sent && (
            <div className="space-y-2">
              <Label htmlFor="wa-code">{t('codeLabel', { phone })}</Label>
              <Input
                id="wa-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                className="max-w-48 text-center font-mono text-lg tracking-[0.4em]"
                autoFocus
              />
            </div>
          )}

          {error && (
            <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            {sent && (
              <Button type="button" variant="ghost" className="min-h-11" disabled={busy || wait > 0} onClick={() => void sendCode()}>
                {wait > 0 ? t('resendIn', { seconds: wait }) : t('resend')}
              </Button>
            )}
            {sent && (
              <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={() => { setSent(false); setCode(''); setError(null); }}>
                {t('back')}
              </Button>
            )}
            <Button type="submit" className="min-h-11" disabled={busy || !next || !confirm || (sent && code.length !== 6) || (!sent && wait > 0)}>
              {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {sent ? t('changePassword') : wait > 0 ? t('resendIn', { seconds: wait }) : t('sendCode')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/**
 * Login & security: the WhatsApp number codes go to, and changing the password with a WhatsApp code.
 * Without a verified number (or before AutoShift can send codes) the old "current password" form stays.
 */
export function WhatsAppPasswordSection() {
  const [status, setStatus] = useState<Status | null>(null);
  useEffect(() => {
    fetch('/api/account/password')
      .then((r) => (r.ok ? r.json() : { available: false, phone: null }))
      .then(setStatus)
      .catch(() => setStatus({ available: false, phone: null }));
  }, []);
  return (
    <>
      <PhoneCard status={status} />
      {status?.available && status.phone ? <CodePasswordForm phone={status.phone} /> : <PasswordForm />}
    </>
  );
}
