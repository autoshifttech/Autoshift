import { AlertSettingsPage } from "@/components/admin/alert-settings-page";
import { CustomToolsPanel } from "@/components/admin/custom-tools-panel";
import { PhoneOtpPanel } from "@/components/admin/phone-otp-panel";
import { ApiKeysPanel } from "@/components/settings/api-keys-panel";

export default function Page() {
  return (
    <>
      <AlertSettingsPage />
      {/* Platform keys reach the platform_* MCP tools (super admins only; hidden without the backend). */}
      <div className="mx-auto mt-10 max-w-3xl">
        <ApiKeysPanel platform />
      </div>
      {/* Phone verification for new sign-ups (WhatsApp OTP). Hidden without the backend. */}
      <div className="mx-auto mt-10 max-w-3xl">
        <PhoneOtpPanel />
      </div>
      {/* Custom MCP tools: each calls a webhook (e.g. n8n). Hidden without the backend. */}
      <div className="mx-auto mt-10 max-w-3xl">
        <CustomToolsPanel />
      </div>
    </>
  );
}
