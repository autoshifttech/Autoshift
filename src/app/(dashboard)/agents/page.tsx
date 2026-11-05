'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Sparkles, Target, Wand2, Users } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { AiPlayground } from '@/components/agents/ai-playground';
import { AssistantsList } from '@/components/assistants/assistants-list';
import { LeadCapturePanel } from '@/components/leads/lead-capture-panel';
import { PresetsPanel } from '@/components/leads/presets-panel';

const TABS = ['assistants', 'leads', 'presets', 'playground'] as const;
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
        {/* Phones: a 2×2 grid so all four tabs show (a single row ran off the screen). */}
        <TabsList variant="plain" className="grid w-full grid-cols-2 gap-1 max-sm:h-auto! sm:inline-flex sm:w-fit">
          <TabsTrigger value="assistants" className="max-sm:h-11 max-sm:whitespace-normal max-sm:text-center max-sm:leading-tight">
            <Users className="mr-1.5 h-4 w-4" /> {t('tabAssistants')}
          </TabsTrigger>
          <TabsTrigger value="leads" className="max-sm:h-11 max-sm:whitespace-normal max-sm:text-center max-sm:leading-tight">
            <Target className="mr-1.5 h-4 w-4" /> {t('tabLeads')}
          </TabsTrigger>
          <TabsTrigger value="presets" className="max-sm:h-11 max-sm:whitespace-normal max-sm:text-center max-sm:leading-tight">
            <Wand2 className="mr-1.5 h-4 w-4" /> {t('tabPresets')}
          </TabsTrigger>
          <TabsTrigger value="playground" className="max-sm:h-11 max-sm:whitespace-normal max-sm:text-center max-sm:leading-tight">
            <Sparkles className="mr-1.5 h-4 w-4" /> {t('tabPlayground')}
          </TabsTrigger>
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
          <AiPlayground />
        </TabsContent>
      </Tabs>
    </div>
  );
}
