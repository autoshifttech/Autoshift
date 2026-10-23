import { Image, Mic, ShoppingBag, Zap } from 'lucide-react'
import { useId, useState } from 'react'
import { ChatMock, type ChatLine } from '../../components/ChatMock'
import { Section, SectionHeading } from '../../components/Layout'
import { cn } from '../../lib/cn'

const tabs: { id: string; label: string; icon: typeof Mic; title: string; text: string; chat: ChatLine[] }[] = [
  {
    id: 'voice',
    label: 'Voice notes',
    icon: Mic,
    title: 'Understands voice notes',
    text: 'Customers who would rather talk than type get the same instant, accurate answer — transcribed and understood in their language.',
    chat: [
      { from: 'customer', text: '🎤 Voice note · 0:12' },
      { from: 'bot', text: 'You asked if the salon is open Sunday — yes, 10am to 6pm. Shall I book you for a haircut?' },
      { from: 'customer', text: 'Yes, 11am please' },
      { from: 'bot', text: 'Booked for Sunday 11:00 ✅ You’ll get a reminder an hour before.' },
    ],
  },
  {
    id: 'images',
    label: 'Images',
    icon: Image,
    title: 'Reads images',
    text: 'A screenshot of a product, a photo of a damaged parcel, a payment receipt — the assistant sees it and responds to what’s actually in it.',
    chat: [
      { from: 'customer', text: '📷 Photo · sneakers.jpg' },
      { from: 'bot', text: 'Those look like our Trail Runner in grey. We have sizes 7–10 in stock at ₹3,299.' },
      { from: 'customer', text: 'Size 9 please' },
    ],
  },
  {
    id: 'products',
    label: 'Recommendations',
    icon: ShoppingBag,
    title: 'Recommends the right product',
    text: 'Connect your catalogue and the assistant suggests items by budget, size and preference, then sends the checkout link.',
    chat: [
      { from: 'customer', text: 'Need a gift for my dad under 2000' },
      { from: 'bot', text: 'Top picks: leather wallet (₹1,299), steel watch strap (₹999), travel kit (₹1,799). Want photos?' },
      { from: 'customer', text: 'The wallet!' },
      { from: 'bot', text: 'Great choice. Here’s your link: shop.example/p/wallet' },
    ],
  },
  {
    id: 'actions',
    label: 'Actions',
    icon: Zap,
    title: 'Takes action, not just replies',
    text: 'Check order status, book appointments, create leads in your CRM or hand over to a teammate — the assistant calls your tools mid-conversation.',
    chat: [
      { from: 'customer', text: 'Where is my order #4821?' },
      { from: 'bot', text: 'It left our warehouse this morning and arrives Thursday. Tracking: track.example/4821' },
      { from: 'customer', text: 'Can I change the address?' },
      { from: 'agent', text: 'Hi, this is Meera from support — I’ve updated it for you.' },
    ],
  },
]

export function AiChatbot() {
  const [active, setActive] = useState(tabs[0].id)
  const baseId = useId()
  const tab = tabs.find((t) => t.id === active) ?? tabs[0]

  return (
    <Section id="ai-chatbot">
      <SectionHeading
        eyebrow="AI chatbot"
        title="An assistant that answers like your best salesperson"
        description="Train it on your products, prices and policies. It replies on every Meta channel, around the clock."
      />
      <div className="mt-12 grid items-center gap-10 lg:grid-cols-2">
        <div>
          <div role="tablist" aria-label="Assistant capabilities" className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                id={`${baseId}-tab-${id}`}
                role="tab"
                type="button"
                aria-selected={active === id}
                aria-controls={`${baseId}-panel`}
                onClick={() => setActive(id)}
                className={cn(
                  'flex items-center gap-2 rounded-xl border px-3 py-3 text-left text-sm font-semibold transition-colors',
                  active === id ? 'border-brand-500 bg-brand-50 text-brand-900' : 'border-line bg-white text-ink-soft hover:border-brand-200',
                )}
              >
                <Icon aria-hidden className="size-4.5 shrink-0" /> {label}
              </button>
            ))}
          </div>
          <div id={`${baseId}-panel`} role="tabpanel" aria-labelledby={`${baseId}-tab-${tab.id}`} className="mt-8">
            <h3 className="text-2xl font-bold">{tab.title}</h3>
            <p className="mt-3 leading-relaxed text-ink-soft">{tab.text}</p>
          </div>
        </div>
        <ChatMock key={tab.id} title="Your business" subtitle="AI assistant" lines={tab.chat} />
      </div>
    </Section>
  )
}
