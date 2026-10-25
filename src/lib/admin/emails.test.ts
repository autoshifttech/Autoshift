import { describe, expect, it } from 'vitest'
import { DEFAULT_EMAILS, fill, unknownVariables } from './emails'

describe('owner emails', () => {
  it('fills known variables and leaves unknown ones as typed', () => {
    expect(fill('Hi {{owner_name}}, {{ business_name }}!', { owner_name: 'Asha', business_name: 'Olive' })).toBe('Hi Asha, Olive!')
    expect(fill('Hi {{nickname}}')).toBe('Hi {{nickname}}')
  })

  it('finds unknown variables once', () => {
    expect(unknownVariables('{{owner_name}} {{nick}} {{nick}}')).toEqual(['nick'])
  })

  it('ships default emails that only use known variables', () => {
    for (const e of DEFAULT_EMAILS) expect(unknownVariables(`${e.subject} ${e.body}`)).toEqual([])
  })
})
