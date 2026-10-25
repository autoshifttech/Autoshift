import { describe, expect, it } from 'vitest'
import { DRIP_TEMPLATES, costPerContact, newDrip, priceOf, renderTemplate, totalDuration } from './model'

describe('drips', () => {
  it('prices steps by template category', () => {
    const marketing = DRIP_TEMPLATES.find((t) => t.category === 'marketing')!.name
    const utility = DRIP_TEMPLATES.find((t) => t.category === 'utility')!.name
    expect(priceOf(marketing)).toBeGreaterThan(priceOf(utility))
    const d = { steps: [{ template: marketing }, { template: utility }] as never }
    expect(costPerContact(d)).toBeCloseTo(priceOf(marketing) + priceOf(utility), 2)
  })

  it('adds up delays across units', () => {
    expect(totalDuration([{ delay: 10, unit: 'minutes' }, { delay: 2, unit: 'hours' }, { delay: 1, unit: 'days' }])).toBe(10 + 120 + 1440)
  })

  it('fills the name variable and starts drafts with one step', () => {
    expect(renderTemplate('Hi {{name}}, bye {{name}}', 'Priya')).toBe('Hi Priya, bye Priya')
    const d = newDrip({ kind: 'segment', value: 'sg-hot' })
    expect(d.status).toBe('draft')
    expect(d.steps).toHaveLength(1)
    expect(d.trigger.value).toBe('sg-hot')
  })
})
