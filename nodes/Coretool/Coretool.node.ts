import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import {
	buildApiError,
	buildMultipart,
	coretoolRequest,
	dateOnly,
	MAX_UPLOAD_BYTES,
	removeEmpty,
} from './GenericFunctions';

function partyFields(role: 'seller' | 'buyer'): INodeProperties[] {
	const fields: INodeProperties[] = [
		{
			displayName: 'City',
			name: 'city',
			type: 'string',
			default: '',
			description: `City of the ${role}`,
		},
		{
			displayName: 'Country',
			name: 'country',
			type: 'string',
			default: 'DE',
			description: 'Two-letter country code, e.g. DE',
		},
		{
			displayName: 'Email',
			name: 'email',
			type: 'string',
			placeholder: 'name@email.com',
			default: '',
			description: `Email address of the ${role}`,
		},
		{
			displayName: 'Name',
			name: 'name',
			type: 'string',
			default: '',
			description: `Company or person name of the ${role}`,
		},
		{
			displayName: 'Phone',
			name: 'phone',
			type: 'string',
			default: '',
			description: `Phone number of the ${role}`,
		},
		{
			displayName: 'Street',
			name: 'street',
			type: 'string',
			default: '',
			description: 'Street and house number',
		},
	];
	if (role === 'seller') {
		fields.push({
			displayName: 'Tax Number',
			name: 'tax_number',
			type: 'string',
			default: '',
			description:
				'German tax number (Steuernummer), e.g. 11/252/12345. Tax number or VAT ID is required.',
		});
	}
	fields.push(
		{
			displayName: 'VAT ID',
			name: 'vat_id',
			type: 'string',
			default: '',
			description: 'VAT identification number, e.g. DE123456789',
		},
		{
			displayName: 'ZIP Code',
			name: 'zip',
			type: 'string',
			default: '',
			description: `Postal code of the ${role}`,
		},
	);
	return fields;
}

