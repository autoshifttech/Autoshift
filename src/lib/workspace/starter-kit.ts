// ============================================================
// What a new business gets when it finishes sign-up, by business type: a starter AI assistant
// (switched off until they review it) and a starter pipeline on the Leads page. Nothing is made
// twice: it's skipped when the business already has an assistant or a pipeline.
// ============================================================

import { backendUrl } from '@/lib/backend/client'
import { DEFAULT_SHOP, newAssistant, type AssistantRole } from '@/lib/assistants/model'
import { httpApi, toBody } from '@/lib/assistants/backend-sync'
import { createPipeline, loadPipelines, pipelinesStore } from '@/lib/leads/pipelines'
import { isShopType, type BusinessType } from '@/lib/workspace/pages'
import { isLive } from '@/lib/workspace/live'

type PipelineKind = 'sales' | 'orders' | 'bookings'

/** The pipeline each type starts with. */
export const STARTER_PIPELINE: Record<BusinessType, PipelineKind> = {
  retail: 'orders',
  restaurant: 'orders',
  clinic: 'bookings',
  salon: 'bookings',
  real_estate: 'sales',
  education: 'sales',
  services: 'sales',
  other: 'sales',
}

/** What the starter assistant is told (the AI answers in the customer's language whatever this is written in). */
export const STARTER_INSTRUCTIONS: Record<BusinessType, string> = {
  retail:
    'You are the WhatsApp assistant for our shop. Help customers find products from our product list: ask what they need, their size and budget, then suggest 1–3 products with code and price. Answer questions about delivery, returns and order status. Never invent a product, price or offer.',
  restaurant:
    'You are the WhatsApp assistant for our restaurant. Share the menu and prices from our product list, take orders for delivery or pickup, and answer questions about timings and location. Never invent a dish, price or offer.',
  clinic:
    'You are the WhatsApp receptionist for our clinic. Share timings, consultation fees and directions. To book a visit, ask for the patient name, the problem in a few words, and a preferred date and time, then say the team will confirm. Never give medical advice: for anything medical, say a doctor will reply.',
  salon:
    'You are the WhatsApp receptionist for our salon. Share services, prices and timings. To book, ask for the name, the service and a preferred date and time, then say the team will confirm the slot. Never invent a price or offer.',
  real_estate:
    'You are the WhatsApp assistant for our real estate business. Share project details, price ranges, sizes, amenities and location. Ask what the customer is looking for (budget, location, size) and offer a site visit: ask for their name and a preferred date and time. Never invent a price or availability.',
  education:
    'You are the WhatsApp assistant for our institute. Share courses, batch timings, fees and demo class details. Ask the student name, the course they are interested in and a good time for a call or demo class. Never invent a fee or a batch.',
  services:
    'You are the WhatsApp assistant for our business. Explain our services and prices, ask what the customer needs, and collect their name, location and a good time for the team to call. Never invent a price or promise.',
  other:
    'You are the WhatsApp assistant for our business. Answer questions from the facts given, ask what the customer needs, and collect their name and details so the team can follow up. Never invent a price or promise.',
}

const ROLE: Record<BusinessType, AssistantRole> = {
  retail: 'sales',
  restaurant: 'sales',
  clinic: 'support',
  salon: 'support',
  real_estate: 'sales',
  education: 'sales',
  services: 'sales',
  other: 'support',
}

export interface StarterText {
  assistantName: string
  pipelineName: string
  stages: string[]
}

export interface StarterResult {
  assistant: 'made' | 'skipped' | 'failed'
  pipeline: 'made' | 'skipped' | 'failed'
}

/**
 * Sets the new business up for its type. `text` carries the translated names and stages.
 * Never throws: what couldn't be made is reported, and the business can add it later.
 */
export async function applyStarterKit(
  type: BusinessType,
  opts: { ai: boolean; leads: boolean; shopSource?: string | null; text: StarterText },
): Promise<StarterResult> {
  const out: StarterResult = { assistant: 'skipped', pipeline: 'skipped' }

  if (opts.ai && backendUrl()) {
    try {
      const existing = await httpApi.list()
      if (existing.length === 0) {
        const shop = isShopType(type) && (opts.shopSource ?? 'whatsapp') === 'whatsapp'
        const a = {
          ...newAssistant(ROLE[type]),
          name: opts.text.assistantName.slice(0, 80),
          instructions: STARTER_INSTRUCTIONS[type],
          // Switched off until the business has looked at it and added its own facts.
          enabled: false,
          useCatalog: isShopType(type),
          shop: shop ? { ...DEFAULT_SHOP, enabled: true } : undefined,
          booking: { enabled: type === 'clinic' || type === 'salon' },
        }
        await httpApi.create(toBody(a))
        out.assistant = 'made'
      }
    } catch (err) {
      console.error('[starter kit] assistant not made', err)
      out.assistant = 'failed'
    }
  }

  if ((opts.leads || isShopType(type)) && isLive()) {
    try {
      await loadPipelines(true)
      if (pipelinesStore.get().pipelines.length === 0 && opts.text.stages.length > 0) {
        await createPipeline(opts.text.pipelineName, opts.text.stages)
        out.pipeline = 'made'
      }
    } catch (err) {
      console.error('[starter kit] pipeline not made', err)
      out.pipeline = 'failed'
    }
  }
  return out
}
