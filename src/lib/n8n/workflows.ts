/**
 * n8n building blocks for AutoShift.
 *
 * AutoShift ↔ n8n runs on two existing public surfaces:
 *   - Receive: AutoShift POSTs webhook events (message.received,
 *     message.status_updated, conversation.created) to an n8n Webhook node.
 *   - Send: n8n's HTTP Request node calls the public REST API
 *     (POST /api/v1/messages, /contacts, /broadcasts) with an API key.
 *
 * Everything here is pure: it builds n8n workflow JSON (the format n8n
 * exports and imports) for a given AutoShift base URL. The API key is
 * never embedded — HTTP nodes use n8n's "Header Auth" credential, which
 * the user picks once after import.
 */

export type N8nNode = {
  id: string
  name: string
  type: string
  typeVersion: number
  position: [number, number]
  parameters: Record<string, unknown>
  webhookId?: string
}

export type N8nConnections = Record<string, { main: { node: string; type: 'main'; index: number }[][] }>

export type N8nWorkflow = {
  name: string
  nodes: N8nNode[]
  connections: N8nConnections
  settings: { executionOrder: 'v1' }
  pinData: Record<string, never>
}

/** Name shown for the Header Auth credential (Authorization: Bearer autoshift_live_…). */
export const CREDENTIAL_NAME = 'AutoShift API key'

export function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '')
}

/** Deterministic ids keep generated JSON stable (tests, diffs, re-imports). */
function nodeId(workflow: string, index: number): string {
  let hash = 0
  for (const char of `${workflow}:${index}`) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  const hex = hash.toString(16).padStart(8, '0')
  return `${hex}-${hex.slice(0, 4)}-4${hex.slice(1, 4)}-8${hex.slice(4, 7)}-${hex}${hex.slice(0, 4)}`
}

export function webhookTrigger(name: string, path: string): Omit<N8nNode, 'id' | 'position'> {
  return {
    name,
    type: 'n8n-nodes-base.webhook',
    typeVersion: 2,
    parameters: { httpMethod: 'POST', path, responseMode: 'onReceived', options: {} },
  }
}

type HttpArgs = {
  name: string
  method: 'GET' | 'POST' | 'PATCH'
  /** Full URL; may contain n8n expressions when it starts with "=". */
  url: string
  /** An n8n expression that evaluates to the JSON body string. */
  jsonBody?: string
}

export function httpRequest({ name, method, url, jsonBody }: HttpArgs): Omit<N8nNode, 'id' | 'position'> {
  return {
    name,
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    parameters: {
      method,
      url,
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      ...(jsonBody ? { sendBody: true, specifyBody: 'json', jsonBody } : {}),
      options: {},
    },
  }
}

export function ifNode(name: string, leftValue: string, operation: 'equals' | 'contains', rightValue: string): Omit<N8nNode, 'id' | 'position'> {
  return {
    name,
    type: 'n8n-nodes-base.if',
    typeVersion: 2,
    parameters: {
      conditions: {
        options: { caseSensitive: false, leftValue: '', typeValidation: 'loose' },
        conditions: [{ id: 'condition-1', leftValue, rightValue, operator: { type: 'string', operation } }],
        combinator: 'and',
      },
      options: {},
    },
  }
}

/** Escape text for use inside a single-quoted JavaScript string in an n8n expression. */
export function jsString(text: string): string {
  return `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`
}

/** Body expression for POST /api/v1/messages with a text message. */
export function textMessageBody(toExpression: string, text: string): string {
  return `={{ JSON.stringify({ to: ${toExpression}, type: 'text', text: ${jsString(text)} }) }}`
}

type Step = { node: Omit<N8nNode, 'id' | 'position'>; next?: string[]; nextFalse?: string[] }

/** Lays nodes out left→right (true branch on top, false branch below) and wires connections. */
export function assemble(name: string, steps: Step[]): N8nWorkflow {
  const nodes: N8nNode[] = []
  const connections: N8nConnections = {}
  const column = new Map<string, number>()
  const row = new Map<string, number>()
  steps.forEach((step, index) => {
    const col = column.get(step.node.name) ?? index
    const r = row.get(step.node.name) ?? 0
    for (const target of step.next ?? []) {
      column.set(target, col + 1)
      row.set(target, r)
    }
    for (const target of step.nextFalse ?? []) {
      column.set(target, col + 1)
      row.set(target, r + 1)
    }
    nodes.push({ id: nodeId(name, index), position: [col * 260, r * 200], ...step.node })
    const outputs: N8nConnections[string]['main'] = []
    if (step.next) outputs.push(step.next.map((node) => ({ node, type: 'main' as const, index: 0 })))
    if (step.nextFalse) outputs.push(step.nextFalse.map((node) => ({ node, type: 'main' as const, index: 0 })))
    if (outputs.length) connections[step.node.name] = { main: outputs }
  })
  return { name, nodes, connections, settings: { executionOrder: 'v1' }, pinData: {} }
}

// --- Expressions -----------------------------------------------------------

const EVENT = "$('AutoShift event').item.json.body"
const CONTACT_PHONE = "$('Look up contact').item.json.data.phone"

