import { TemplateManager } from "@/components/settings/template-manager";

// Templates get their own menu item; the same manager also lives in Settings.
export default function Page() {
  return <TemplateManager />;
}
