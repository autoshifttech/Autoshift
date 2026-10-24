import { describe, expect, it } from 'vitest'
import {
  NODE_CATALOGUE,
  WORKFLOW_TEMPLATES,
  catalogueSnippet,
  isDeliverableWebhookUrl,
  jsString,
  normalizeBaseUrl,
  textMessageBody,
  webhookRegistrationCurl,
} from './workflows'

const BASE = 'https://crm.example.com/'

describe('workflow templates', () => {
  it.each(WORKFLOW_TEMPLATES.map((t) => [t.id, t] as const))('%s is a well-formed n8n workflow', (_id, template) => {
    const workflow = template.build(BASE)
    const names = workflow.nodes.map((n) => n.name)
    expect(new Set(names).size).toBe(names.length)
    expect(new Set(workflow.nodes.map((n) => n.id)).size).toBe(names.length)
    expect(workflow.nodes[0].type).toBe('n8n-nodes-base.webhook')
    // Every connection points at a node that exists.
    for (const [from, { main }] of Object.entries(workflow.connections)) {
      expect(names).toContain(from)
      for (const output of main) for (const link of output) expect(names).toContain(link.node)
    }
    // Every non-trigger node is reachable from the trigger.
    const targets = new Set(Object.values(workflow.connections).flatMap(({ main }) => main.flat().map((l) => l.node)))
    for (const name of names.slice(1)) expect(targets).toContain(name)
    // URLs use the normalised base and never embed an API key.
    const json = JSON.stringify(workflow)
    expect(json).toContain('https://crm.example.com/api/v1/')
    expect(json).not.toContain('example.com//api')
    expect(json).not.toMatch(/autoshift_live_/)
    for (const node of workflow.nodes.filter((n) => n.type === 'n8n-nodes-base.httpRequest')) {
      expect(node.parameters).toMatchObject({ authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth' })
    }
  })

  it('routes the keyword branch: true on output 0, false on output 1, laid out on separate rows', () => {
    const workflow = WORKFLOW_TEMPLATES.find((t) => t.id === 'keyword-router')!.build(BASE)
    const [yes, no] = workflow.connections['Asks about price?'].main
    expect(yes[0].node).toBe('Send price list')
    expect(no[0].node).toBe('Send hand-off')
    const pos = Object.fromEntries(workflow.nodes.map((n) => [n.name, n.position]))
    expect(pos['Send price list'][0]).toBe(pos['Send hand-off'][0])
    expect(pos['Send price list'][1]).toBeLessThan(pos['Send hand-off'][1])
  })

  it('replies to the number looked up from the contact, since webhooks carry only contact_id', () => {
    const workflow = WORKFLOW_TEMPLATES.find((t) => t.id === 'auto-reply')!.build(BASE)
    const reply = workflow.nodes.find((n) => n.name === 'Send reply')!
    expect(reply.parameters.jsonBody).toContain("$('Look up contact').item.json.data.phone")
    const lookup = workflow.nodes.find((n) => n.name === 'Look up contact')!
    expect(lookup.parameters.url).toBe("=https://crm.example.com/api/v1/contacts/{{ $('AutoShift event').item.json.body.data.contact_id }}")
  })
})

describe('node catalogue', () => {
  it('builds a pasteable single-node workflow for every entry', () => {
    for (const entry of NODE_CATALOGUE) {
      const snippet = catalogueSnippet(entry, BASE)
      expect(snippet.nodes).toHaveLength(1)
      expect(snippet.connections).toEqual({})
    }
  })
})

describe('helpers', () => {
  it('escapes text for n8n expressions', () => {
    expect(jsString("It's a \\ test\nline")).toBe("'It\\'s a \\\\ test\\nline'")
    expect(textMessageBody('x', "Don't")).toBe("={{ JSON.stringify({ to: x, type: 'text', text: 'Don\\'t' }) }}")
  })

  it('normalises the base URL', () => {
    expect(normalizeBaseUrl(' https://a.b/// ')).toBe('https://a.b')
  })

  it('only accepts https, non-internal webhook targets', () => {
    expect(isDeliverableWebhookUrl('https://n8n.example.com/webhook/autoshift')).toBe(true)
    expect(isDeliverableWebhookUrl('http://n8n.example.com/webhook/autoshift')).toBe(false)
    expect(isDeliverableWebhookUrl('https://localhost:5678/webhook/x')).toBe(false)
    expect(isDeliverableWebhookUrl('https://192.168.1.4/webhook/x')).toBe(false)
    expect(isDeliverableWebhookUrl('not a url')).toBe(false)
  })

  it('builds the webhook registration call with the chosen events', () => {
    const curl = webhookRegistrationCurl(BASE, 'https://n8n.example.com/webhook/a', ['message.received'])
    expect(curl).toContain('curl -X POST https://crm.example.com/api/v1/webhooks')
    expect(curl).toContain('"url":"https://n8n.example.com/webhook/a","events":["message.received"]')
  })
})
