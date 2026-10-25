"use client";

import { useTranslations } from "next-intl";

import { SettingsPanelHead } from "@/components/settings/settings-panel-head";
import { EmbeddedSignup } from "@/components/whatsapp/embedded-signup";
import { setupStore, useSetup } from "@/lib/workspace/setup";

/** Settings → WhatsApp: the one-click Embedded Signup, above the manual credentials form. */
export function WhatsAppConnectCard() {
  const t = useTranslations("EmbeddedSignup");
  const setup = useSetup();
  return (
    <section>
      <SettingsPanelHead title={t("settingsTitle")} description={t("settingsDesc")} />
      <EmbeddedSignup
        displayName={setup.business.displayName || setup.business.name}
        connected={setup.number}
        onConnected={(number) => setupStore.set((s) => ({ ...s, whatsapp: "connected", number }))}
      />
      <p className="mt-6 text-sm text-muted-foreground">{t("manualHint")}</p>
    </section>
  );
}
