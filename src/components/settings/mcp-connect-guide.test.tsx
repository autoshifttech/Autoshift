import { describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import en from '../../../messages/en.json'

vi.mock('@/lib/backend/client', () => ({ backendUrl: () => 'https://api.example.com' }))
import { McpConnectGuide } from './mcp-connect-guide'

const render = (props: Parameters<typeof McpConnectGuide>[0]) =>
  renderToString(
    <NextIntlClientProvider locale="en" messages={en}>
      <McpConnectGuide {...props} />
    </NextIntlClientProvider>,
  )

describe('MCP connection guide', () => {
  it('shows the server address and ready-to-paste setup with a placeholder key', () => {
    const html = render({})
    expect(html).toContain('Connect AutoShift to an AI')
    expect(html).toContain('https://api.example.com/mcp/')
    expect(html).toContain('claude mcp add --transport http autoshift')
    expect(html).toContain('asmcp_YOUR_KEY')
  })

  it('fills in a freshly created key', () => {
    expect(render({ apiKey: 'asmcp_abc123' })).toContain('Bearer asmcp_abc123')
  })
})