export class Coretool implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Coretool',
		name: 'coretool',
		icon: { light: 'file:coretool.svg', dark: 'file:coretool.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description:
			'Create and validate e-invoices (ZUGFeRD, XRechnung) and check Leitweg-IDs with the Coretool API',
		defaults: {
			name: 'Coretool',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [
			{
				name: 'coretoolApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Check a Leitweg-ID',
						value: 'checkLeitwegId',
						action: 'Check a leitweg ID',
						description:
							'Check a German Leitweg-ID (routing ID for public-sector XRechnung) including its check digit',
					},
					{
						name: 'Create an E-Invoice',
						value: 'createEInvoice',
						action: 'Create an electronic invoice',
						description:
							'Create a ZUGFeRD PDF or XRechnung XML from invoice data and return it as a binary file',
					},
					{
						name: 'Get Usage',
						value: 'getUsage',
						action: 'Get usage',
						description: 'Return plan and remaining calls of the API key (free)',
					},
					{
						name: 'Validate an E-Invoice',
						value: 'validateEInvoice',
						action: 'Validate an electronic invoice',
						description:
							'Validate a ZUGFeRD PDF or XRechnung XML with the KoSIT validator and return findings',
					},
				],
				default: 'createEInvoice',
			},

			// ---------------------------------------------------------------- createEInvoice
			{
				displayName: 'Format',
				name: 'format',
				type: 'options',
				displayOptions: { show: { operation: ['createEInvoice'] } },
				options: [
					{ name: 'XRechnung CII (XML)', value: 'xrechnung_cii' },
					{ name: 'XRechnung UBL (XML)', value: 'xrechnung_ubl' },
					{ name: 'ZUGFeRD 2.x (PDF With Embedded XML)', value: 'zugferd' },
				],
				default: 'zugferd',
				description:
					'Output format of the e-invoice. XRechnung is the standard for German public authorities.',
			},
			{
				displayName: 'Invoice Number',
				name: 'invoiceNumber',
				type: 'string',
				required: true,
				displayOptions: { show: { operation: ['createEInvoice'] } },
				default: '',
				placeholder: 'e.g. RE-2026-0042',
				description: 'Unique invoice number',
			},
			{
				displayName: 'Invoice Date',
				name: 'invoiceDate',
				type: 'dateTime',
				required: true,
				displayOptions: { show: { operation: ['createEInvoice'] } },
				default: '',
				description: 'Date of the invoice (only the date part is used)',
			},
			{
				displayName: 'Delivery Date',
				name: 'deliveryDate',
				type: 'dateTime',
				required: true,
				displayOptions: { show: { operation: ['createEInvoice'] } },
				default: '',
				description: 'Date of delivery or service (only the date part is used)',
			},
			{
				displayName: 'Seller',
				name: 'seller',
				type: 'collection',
				placeholder: 'Add Seller Field',
				displayOptions: { show: { operation: ['createEInvoice'] } },
				default: {},
				description: 'Your own company data. Name, street, ZIP code and city are required.',
				options: partyFields('seller'),
			},
			{
				displayName: 'Buyer',
				name: 'buyer',
				type: 'collection',
				placeholder: 'Add Buyer Field',
				displayOptions: { show: { operation: ['createEInvoice'] } },
				default: {},
				description: 'Customer data. Name, street, ZIP code and city are required.',
				options: partyFields('buyer'),
			},
			{
				displayName: 'Line Items Input',
				name: 'itemsInputMode',
				type: 'options',
				displayOptions: { show: { operation: ['createEInvoice'] } },
				options: [
					{ name: 'Define Below', value: 'fields' },
					{ name: 'JSON', value: 'json' },
				],
				default: 'fields',
				description: 'Whether to enter the line items as fields or as a JSON array',
			},
			{
				displayName: 'Line Items',
				name: 'items',
				type: 'fixedCollection',
				typeOptions: { multipleValues: true },
				placeholder: 'Add Line Item',
				displayOptions: { show: { operation: ['createEInvoice'], itemsInputMode: ['fields'] } },
				default: {},
				options: [
					{
						displayName: 'Line Item',
						name: 'item',
						values: [
							{
								displayName: 'Description',
								name: 'description',
								type: 'string',
								default: '',
								description: 'What was delivered or done',
							},
							{
								displayName: 'Quantity',
								name: 'quantity',
								type: 'number',
								default: 1,
								description: 'Quantity of the line item',
							},
							{
								displayName: 'Tax Rate (%)',
								name: 'tax_rate',
								type: 'number',
								default: 19,
								description: 'VAT rate in percent, e.g. 19, 7 or 0',
							},
							{
								displayName: 'Unit',
								name: 'unit',
								type: 'string',
								default: '',
								placeholder: 'e.g. h, m², psch',
								description: 'Unit of the quantity',
							},
							{
								displayName: 'Unit Price (Net)',
								name: 'unit_price',
								type: 'number',
								typeOptions: { numberPrecision: 2 },
								default: 0,
								description: 'Net price per unit',
							},
						],
					},
				],
			},
			{
				displayName: 'Line Items (JSON)',
				name: 'itemsJson',
				type: 'json',
				displayOptions: { show: { operation: ['createEInvoice'], itemsInputMode: ['json'] } },
				default:
					'[{"description": "Carport installation", "quantity": 1, "unit": "psch", "unit_price": 520, "tax_rate": 19}]',
				description:
					'JSON array of line items with description, quantity, unit, unit_price and tax_rate',
			},
			{
				displayName: 'Payment',
				name: 'payment',
				type: 'collection',
				placeholder: 'Add Payment Field',
				displayOptions: { show: { operation: ['createEInvoice'] } },
				default: {},
				description: 'Bank details and payment terms. The IBAN is required.',
				options: [
					{
						displayName: 'Bank Name',
						name: 'bank_name',
						type: 'string',
						default: '',
						description: 'Name of the bank',
					},
					{
						displayName: 'BIC',
						name: 'bic',
						type: 'string',
						default: '',
						description: 'BIC/SWIFT code of the bank',
					},
					{
						displayName: 'Due Date',
						name: 'due_date',
						type: 'dateTime',
						default: '',
						description: 'Payment due date (alternative to due days)',
					},
					{
						displayName: 'Due in Days',
						name: 'due_days',
						type: 'number',
						typeOptions: { minValue: 0, maxValue: 365 },
						default: 14,
						description: 'Payment term in days counted from the invoice date (max. 365).',
					},
					{
						displayName: 'IBAN',
						name: 'iban',
						type: 'string',
						default: '',
						description: 'IBAN the customer should pay to',
					},
					{
						displayName: 'Terms',
						name: 'terms',
						type: 'string',
						default: '',
						description: 'Payment terms text printed on the invoice (max. 300 characters).',
					},
				],
			},
			{
				displayName: 'Additional Fields',
				name: 'additionalFields',
				type: 'collection',
				placeholder: 'Add Field',
				displayOptions: { show: { operation: ['createEInvoice'] } },
				default: {},
				options: [
					{
						displayName: 'Accent Color',
						name: 'accent_color',
						type: 'color',
						default: '',
						description: 'Accent colour of the PDF layout (ZUGFeRD only)',
					},
					{
						displayName: 'Buyer Reference',
						name: 'buyer_reference',
						type: 'string',
						default: '',
						description: 'Reference given by the buyer. Not together with a Leitweg-ID.',
					},
					{
						displayName: 'Currency',
						name: 'currency',
						type: 'string',
						default: 'EUR',
						description: 'ISO currency code',
					},
					{
						displayName: 'Leitweg-ID',
						name: 'leitweg_id',
						type: 'string',
						default: '',
						placeholder: 'e.g. 04011000-1234512345-06',
						description:
							'Routing ID of a German public-sector buyer (required for XRechnung to authorities)',
					},
					{
						displayName: 'Logo (Base64)',
						name: 'logo_base64',
						type: 'string',
						default: '',
						description: 'PNG or JPG logo as Base64 text, max. 45 KB (ZUGFeRD PDF only).',
					},
					{
						displayName: 'Notes',
						name: 'notes',
						type: 'string',
						typeOptions: { rows: 3 },
						default: '',
						description: 'Free text printed on the invoice (max. 1000 characters).',
					},
					{
						displayName: 'Order Reference',
						name: 'order_reference',
						type: 'string',
						default: '',
						description: 'Order or purchase order number of the buyer',
					},
					{
						displayName: 'PDF Template',
						name: 'template',
						type: 'options',
						options: [
							{ name: 'Classic', value: 'classic' },
							{ name: 'Clean', value: 'clean' },
							{ name: 'Dezent', value: 'dezent' },
							{ name: 'Modern', value: 'modern' },
						],
						default: 'classic',
						description: 'Layout of the PDF (ZUGFeRD only)',
					},
					{
						displayName: 'Tax Exemption',
						name: 'tax_exemption',
						type: 'options',
						options: [
							{ name: 'Intra-Community Supply', value: 'innergemeinschaftlich' },
							{ name: 'Rental (Exempt)', value: 'vermietung' },
							{ name: 'Reverse Charge (§ 13b UStG)', value: 'reverse_charge' },
							{ name: 'Small Business (§ 19 UStG, No VAT)', value: 'kleinunternehmer' },
							{ name: 'Tax Exempt (§ 4 UStG)', value: 'steuerfrei_4' },
						],
						default: 'kleinunternehmer',
						description: 'Reason why no VAT is charged. Leave out for regular invoices with VAT.',
					},
					{
						displayName: 'Tax Exemption Detail',
						name: 'tax_exemption_detail',
						type: 'string',
						default: '',
						description: 'Additional detail for the exemption, e.g. the number within § 4 UStG',
					},
				],
			},
			{
				displayName: 'Put Output File in Field',
				name: 'binaryPropertyName',
				type: 'string',
				displayOptions: { show: { operation: ['createEInvoice'] } },
				default: 'data',
				description: 'Name of the binary field the created invoice file is written to',
			},

			// ---------------------------------------------------------------- validateEInvoice
			{
				displayName: 'Input Binary Field',
				name: 'binaryPropertyName',
				type: 'string',
				displayOptions: { show: { operation: ['validateEInvoice'] } },
				default: 'data',
				description: 'Name of the binary field that holds the e-invoice file (PDF or XML, max. 5 MB).',
			},
			{
				displayName: 'Include Full Report',
				name: 'report',
				type: 'boolean',
				displayOptions: { show: { operation: ['validateEInvoice'] } },
				default: false,
				description: 'Whether to include the complete validator report in the output',
			},

			// ---------------------------------------------------------------- checkLeitwegId
			{
				displayName: 'Leitweg-ID',
				name: 'leitwegId',
				type: 'string',
				displayOptions: { show: { operation: ['checkLeitwegId'] } },
				default: '',
				placeholder: 'e.g. 04011000-1234512345-06',
				description:
					'Leitweg-ID to check. An invalid ID is a normal result (valid = false), not a failure.',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const operation = this.getNodeParameter('operation', 0) as string;

		for (let i = 0; i < items.length; i++) {
			try {
				if (operation === 'createEInvoice') {
					returnData.push(await createEInvoice.call(this, i));
				} else if (operation === 'validateEInvoice') {
					returnData.push(await validateEInvoice.call(this, i));
				} else if (operation === 'checkLeitwegId') {
					returnData.push(await checkLeitwegId.call(this, i));
				} else if (operation === 'getUsage') {
					returnData.push(await getUsage.call(this, i));
				} else {
					throw new NodeOperationError(
						this.getNode(),
						`The operation "${operation}" is not supported`,
						{ itemIndex: i },
					);
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: i },
					});
					continue;
				}
				if (error instanceof NodeApiError || error instanceof NodeOperationError) {
					throw error as NodeApiError | NodeOperationError;
				}
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}
		return [returnData];
	}
}

