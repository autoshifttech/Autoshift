import { N8nIntegration } from "@/components/n8n/n8n-integration"

// Static segment: takes precedence over automations/[id].
export default function N8nPage() {
  return <N8nIntegration />
}
