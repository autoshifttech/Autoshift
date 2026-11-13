import { AlertSettingsPage } from "@/components/admin/alert-settings-page";
import { ApiKeysPanel } from "@/components/settings/api-keys-panel";

export default function Page() {
  return (
    <>
      <AlertSettingsPage />
      {/* Platform keys reach the platform_* MCP tools (super admins only; hidden without the backend). */}
      <div className="mx-auto mt-10 max-w-3xl">
        <ApiKeysPanel platform />
      </div>
    </>
  );
}