async function createEInvoice(this: IExecuteFunctions, i: number): Promise<INodeExecutionData> {
	const seller = this.getNodeParameter('seller', i, {}) as IDataObject;
	const buyer = this.getNodeParameter('buyer', i, {}) as IDataObject;
	const payment = this.getNodeParameter('payment', i, {}) as IDataObject;
	const additional = this.getNodeParameter('additionalFields', i, {}) as IDataObject;
	const itemsInputMode = this.getNodeParameter('itemsInputMode', i) as string;
	const binaryPropertyName = this.getNodeParameter('binaryPropertyName', i) as string;

	let lineItems: IDataObject[];
	if (itemsInputMode === 'json') {
		const raw = this.getNodeParameter('itemsJson', i);
		let parsed: unknown = raw;
		if (typeof raw === 'string') {
			try {
				parsed = JSON.parse(raw);
			} catch (error) {
				throw new NodeOperationError(
					this.getNode(),
					`"Line Items (JSON)" is not valid JSON: ${(error as Error).message}`,
					{ itemIndex: i },
				);
			}
		}
		if (!Array.isArray(parsed)) {
			throw new NodeOperationError(
				this.getNode(),
				'"Line Items (JSON)" must be a JSON array of line items',
				{ itemIndex: i },
			);
		}
		lineItems = parsed as IDataObject[];
	} else {
		const collection = this.getNodeParameter('items', i, {}) as { item?: IDataObject[] };
		lineItems = collection.item ?? [];
	}
	if (lineItems.length === 0) {
		throw new NodeOperationError(this.getNode(), 'Add at least one line item', { itemIndex: i });
	}

	if (payment.due_date) payment.due_date = dateOnly(payment.due_date);
	const { currency, ...rest } = additional;

	const body = removeEmpty({
		format: this.getNodeParameter('format', i),
		invoice_number: this.getNodeParameter('invoiceNumber', i),
		invoice_date: dateOnly(this.getNodeParameter('invoiceDate', i)),
		delivery_date: dateOnly(this.getNodeParameter('deliveryDate', i)),
		currency: currency ?? 'EUR',
		seller,
		buyer,
		items: lineItems,
		payment,
		...rest,
	});

	const response = await coretoolRequest(this, 'POST', '/create', { body });
	if (response.statusCode >= 400) {
		throw buildApiError(this, i, response, 'Could not create the e-invoice');
	}
	const { content_base64: contentBase64, ...json } = response.body;
	const fileName = String(json.filename ?? `invoice.${json.format === 'zugferd' ? 'pdf' : 'xml'}`);
	const mimeType = String(json.mime_type ?? 'application/octet-stream');
	const binary = await this.helpers.prepareBinaryData(
		Buffer.from(String(contentBase64 ?? ''), 'base64'),
		fileName,
		mimeType,
	);
	return {
		json,
		binary: { [binaryPropertyName]: binary },
		pairedItem: { item: i },
	};
}

