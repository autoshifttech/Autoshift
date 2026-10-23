import { usePageTitle } from '../hooks/usePageTitle'
import { AiChatbot } from '../sections/home/AiChatbot'
import { Campaigns } from '../sections/home/Campaigns'
import { Channels, WhyAi } from '../sections/home/Channels'
import { Hero } from '../sections/home/Hero'
import { Automations, SharedInbox } from '../sections/home/InboxAndAutomations'
import { FinalCta, Integrations, PricingBand, ToolsTeaser } from '../sections/home/Integrations'
import { Segmentation } from '../sections/home/Segmentation'

export default function Home() {
  usePageTitle()
  return (
    <>
      <Hero />
      <Channels />
      <WhyAi />
      <AiChatbot />
      <Segmentation />
      <Campaigns />
      <SharedInbox />
      <Automations />
      <Integrations />
      <PricingBand />
      <ToolsTeaser />
      <FinalCta />
    </>
  )
}
