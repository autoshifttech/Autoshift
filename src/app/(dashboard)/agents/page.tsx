'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Sparkles, Settings2, BarChart3, Target, Wand2, Users } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { AiPlayground } from '@/components/agents/ai-playground';
import { AiUsageCard } from '@/components/agents/ai-usage';
import { AiConfig } from '@/components/settings/ai-config';
import { useAuth } from '@/hooks/use-auth';
import { canEditSettings } from '@/lib/auth/roles';
import { AssistantsList } from '@/components/assistants/assistants-list';
import { LeadCapturePanel } from '@/components/leads/lead-capture-panel';
import { PresetsPanel } from '@/components/leads/presets-panel';

const TABS = ['assistants', 'leads', 'presets', 'playground', 'setup', 'usage'] as const;
type Tab = (typeof TABS)[number];

// useSearchParams needs a Suspense boundary for the production build.
export default function AgentsPage() {
  return (
    <Suspense fallback={null}>
      <AgentsPageInner />
    </Suspense>
  );
}

function AgentsPageInner() {
  const t = useTranslations('Agents');
  const router = useRouter();
  const raw = useSearchParams().get('tab');
  const { accountRole } = useAuth();
  const canViewUsage = accountRole ? canEditSettings(accountRole) : false;
  // The URL (?tab=) picks the tab so links from onboarding and assistants land in the right place.
  const tab: Tab = (TABS as readonly string[]).includes(raw ?? '') ? (raw as Tab) : 'assistants';
  const setTab = (next: Tab) => router.replace(`/agents?tab=${next}`, { scroll: false });

  return (
    <div>
      <h2 className="sr-only">{t('title')}</h2>
      <p className="text-sm text-muted-foreground">
        {t('description')}
      </p>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="mt-6">
        <TabsList className="max-w-full overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <TabsTrigger value="assistants">
            <Users className="mr-1.5 h-4 w-4" /> {t('tabAssistants')}
          </TabsTrigger>
          <TabsTrigger value="leads">
            <Target className="mr-1.5 h-4 w-4" /> {t('tabLeads')}
          </TabsTrigger>
          <TabsTrigger value="presets">
            <Wand2 className="mr-1.5 h-4 w-4" /> {t('tabPresets')}
          </TabsTrigger>
          <TabsTrigger value="playground">
            <Sparkles className="mr-1.5 h-4 w-4" /> {t('tabPlayground')}
          </TabsTrigger>
          <TabsTrigger value="setup">
            <Settings2 className="mr-1.5 h-4 w-4" /> {t('tabModel')}
          </TabsTrigger>
          {canViewUsage && (
            <TabsTrigger value="usage">
              <BarChart3 className="mr-1.5 h-4 w-4" /> {t('tabUsage')}
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="assistants" className="mt-4">
          <AssistantsList />
        </TabsContent>

        <TabsContent value="leads" className="mt-4">
          <LeadCapturePanel />
        </TabsContent>

        <TabsContent value="presets" className="mt-4">
          <PresetsPanel />
        </TabsContent>

        <TabsContent value="playground" className="mt-4">
          <AiPlayground onGoToSetup={() => setTab('setup')} />
        </TabsContent>

        <TabsContent value="setup" className="mt-4">
          <AiConfig />
        </TabsContent>

        {canViewUsage && (
          <TabsContent value="usage" className="mt-4">
            <AiUsageCard />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