async function validateEInvoice(this: IExecuteFunctions, i: number): Promise<INodeExecutionData> {
	const binaryPropertyName = this.getNodeParameter('binaryPropertyName', i) as string;
	const report = this.getNodeParameter('report', i) as boolean;
	const binaryData = this.helpers.assertBinaryData(i, binaryPropertyName);
	const buffer = await this.helpers.getBinaryDataBuffer(i, binaryPropertyName);

	if (buffer.length === 0) {
		throw new NodeOperationError(
			this.getNode(),
			`The file in binary field "${binaryPropertyName}" is empty – pass a PDF or XML e-invoice`,
			{ itemIndex: i },
		);
	}
	if (buffer.length > MAX_UPLOAD_BYTES) {
		throw new NodeOperationError(
			this.getNode(),
			`The file in binary field "${binaryPropertyName}" is larger than 5 MB – the Coretool API accepts files up to 5 MB`,
			{ itemIndex: i },
		);
	}
	const mimeType = binaryData.mimeType || 'application/octet-stream';
	let fileName = binaryData.fileName;
	if (!fileName) {
		fileName = mimeType.includes('pdf')
			? 'invoice.pdf'
			: mimeType.includes('xml')
				? 'invoice.xml'
				: 'invoice.bin';
	}
	const multipart = buildMultipart(buffer, fileName, mimeType);

	const response = await coretoolRequest(this, 'POST', '/validate', {
		body: multipart.body,
		contentType: multipart.contentType,
		qs: { report: report ? 'true' : 'false' },
	});
	if (response.statusCode >= 400) {
		throw buildApiError(this, i, response, 'Could not validate the e-invoice');
	}
	return { json: response.body, pairedItem: { item: i } };
}

async function checkLeitwegId(this: IExecuteFunctions, i: number): Promise<INodeExecutionData> {
	const leitwegId = (this.getNodeParameter('leitwegId', i, '') as string).trim();
	const response = await coretoolRequest(this, 'POST', '/leitweg/pruefen', {
		body: { leitweg_id: leitwegId },
	});
	if (response.statusCode >= 400) {
		throw buildApiError(this, i, response, 'Could not check the Leitweg-ID');
	}
	const r = response.body;
	return {
		json: {
			valid: Boolean(r.gueltig),
			leitweg_id: r.leitweg_id ?? leitwegId,
			...r,
		},
		pairedItem: { item: i },
	};
}

async function getUsage(this: IExecuteFunctions, i: number): Promise<INodeExecutionData> {
	const response = await coretoolRequest(this, 'GET', '/usage');
	if (response.statusCode >= 400) {
		throw buildApiError(this, i, response, 'Could not read the usage');
	}
	const r = response.body;
	const usage = (r.usage ?? {}) as IDataObject;
	return {
		json: { key_id: r.key_id, ...usage, pricing: r.pricing },
		pairedItem: { item: i },
	};
}
