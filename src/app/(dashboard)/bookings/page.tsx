"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { CalendarDays, Clock, Plus, Settings2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarView } from "@/components/booking/calendar-view";
import { ServicesPanel } from "@/components/booking/services-panel";
import { AvailabilityPanel } from "@/components/booking/availability-panel";
import { BookingSettingsPanel } from "@/components/booking/booking-settings-panel";
import { BookingDialog } from "@/components/booking/booking-dialog";

const TABS = ["calendar", "services", "availability", "settings"] as const;
type Tab = (typeof TABS)[number];
const ICONS = { calendar: CalendarDays, services: Sparkles, availability: Clock, settings: Settings2 };

export default function BookingsPage() {
  return (
    <Suspense fallback={null}>
      <BookingsPageInner />
    </Suspense>
  );
}

function BookingsPageInner() {
  const t = useTranslations("Bookings");
  const router = useRouter();
  const params = useSearchParams();
  const raw = params.get("tab");
  const tab: Tab = (TABS as readonly string[]).includes(raw ?? "") ? (raw as Tab) : "calendar";
  const [creating, setCreating] = useState(false);

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="sr-only">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <Button onClick={() => setCreating(true)} className="gap-1.5 self-start">
          <Plus className="size-4" />
          {t("newBooking")}
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => router.replace(`/bookings?tab=${v}`, { scroll: false })} className="mt-6">
        <TabsList className="max-w-full overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TABS.map((id) => {
            const Icon = ICONS[id];
            return (
              <TabsTrigger key={id} value={id}>
                <Icon className="mr-1.5 h-4 w-4" />
                {t(`tab_${id}`)}
              </TabsTrigger>
            );
          })}
        </TabsList>
        <TabsContent value="calendar" className="mt-5">
          <CalendarView />
        </TabsContent>
        <TabsContent value="services" className="mt-5">
          <ServicesPanel />
        </TabsContent>
        <TabsContent value="availability" className="mt-5">
          <AvailabilityPanel />
        </TabsContent>
        <TabsContent value="settings" className="mt-5">
          <BookingSettingsPanel />
        </TabsContent>
      </Tabs>

      {creating && <BookingDialog open onOpenChange={setCreating} />}
    </div>
  );
}
