import { describe, expect, it } from 'vitest'
import { billingErrors, checkGstin, emptyBillingDetails, gstinCheckChar, taxSplit } from './gst'

// Build a valid GSTIN for a state from a sample PAN.
const make = (state: string, pan = 'AAPFU0939F') => {
  const first14 = `${state}${pan}1Z`
  return first14 + gstinCheckChar(first14)
}

describe('GSTIN', () => {
  it('accepts a well-formed GSTIN with the right check character', () => {
    expect(checkGstin('27AAPFU0939F1ZV')).toEqual({ ok: true, stateCode: '27' })
    expect(checkGstin(make('29').toLowerCase())).toEqual({ ok: true, stateCode: '29' })
  })

  it('rejects a wrong check character, shape or state code', () => {
    expect(checkGstin('27AAPFU0939F1ZA')).toEqual({ ok: false, problem: 'checksum' })
    expect(checkGstin('27AAPFU0939F')).toEqual({ ok: false, problem: 'format' })
    expect(checkGstin(make('99'))).toEqual({ ok: false, problem: 'state' })
  })
})

describe('tax split', () => {
  it('uses CGST + SGST inside the seller state', () => {
    expect(taxSplit(2499, '29', '29')).toMatchObject({ cgst: 224.91, sgst: 224.91, igst: 0, total: 2948.82, intraState: true })
  })

  it('uses IGST for other states', () => {
    expect(taxSplit(2499, '27', '29')).toMatchObject({ cgst: 0, sgst: 0, igst: 449.82, total: 2948.82, intraState: false })
  })
})

describe('billing details', () => {
  it('needs a name and state, and a full address with a GSTIN', () => {
    expect(Object.keys(billingErrors(emptyBillingDetails())).sort()).toEqual(['legalName', 'stateCode'])
    const d = { ...emptyBillingDetails(), legalName: 'Olive & Thread LLP', stateCode: '08', hasGstin: true, gstin: make('29') }
    const e = billingErrors(d)
    expect(e.stateCode).toBe('mismatch')
    expect(e.address).toBe('required')
    expect(e.pincode).toBe('invalid')
  })

  it('passes a complete B2B invoice', () => {
    const d = { ...emptyBillingDetails(), legalName: 'Olive & Thread LLP', stateCode: '08', hasGstin: true, gstin: make('08'), address: 'MI Road', city: 'Jaipur', pincode: '302001' }
    expect(billingErrors(d)).toEqual({})
  })
})