// --- Node catalogue ----------------------------------------------------------

export type CatalogueEntry = {
  id: 'receive' | 'send-text' | 'send-template' | 'send-media' | 'get-contact' | 'create-contact' | 'update-contact' | 'conversation-messages' | 'broadcast'
  kind: 'trigger' | 'action'
  method: 'WEBHOOK' | 'GET' | 'POST' | 'PATCH'
  path: string
  scope: string | null
  node: (baseUrl: string) => Omit<N8nNode, 'id' | 'position'>
}

export const NODE_CATALOGUE: CatalogueEntry[] = [
  {
    id: 'receive',
    kind: 'trigger',
    method: 'WEBHOOK',
    path: 'message.received · message.status_updated · conversation.created',
    scope: null,
    node: () => webhookTrigger('AutoShift event', 'autoshift'),
  },
  {
    id: 'send-text',
    kind: 'action',
    method: 'POST',
    path: '/api/v1/messages',
    scope: 'messages:send',
    node: (base) =>
      httpRequest({ name: 'Send message', method: 'POST', url: `${base}/api/v1/messages`, jsonBody: textMessageBody("'+14155550123'", 'Hi 👋') }),
  },
  {
    id: 'send-template',
    kind: 'action',
    method: 'POST',
    path: '/api/v1/messages',
    scope: 'messages:send',
    node: (base) =>
      httpRequest({
        name: 'Send template',
        method: 'POST',
        url: `${base}/api/v1/messages`,
        jsonBody:
          "={{ JSON.stringify({ to: '+14155550123', type: 'template', template: { name: 'order_update', language: 'en_US', params: ['A123'] } }) }}",
      }),
  },
  {
    id: 'send-media',
    kind: 'action',
    method: 'POST',
    path: '/api/v1/messages',
    scope: 'messages:send',
    node: (base) =>
      httpRequest({
        name: 'Send media',
        method: 'POST',
        url: `${base}/api/v1/messages`,
        jsonBody:
          "={{ JSON.stringify({ to: '+14155550123', type: 'image', media_url: 'https://example.com/menu.jpg', text: 'Our menu' }) }}",
      }),
  },
  {
    id: 'get-contact',
    kind: 'action',
    method: 'GET',
    path: '/api/v1/contacts/{id}',
    scope: 'contacts:read',
    node: (base) => httpRequest({ name: 'Look up contact', method: 'GET', url: `=${base}/api/v1/contacts/{{ $json.body.data.contact_id }}` }),
  },
  {
    id: 'create-contact',
    kind: 'action',
    method: 'POST',
    path: '/api/v1/contacts',
    scope: 'contacts:write',
    node: (base) =>
      httpRequest({
        name: 'Create contact',
        method: 'POST',
        url: `${base}/api/v1/contacts`,
        jsonBody: "={{ JSON.stringify({ phone: '+14155550123', name: 'Jane Doe', tags: ['lead'] }) }}",
      }),
  },
  {
    id: 'update-contact',
    kind: 'action',
    method: 'PATCH',
    path: '/api/v1/contacts/{id}',
    scope: 'contacts:write',
    node: (base) =>
      httpRequest({
        name: 'Update contact',
        method: 'PATCH',
        url: `=${base}/api/v1/contacts/{{ $json.body.data.contact_id }}`,
        jsonBody: "={{ JSON.stringify({ tags: ['interested'] }) }}",
      }),
  },
  {
    id: 'conversation-messages',
    kind: 'action',
    method: 'GET',
    path: '/api/v1/conversations/{id}/messages',
    scope: 'messages:read',
    node: (base) =>
      httpRequest({ name: 'Read conversation', method: 'GET', url: `=${base}/api/v1/conversations/{{ $json.body.data.conversation_id }}/messages` }),
  },
  {
    id: 'broadcast',
    kind: 'action',
    method: 'POST',
    path: '/api/v1/broadcasts',
    scope: 'broadcasts:send',
    node: (base) =>
      httpRequest({
        name: 'Start broadcast',
        method: 'POST',
        url: `${base}/api/v1/broadcasts`,
        jsonBody:
          "={{ JSON.stringify({ name: 'July promo', template_name: 'promo_july', template_language: 'en_US', recipients: [{ to: '+14155550123', params: ['Jane'] }] }) }}",
      }),
  },
]

/** A single node wrapped so it can be pasted straight onto an n8n canvas. */
export function catalogueSnippet(entry: CatalogueEntry, baseUrl: string): N8nWorkflow {
  return assemble(entry.id, [{ node: entry.node(normalizeBaseUrl(baseUrl)) }])
}

// --- Workflow templates ------------------------------------------------------

export type TemplateId = 'auto-reply' | 'keyword-router' | 'welcome' | 'failed-delivery'

