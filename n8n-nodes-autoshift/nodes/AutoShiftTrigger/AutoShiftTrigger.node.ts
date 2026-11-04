import { createHmac, timingSafeEqual } from 'crypto';
import type {
	IDataObject,
	IHookFunctions,
	IHttpRequestOptions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

const TOLERANCE_SECONDS = 300;

async function api(this: IHookFunctions, method: 'GET' | 'POST' | 'DELETE', path: string, body?: IDataObject) {
	const { baseUrl } = await this.getCredentials('autoShiftApi');
	const options: IHttpRequestOptions = {
		method,
		url: `${String(baseUrl).replace(/\/+$/, '')}${path}`,
		json: true,
		...(body ? { body } : {}),
	};
	return this.helpers.httpRequestWithAuthentication.call(this, 'autoShiftApi', options);
}

export class AutoShiftTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'AutoShift Trigger',
		name: 'autoShiftTrigger',
		icon: 'file:autoshift.svg',
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["events"].join(", ")}}',
		description: 'Starts a workflow when something happens in AutoShift',
		defaults: { name: 'AutoShift Trigger' },
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'autoShiftApi', required: true }],
		webhooks: [{ name: 'default', httpMethod: 'POST', responseMode: 'onReceived', path: 'webhook' }],
		properties: [
			{
				displayName: 'Events',
				name: 'events',
				type: 'multiOptions',
				required: true,
				default: ['wallet.topped_up'],
				options: [
					{ name: 'Message Received', value: 'message.received' },
					{ name: 'Message Status Updated', value: 'message.status_updated' },
					{ name: 'Conversation Started', value: 'conversation.created' },
					{ name: 'Lead Created', value: 'lead.created' },
					{ name: 'Handed Off to a Person', value: 'conversation.handoff' },
					{ name: 'Wallet Topped Up', value: 'wallet.topped_up' },
					{ name: 'Wallet Running Low', value: 'wallet.low' },
					{ name: 'Wallet Refunded', value: 'wallet.refunded' },
					{ name: 'Subscription Updated', value: 'subscription.updated' },
					{ name: 'Test Ping', value: 'test.ping' },
				],
				description: 'The API key must be able to change settings (read and change access)',
			},
		],
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const data = this.getWorkflowStaticData('node');
				if (!data.hookId) return false;
				const url = this.getNodeWebhookUrl('default');
				const hooks = (await api.call(this, 'GET', '/v1/hooks')) as Array<{ id: string; url: string }>;
				const mine = hooks.find((h) => h.id === data.hookId && h.url === url);
				if (!mine) delete data.hookId;
				return Boolean(mine);
			},
			async create(this: IHookFunctions): Promise<boolean> {
				const url = this.getNodeWebhookUrl('default');
				const events = this.getNodeParameter('events') as string[];
				const made = (await api.call(this, 'POST', '/v1/hooks', {
					url,
					events,
					label: `n8n: ${this.getWorkflow().name ?? 'workflow'}`.slice(0, 80),
				})) as { id: string; secret: string };
				const data = this.getWorkflowStaticData('node');
				data.hookId = made.id;
				data.secret = made.secret; // kept in n8n only; AutoShift will never show it again
				return true;
			},
			async delete(this: IHookFunctions): Promise<boolean> {
				const data = this.getWorkflowStaticData('node');
				if (data.hookId) {
					try {
						await api.call(this, 'DELETE', `/v1/hooks/${data.hookId}`);
					} catch {
						return false;
					}
					delete data.hookId;
					delete data.secret;
				}
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const req = this.getRequestObject();
		const secret = this.getWorkflowStaticData('node').secret as string | undefined;
		const timestamp = String(req.headers['x-autoshift-timestamp'] ?? '');
		const signature = String(req.headers['x-autoshift-signature'] ?? '');
		const raw = (req as unknown as { rawBody?: Buffer }).rawBody;
		if (!secret || !raw || !timestamp || !signature) {
			throw new NodeOperationError(this.getNode(), 'Missing signature');
		}
		const age = Math.abs(Date.now() / 1000 - Number(timestamp));
		const expected = 'sha256=' + createHmac('sha256', secret).update(`${timestamp}.`).update(raw).digest('hex');
		const a = Buffer.from(expected);
		const b = Buffer.from(signature);
		if (!(age <= TOLERANCE_SECONDS) || a.length !== b.length || !timingSafeEqual(a, b)) {
			const res = this.getResponseObject();
			res.status(401).json({ error: 'Bad signature' });
			return { noWebhookResponse: true };
		}
		return { workflowData: [this.helpers.returnJsonArray(this.getBodyData())] };
	}
}
