import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class CoretoolApi implements ICredentialType {
	name = 'coretoolApi';

	displayName = 'Coretool API';

	documentationUrl = 'https://coretool.de/e-rechnung-api';

	icon = 'file:../nodes/Coretool/coretool.svg' as const;

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			placeholder: 'ct_live_…',
			description:
				'Your Coretool API key. Create one in your Coretool account at coretool.de (menu "API keys"). Keys start with "ct_live_".',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'X-API-Key': '={{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://api.coretool.de',
			url: '/v1/auth/test',
			method: 'GET',
		},
	};
}
