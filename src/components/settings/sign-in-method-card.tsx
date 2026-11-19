'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Mail, ShieldCheck } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/client';

/** Settings → Login & security: how this person signs in (Google or an emailed code). No passwords. */
export function SignInMethodCard() {
  const t = useTranslations('Settings.security');
  const [info, setInfo] = useState<{ email: string; google: boolean } | null>(null);

  useEffect(() => {
    let live = true;
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        if (!live || !data.user) return;
        const google = (data.user.identities ?? []).some((i) => i.provider === 'google');
        setInfo({ email: data.user.email ?? '', google });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="size-4 text-primary" aria-hidden /> {t('signInTitle')}
        </CardTitle>
        <CardDescription>{t('signInDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {info ? (
          <p className="flex items-start gap-2 text-foreground">
            <Mail className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span>{info.google ? t('signInGoogle', { email: info.email }) : t('signInEmail', { email: info.email })}</span>
          </p>
        ) : (
          <p className="text-muted-foreground">{t('signInLoading')}</p>
        )}
        <p className="text-xs text-muted-foreground">{t('signInNote')}</p>
      </CardContent>
    </Card>
  );
}
