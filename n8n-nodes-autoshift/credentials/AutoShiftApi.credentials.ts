import type { IAuthenticateGeneric, ICredentialTestRequest, ICredentialType, INodeProperties } from 'n8n-workflow';

export class AutoShiftApi implements ICredentialType {
	name = 'autoShiftApi';
	displayName = 'AutoShift API';
	documentationUrl = 'https://github.com/autoshifttech/autoshift/tree/main/n8n-nodes-autoshift';
	properties: INodeProperties[] = [
		{
			displayName: 'API URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://api.autoshift.example',
			description: 'Where your AutoShift backend runs, without a trailing slash',
		},
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			description: 'Create one in AutoShift under Settings, API keys. It starts with asmcp_',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: { headers: { Authorization: '=Bearer {{$credentials.apiKey}}' } },
	};

	test: ICredentialTestRequest = {
		request: { baseURL: '={{$credentials.baseUrl}}', url: '/v1/me' },
	};
}
