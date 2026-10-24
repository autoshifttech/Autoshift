import { afterEach, describe, expect, it } from 'vitest'
import { isSupabaseConfigured, supabasePublicConfig } from './config'

const saved = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY }

afterEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = saved.url
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = saved.key
  if (saved.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
  if (saved.key === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
})

describe('isSupabaseConfigured', () => {
  it('accepts a real project URL and key', () => {
    expect(isSupabaseConfigured('https://abcd.supabase.co', 'eyJ...')).toBe(true)
    expect(isSupabaseConfigured('http://127.0.0.1:54321', 'anon')).toBe(true)
  })

  it.each([
    [undefined, 'key'],
    ['', 'key'],
    ['https://abcd.supabase.co', ''],
    ['REPLACE_https://your-project-ref.supabase.co', 'key'],
    ['https://abcd.supabase.co', 'REPLACE_anon_public_key'],
    ['abcd.supabase.co', 'key'],
    ['"https://abcd.supabase.co"', 'key'],
  ])('rejects %j / %j', (url, key) => {
    expect(isSupabaseConfigured(url, key)).toBe(false)
  })
})

describe('supabasePublicConfig', () => {
  it('passes real values through', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = ' https://abcd.supabase.co '
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon'
    expect(supabasePublicConfig()).toEqual({ url: 'https://abcd.supabase.co', anonKey: 'anon', configured: true })
  })

  it('falls back to a placeholder that is still a valid URL', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'REPLACE_https://your-project-ref.supabase.co'
    const config = supabasePublicConfig()
    expect(config.configured).toBe(false)
    expect(() => new URL(config.url)).not.toThrow()
    expect(config.anonKey.length).toBeGreaterThan(0)
  })
})
