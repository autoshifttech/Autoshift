export type Country = { code: string; name: string; dial: string }

export const countries: Country[] = [
  { code: 'IN', name: 'India', dial: '91' },
  { code: 'US', name: 'United States', dial: '1' },
  { code: 'CA', name: 'Canada', dial: '1' },
  { code: 'GB', name: 'United Kingdom', dial: '44' },
  { code: 'AE', name: 'United Arab Emirates', dial: '971' },
  { code: 'SA', name: 'Saudi Arabia', dial: '966' },
  { code: 'QA', name: 'Qatar', dial: '974' },
  { code: 'SG', name: 'Singapore', dial: '65' },
  { code: 'MY', name: 'Malaysia', dial: '60' },
  { code: 'ID', name: 'Indonesia', dial: '62' },
  { code: 'PH', name: 'Philippines', dial: '63' },
  { code: 'LK', name: 'Sri Lanka', dial: '94' },
  { code: 'BD', name: 'Bangladesh', dial: '880' },
  { code: 'PK', name: 'Pakistan', dial: '92' },
  { code: 'NP', name: 'Nepal', dial: '977' },
  { code: 'AU', name: 'Australia', dial: '61' },
  { code: 'NZ', name: 'New Zealand', dial: '64' },
  { code: 'DE', name: 'Germany', dial: '49' },
  { code: 'FR', name: 'France', dial: '33' },
  { code: 'ES', name: 'Spain', dial: '34' },
  { code: 'IT', name: 'Italy', dial: '39' },
  { code: 'NL', name: 'Netherlands', dial: '31' },
  { code: 'BR', name: 'Brazil', dial: '55' },
  { code: 'MX', name: 'Mexico', dial: '52' },
  { code: 'ZA', name: 'South Africa', dial: '27' },
  { code: 'NG', name: 'Nigeria', dial: '234' },
  { code: 'KE', name: 'Kenya', dial: '254' },
  { code: 'EG', name: 'Egypt', dial: '20' },
  { code: 'TR', name: 'Türkiye', dial: '90' },
]

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '')
}

/** Validates a national number (without country code). Returns an error message or null. */
export function validateNationalNumber(dial: string, national: string): string | null {
  const digits = digitsOnly(national)
  if (!digits) return 'Enter your WhatsApp number.'
  if (digits.startsWith(dial) && digits.length > 10) return 'Leave out the country code — pick it from the list instead.'
  const full = dial + digits.replace(/^0+/, '')
  if (full.length < 8 || full.length > 15) return 'That number looks too short or too long.'
  return null
}

/** Builds a click-to-chat link: https://wa.me/<full number>?text=<message> */
export function buildWaLink(dial: string, national: string, message = ''): string {
  const number = dial + digitsOnly(national).replace(/^0+/, '')
  const text = message.trim()
  return `https://wa.me/${number}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}

export type FormatStyle = 'bold' | 'italic' | 'strike' | 'mono'
export const markers: Record<FormatStyle, string> = { bold: '*', italic: '_', strike: '~', mono: '```' }

/** Wraps the selected range with WhatsApp formatting markers. */
export function wrapSelection(text: string, start: number, end: number, style: FormatStyle) {
  const marker = markers[style]
  const selected = text.slice(start, end) || 'text'
  const next = text.slice(0, start) + marker + selected + marker + text.slice(end)
  return { text: next, selectionStart: start + marker.length, selectionEnd: start + marker.length + selected.length }
}

/** Prefixes each selected line with a list marker. */
export function prefixLines(text: string, start: number, end: number, kind: 'bullet' | 'number' | 'quote') {
  const lineStart = text.lastIndexOf('\n', start - 1) + 1
  const lineEndIndex = text.indexOf('\n', end)
  const lineEnd = lineEndIndex === -1 ? text.length : lineEndIndex
  const lines = text.slice(lineStart, lineEnd).split('\n')
  const replaced = lines
    .map((line, index) => (kind === 'bullet' ? `- ${line}` : kind === 'number' ? `${index + 1}. ${line}` : `> ${line}`))
    .join('\n')
  return { text: text.slice(0, lineStart) + replaced + text.slice(lineEnd), selectionStart: lineStart, selectionEnd: lineStart + replaced.length }
}

export type InlineToken = { text: string; styles: FormatStyle[] }

const inlinePattern = /```([^`]+?)```|\*([^*\n]+?)\*|_([^_\n]+?)_|~([^~\n]+?)~/

/** Parses WhatsApp inline formatting into styled text runs (supports nesting). */
export function parseInline(text: string, inherited: FormatStyle[] = []): InlineToken[] {
  const tokens: InlineToken[] = []
  let rest = text
  while (rest) {
    const match = inlinePattern.exec(rest)
    if (!match) {
      tokens.push({ text: rest, styles: inherited })
      break
    }
    if (match.index > 0) tokens.push({ text: rest.slice(0, match.index), styles: inherited })
    const [, mono, bold, italic, strike] = match
    if (mono !== undefined) tokens.push({ text: mono, styles: [...inherited, 'mono'] })
    else if (bold !== undefined) tokens.push(...parseInline(bold, [...inherited, 'bold']))
    else if (italic !== undefined) tokens.push(...parseInline(italic, [...inherited, 'italic']))
    else if (strike !== undefined) tokens.push(...parseInline(strike, [...inherited, 'strike']))
    rest = rest.slice(match.index + match[0].length)
  }
  return tokens
}
