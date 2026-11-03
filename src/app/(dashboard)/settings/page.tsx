'use client';

import { Suspense, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { SettingsRail } from '@/components/settings/settings-rail';
import { WalletPage } from '@/components/wallet/wallet-page';
import { ConsentPage } from '@/components/consent/consent-page';
import { SupportPage } from '@/components/support/support-page';
import { FilesPage } from '@/components/files/files-page';
import { ProfileForm } from '@/components/settings/profile-form';
import { SecurityPanel } from '@/components/settings/security-panel';
import { AppearancePanel } from '@/components/settings/appearance-panel';
import { WhatsAppConfig } from '@/components/settings/whatsapp-config';
import { MembersTab } from '@/components/settings/members-tab';
import { BillingPanel } from '@/components/billing/billing-panel';
import { DataPrivacyPanel } from '@/components/settings/data-privacy-panel';
import { OwnerAlertsPanel } from '@/components/settings/owner-alerts-panel';
import { WhatsAppConnectCard } from '@/components/whatsapp/connect-card';
import {
  resolveSection,
  type SettingsSection,
} from '@/components/settings/settings-sections';

// `useSearchParams` opts this page out of static prerendering unless it
// sits under a Suspense boundary. Without one, the production build hits
// the "missing Suspense with CSR bailout" error and the whole page bails
// to client-side rendering — shipping a settings screen whose rail never
// wires up its click handlers. You land on the section the URL carried
// (the account-menu Settings link points at `?tab=whatsapp`) and can't
// navigate away. Mirror the login/signup split: a thin wrapper supplies
// the boundary; the inner component reads the query string.
export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsPageInner />
    </Suspense>
  );
}

function SettingsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations('Settings');

  // The URL (`?tab=`) is the single source of truth for the active
  // section — deep-linkable. Unknown or removed tab values open Your profile.
  const section = resolveSection(searchParams.get('tab'));

  const go = (next: SettingsSection) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', next);
    router.replace(`/settings?${params.toString()}`, { scroll: false });
  };

  const panel: Record<SettingsSection, ReactNode> = {
    profile: <ProfileForm />,
    security: <SecurityPanel />,
    appearance: <AppearancePanel />,
    alerts: <OwnerAlertsPanel />,
    whatsapp: (
      <div className="space-y-6">
        <WhatsAppConnectCard />
        <WhatsAppConfig />
      </div>
    ),
    members: <MembersTab />,
    billing: <BillingPanel />,
    wallet: <WalletPage />,
    'opt-ins': <ConsentPage />,
    files: <FilesPage />,
    support: <SupportPage />,
    privacy: <DataPrivacyPanel />,
  };

  return (
    <div>
      <div>
        <h2 className="sr-only">
          {t('pageTitle')}
        </h2>
        <p className="mx-auto mt-1 max-w-4xl text-sm text-muted-foreground sm:text-center">
          {t('pageDesc')}
        </p>
      </div>

      <div className="mt-4 space-y-6">
        <SettingsRail active={section} onSelect={go} />
        <div className="mx-auto w-full min-w-0 max-w-4xl [&>*]:mx-auto">{panel[section]}</div>
      </div>
    </div>
  );
}