export type WorkflowTemplate = {
  id: TemplateId
  events: string[]
  scopes: string[]
  build: (baseUrl: string) => N8nWorkflow
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'auto-reply',
    events: ['message.received'],
    scopes: ['contacts:read', 'messages:send'],
    build: (raw) => {
      const base = normalizeBaseUrl(raw)
      return assemble('AutoShift · Auto-reply', [
        { node: webhookTrigger('AutoShift event', 'autoshift-auto-reply'), next: ['Is a message?'] },
        { node: ifNode('Is a message?', `={{ ${EVENT}.event }}`, 'equals', 'message.received'), next: ['Look up contact'] },
        { node: httpRequest({ name: 'Look up contact', method: 'GET', url: `=${base}/api/v1/contacts/{{ ${EVENT}.data.contact_id }}` }), next: ['Send reply'] },
        {
          node: httpRequest({
            name: 'Send reply',
            method: 'POST',
            url: `${base}/api/v1/messages`,
            jsonBody: textMessageBody(CONTACT_PHONE, 'Thanks for your message! We will get back to you shortly.'),
          }),
        },
      ])
    },
  },
  {
    id: 'keyword-router',
    events: ['message.received'],
    scopes: ['contacts:read', 'messages:send'],
    build: (raw) => {
      const base = normalizeBaseUrl(raw)
      return assemble('AutoShift · Keyword router', [
        { node: webhookTrigger('AutoShift event', 'autoshift-keywords'), next: ['Look up contact'] },
        { node: httpRequest({ name: 'Look up contact', method: 'GET', url: `=${base}/api/v1/contacts/{{ ${EVENT}.data.contact_id }}` }), next: ['Asks about price?'] },
        { node: ifNode('Asks about price?', `={{ ${EVENT}.data.text }}`, 'contains', 'price'), next: ['Send price list'], nextFalse: ['Send hand-off'] },
        {
          node: httpRequest({
            name: 'Send price list',
            method: 'POST',
            url: `${base}/api/v1/messages`,
            jsonBody: textMessageBody(CONTACT_PHONE, 'Here is our price list: https://example.com/prices'),
          }),
        },
        {
          node: httpRequest({
            name: 'Send hand-off',
            method: 'POST',
            url: `${base}/api/v1/messages`,
            jsonBody: textMessageBody(CONTACT_PHONE, 'Thanks! A teammate will reply in a few minutes.'),
          }),
        },
      ])
    },
  },
  {
    id: 'welcome',
    events: ['conversation.created'],
    scopes: ['contacts:read', 'messages:send', 'contacts:write'],
    build: (raw) => {
      const base = normalizeBaseUrl(raw)
      return assemble('AutoShift · Welcome new conversations', [
        { node: webhookTrigger('AutoShift event', 'autoshift-welcome'), next: ['Look up contact'] },
        { node: httpRequest({ name: 'Look up contact', method: 'GET', url: `=${base}/api/v1/contacts/{{ ${EVENT}.data.contact_id }}` }), next: ['Send welcome'] },
        {
          node: httpRequest({
            name: 'Send welcome',
            method: 'POST',
            url: `${base}/api/v1/messages`,
            jsonBody: textMessageBody(CONTACT_PHONE, 'Welcome! How can we help you today?'),
          }),
          next: ['Tag as new lead'],
        },
        {
          node: httpRequest({
            name: 'Tag as new lead',
            method: 'PATCH',
            url: `=${base}/api/v1/contacts/{{ ${EVENT}.data.contact_id }}`,
            jsonBody: "={{ JSON.stringify({ tags: ['new lead'] }) }}",
          }),
        },
      ])
    },
  },
  {
    id: 'failed-delivery',
    events: ['message.status_updated'],
    scopes: ['messages:send'],
    build: (raw) => {
      const base = normalizeBaseUrl(raw)
      return assemble('AutoShift · Failed delivery alert', [
        { node: webhookTrigger('AutoShift event', 'autoshift-delivery'), next: ['Failed?'] },
        { node: ifNode('Failed?', `={{ ${EVENT}.data.status }}`, 'equals', 'failed'), next: ['Alert the team'] },
        {
          node: httpRequest({
            name: 'Alert the team',
            method: 'POST',
            url: `${base}/api/v1/messages`,
            // Replace with your team's own WhatsApp number after import.
            jsonBody: `={{ JSON.stringify({ to: '+910000000000', type: 'text', text: 'A WhatsApp message failed to deliver. Conversation: ' + ${EVENT}.data.conversation_id }) }}`,
          }),
        },
      ])
    },
  },
]

/** Webhook registration call for a template (the n8n Production URL goes in `url`). */
export function webhookRegistrationCurl(baseUrl: string, n8nWebhookUrl: string, events: string[]): string {
  const body = JSON.stringify({ url: n8nWebhookUrl || 'https://YOUR-N8N-HOST/webhook/autoshift', events })
  return [
    `curl -X POST ${normalizeBaseUrl(baseUrl)}/api/v1/webhooks \\`,
    `  -H "Authorization: Bearer autoshift_live_xxx" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -d '${body}'`,
  ].join('\n')
}

/** True for a URL AutoShift will deliver to (https, not obviously internal). */
export function isDeliverableWebhookUrl(raw: string): boolean {
  try {
    const url = new URL(raw.trim())
    if (url.protocol !== 'https:') return false
    return !/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.0\.0\.0)/.test(url.hostname)
  } catch {
    return false
  }
}
