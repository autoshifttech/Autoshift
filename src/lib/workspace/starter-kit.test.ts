import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BUSINESS_TYPES } from './pages'
import { STARTER_INSTRUCTIONS, STARTER_PIPELINE } from './starter-kit'

const messages = (l: string) => JSON.parse(readFileSync(join(process.cwd(), 'messages', `${l}.json`), 'utf8'))

describe('starter kit per business type', () => {
  it('every business type has a pipeline, instructions and a translated assistant name', () => {
    for (const type of BUSINESS_TYPES) {
      expect(['sales', 'orders', 'bookings']).toContain(STARTER_PIPELINE[type])
      expect(STARTER_INSTRUCTIONS[type].length).toBeGreaterThan(80)
      for (const l of ['en', 'pt', 'es', 'ko']) {
        const m = messages(l)
        expect(m.Onboarding[`starterAssistant_${type}`], `${l} ${type}`).toBeTruthy()
        expect(m.Pipelines[`presetStages_${STARTER_PIPELINE[type]}`].length).toBeGreaterThan(2)
      }
    }
  })

  it('shops start with the order pipeline, whose stage names the payment code moves orders through', () => {
    expect(STARTER_PIPELINE.retail).toBe('orders')
    expect(messages('en').Pipelines.presetStages_orders).toEqual(expect.arrayContaining(['New order', 'Paid', 'Cash on delivery', 'Shipped', 'Delivered']))
  })

  it('a clinic assistant never gives medical advice', () => {
    expect(STARTER_INSTRUCTIONS.clinic).toMatch(/never give medical advice/i)
  })
})
