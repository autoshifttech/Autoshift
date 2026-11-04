import type { INodeType, INodeTypeDescription } from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';

export class AutoShift implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'AutoShift',
		name: 'autoShift',
		icon: 'file:autoshift.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Work with your AutoShift assistants, wallet and plan',
		defaults: { name: 'AutoShift' },
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'autoShiftApi', required: true }],
		requestDefaults: {
			baseURL: '={{$credentials.baseUrl}}',
			headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
		},
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Assistant', value: 'assistant' },
					{ name: 'Wallet', value: 'wallet' },
					{ name: 'Plan', value: 'plan' },
					{ name: 'Subscription', value: 'subscription' },
				],
				default: 'assistant',
			},
			// ---------------------------------------------------------- assistant
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['assistant'] } },
				options: [
					{ name: 'Get Many', value: 'getAll', action: 'Get many assistants', routing: { request: { method: 'GET', url: '/v1/assistants' } } },
					{ name: 'Get', value: 'get', action: 'Get an assistant', routing: { request: { method: 'GET', url: '=/v1/assistants/{{$parameter["assistantId"]}}' } } },
					{
						name: 'Switch On or Off',
						value: 'setEnabled',
						action: 'Switch an assistant on or off',
						routing: { request: { method: 'PATCH', url: '=/v1/assistants/{{$parameter["assistantId"]}}', body: { enabled: '={{$parameter["enabled"]}}' } } },
					},
					{
						name: 'Test a Reply',
						value: 'testReply',
						action: 'Run a real AI reply and charge the wallet',
						description: 'Costs one AI reply from the wallet. The same idempotency key is never charged twice.',
						routing: {
							request: {
								method: 'POST',
								url: '=/v1/assistants/{{$parameter["assistantId"]}}/test-reply',
								body: { message: '={{$parameter["message"]}}', idempotency_key: '={{$parameter["idempotencyKey"]}}' },
							},
						},
					},
				],
				default: 'getAll',
			},
			{
				displayName: 'Assistant ID',
				name: 'assistantId',
				type: 'string',
				required: true,
				default: '',
				displayOptions: { show: { resource: ['assistant'], operation: ['get', 'setEnabled', 'testReply'] } },
			},
			{
				displayName: 'Enabled',
				name: 'enabled',
				type: 'boolean',
				default: true,
				displayOptions: { show: { resource: ['assistant'], operation: ['setEnabled'] } },
			},
			{
				displayName: 'Message',
				name: 'message',
				type: 'string',
				required: true,
				default: '',
				displayOptions: { show: { resource: ['assistant'], operation: ['testReply'] } },
			},
			{
				displayName: 'Idempotency Key',
				name: 'idempotencyKey',
				type: 'string',
				required: true,
				default: '={{$execution.id}}-{{$itemIndex}}',
				description: 'Retrying with the same key is never charged twice. At least 8 characters.',
				displayOptions: { show: { resource: ['assistant'], operation: ['testReply'] } },
			},
			// -------------------------------------------------------------- wallet
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['wallet'] } },
				options: [
					{ name: 'Get Balance', value: 'balance', action: 'Get the wallet balance', routing: { request: { method: 'GET', url: '/v1/wallet' } } },
					{
						name: 'Get Ledger',
						value: 'ledger',
						action: 'Get recent wallet entries',
						routing: { request: { method: 'GET', url: '/v1/wallet/ledger', qs: { limit: '={{$parameter["limit"]}}' } } },
					},
				],
				default: 'balance',
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				typeOptions: { minValue: 1, maxValue: 200 },
				default: 20,
				displayOptions: { show: { resource: ['wallet'], operation: ['ledger'] } },
			},
			// ---------------------------------------------------------------- plan
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['plan'] } },
				options: [{ name: 'Get Many', value: 'getAll', action: 'Get the plans', routing: { request: { method: 'GET', url: '/v1/plans' } } }],
				default: 'getAll',
			},
			// -------------------------------------------------------- subscription
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['subscription'] } },
				options: [{ name: 'Get', value: 'get', action: 'Get the subscription', routing: { request: { method: 'GET', url: '/v1/subscription' } } }],
				default: 'get',
			},
		],
	};
}
