import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

export const BASE_URL = 'https://api.coretool.de/v1';
export const USER_AGENT = 'coretool-n8n/0.1.0';
export const PRICING_URL = 'https://coretool.de/e-rechnung-api#preise';
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

interface IApiResponse {
	statusCode: number;
	headers: IDataObject;
	body: IDataObject;
}

function parseBody(raw: unknown): IDataObject {
	if (raw === undefined || raw === null || raw === '') return {};
	if (Buffer.isBuffer(raw)) raw = raw.toString('utf8');
	if (typeof raw === 'string') {
		try {
			return JSON.parse(raw) as IDataObject;
		} catch {
			return { message: raw };
		}
	}
	return raw as IDataObject;
}

function asText(value: unknown): string {
	if (value === undefined || value === null) return '';
	if (typeof value === 'string') return value;
	return JSON.stringify(value);
}

/**
 * Turns a Coretool API answer with status >= 400 into a readable NodeApiError.
 * Error bodies look like { error, message, message_en, errors: [{ field, message }], pricing }.
 */
export function buildApiError(
	context: IExecuteFunctions,
	itemIndex: number,
	response: IApiResponse,
	what: string,
): NodeApiError {
	const body = response.body ?? {};
	const nested = (body.error && typeof body.error === 'object' ? body.error : {}) as IDataObject;
	const apiMessage = asText(
		nested.message_en ?? body.message_en ?? nested.message ?? body.message ?? body.detail,
	);
	const details: string[] = [];
	const fieldErrors = (nested.errors ?? body.errors) as unknown;
	if (Array.isArray(fieldErrors)) {
		for (const entry of fieldErrors.slice(0, 20)) {
			if (entry && typeof entry === 'object') {
				const e = entry as IDataObject;
				details.push(`- ${asText(e.field ?? e.loc ?? '?')}: ${asText(e.message ?? e.msg)}`);
			} else {
				details.push(`- ${asText(entry)}`);
			}
		}
	}
	const status = response.statusCode;
	let message: string;
	switch (status) {
		case 400:
			message = `${what}: some invoice data is missing or invalid${apiMessage ? ` – ${apiMessage}` : ''}`;
			break;
		case 401:
			message =
				'API key invalid or revoked – create a new key in your Coretool account at coretool.de and update the credential';
			break;
		case 402: {
			const pricing = asText(nested.pricing ?? body.pricing) || PRICING_URL;
			message = `No calls left – free calls used up or plan limit reached. Pricing: ${pricing}`;
			break;
		}
		case 413:
			message = `${what}: the file is too large – the maximum is 5 MB`;
			break;
		case 429: {
			const wait = asText(response.headers['retry-after']) || '60';
			message = `Too many requests – wait ${wait} seconds and try again`;
			break;
		}
		case 503:
			message = 'The validation service is briefly unavailable – try again in a minute';
			break;
		default:
			message = `${what}: Coretool API answered with HTTP ${status}${apiMessage ? ` – ${apiMessage}` : ''}`;
	}
	const descriptionParts: string[] = [];
	if (apiMessage && [401, 402, 413, 429, 503].includes(status)) descriptionParts.push(apiMessage);
	if (details.length) descriptionParts.push(details.join('\n'));
	return new NodeApiError(context.getNode(), body as JsonObject, {
		message,
		description: descriptionParts.join('\n') || undefined,
		httpCode: String(status),
		itemIndex,
	});
}

/**
 * Sends an authenticated request to the Coretool API and returns status, headers and parsed body.
 * HTTP status errors are not thrown here; the caller decides (see buildApiError).
 */
export async function coretoolRequest(
	context: IExecuteFunctions,
	method: IHttpRequestMethods,
	endpoint: string,
	options: {
		body?: IDataObject | Buffer;
		contentType?: string;
		qs?: IDataObject;
	} = {},
): Promise<IApiResponse> {
	const headers: IDataObject = {
		Accept: 'application/json',
		'User-Agent': USER_AGENT,
	};
	let body: IHttpRequestOptions['body'];
	if (Buffer.isBuffer(options.body)) {
		body = options.body;
		headers['Content-Type'] = options.contentType ?? 'application/octet-stream';
	} else if (options.body !== undefined) {
		body = JSON.stringify(options.body);
		headers['Content-Type'] = 'application/json';
	}
	const requestOptions: IHttpRequestOptions = {
		method,
		url: `${BASE_URL}${endpoint}`,
		headers,
		qs: options.qs,
		body,
		json: false,
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
		timeout: 120000,
	};
	const response = (await context.helpers.httpRequestWithAuthentication.call(
		context,
		'coretoolApi',
		requestOptions,
	)) as IDataObject;
	return {
		statusCode: Number(response.statusCode),
		headers: (response.headers ?? {}) as IDataObject,
		body: parseBody(response.body),
	};
}

/** Builds a multipart/form-data body with a single "file" part without any runtime dependency. */
export function buildMultipart(
	file: Buffer,
	fileName: string,
	mimeType: string,
): { body: Buffer; contentType: string } {
	const boundary = `----CoretoolN8n${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
	const safeName = fileName.replace(/["\r\n]/g, '_');
	const head = Buffer.from(
		`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${safeName}"\r\nContent-Type: ${mimeType}\r\n\r\n`,
		'utf8',
	);
	const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
	return {
		body: Buffer.concat([head, file, tail]),
		contentType: `multipart/form-data; boundary=${boundary}`,
	};
}

/** Removes empty strings, null and undefined recursively so the API only sees values that were set. */
export function removeEmpty(value: IDataObject): IDataObject {
	const out: IDataObject = {};
	for (const [key, raw] of Object.entries(value)) {
		if (raw === undefined || raw === null || raw === '') continue;
		if (Array.isArray(raw)) {
			const list = raw
				.map((entry) =>
					entry && typeof entry === 'object' && !Array.isArray(entry)
						? removeEmpty(entry as IDataObject)
						: entry,
				)
				.filter((entry) => entry !== undefined && entry !== null && entry !== '');
			if (list.length) out[key] = list;
			continue;
		}
		if (typeof raw === 'object') {
			const nested = removeEmpty(raw as IDataObject);
			if (Object.keys(nested).length) out[key] = nested;
			continue;
		}
		out[key] = raw;
	}
	return out;
}

/** Cuts an ISO date-time ("2026-10-20T00:00:00.000Z") down to the date part the API expects. */
export function dateOnly(value: unknown): string {
	const text = asText(value).trim();
	const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
	return match ? match[1] : text;
}
