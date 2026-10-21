'use strict';
// Runs every operation of the built node (dist/) against the real Coretool API.
// The API key comes from the environment variable CORETOOL_TEST_KEY and is never written anywhere.
// Usage: CORETOOL_TEST_KEY=ct_live_... node tests/run_api_tests.js   (after `npm run build`)
// Set CORETOOL_REAL_N8N_WORKFLOW=1 to use the installed n8n-workflow package instead of the stub.
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.resolve(__dirname, '..');
const FIX = path.join(__dirname, 'fixtures');
if (!process.env.CORETOOL_REAL_N8N_WORKFLOW) require('./n8n_workflow_stub');
const { Coretool } = require(path.join(ROOT, 'dist', 'nodes', 'Coretool', 'Coretool.node.js'));

const API_KEY = process.env.CORETOOL_TEST_KEY;
if (!API_KEY) {
	console.error('CORETOOL_TEST_KEY is not set - skipping API tests (set it to a Coretool API key to run them).');
	process.exit(process.env.CI ? 0 : 1);
}

/** Minimal stand-in for n8n IExecuteFunctions – enough for this node. */
function makeContext(params, items, apiKey = API_KEY) {
	return {
		getInputData: () => items,
		getNode: () => ({ name: 'Coretool', type: 'n8n-nodes-coretool.coretool', typeVersion: 1 }),
		continueOnFail: () => false,
		getNodeParameter: (name, i, fallback) => {
			if (name in params) return params[name];
			if (fallback !== undefined) return fallback;
			throw new Error(`Parameter "${name}" not set in test`);
		},
		helpers: {
			async httpRequestWithAuthentication(_cred, opts) {
				const url = new URL(opts.url);
				for (const [k, v] of Object.entries(opts.qs ?? {})) url.searchParams.set(k, String(v));
				const res = await fetch(url, {
					method: opts.method,
					headers: { ...opts.headers, 'X-API-Key': apiKey },
					body: opts.body,
				});
				const headers = {};
				res.headers.forEach((v, k) => (headers[k] = v));
				return { statusCode: res.status, headers, body: await res.text() };
			},
			async prepareBinaryData(buffer, fileName, mimeType) {
				return { data: buffer.toString('base64'), fileName, mimeType, fileSize: `${buffer.length} B` };
			},
			assertBinaryData: (i, prop) => {
				const b = items[i].binary?.[prop];
				if (!b) throw new Error(`This operation expects the input data to contain a binary file "${prop}", but none was found [item ${i}]`);
				return b;
			},
			getBinaryDataBuffer: async (i, prop) => Buffer.from(items[i].binary[prop].data, 'base64'),
		},
	};
}

const node = new Coretool();
const results = [];
async function run(name, params, items, { expectError, apiKey, check } = {}) {
	const ctx = makeContext(params, items, apiKey);
	try {
		const out = await node.execute.call(ctx);
		const json = out[0][0].json;
		if (expectError) {
			results.push({ name, ok: false, info: 'expected an error, got ' + JSON.stringify(json).slice(0, 120) });
			return;
		}
		const verdict = check ? check(json, out[0][0]) : null;
		results.push({ name, ok: !verdict, info: verdict || JSON.stringify(json).slice(0, 160) });
	} catch (err) {
		const msg = err.message || String(err);
		const full = `${msg}${err.description ? ' | ' + err.description : ''}`.slice(0, 220);
		results.push({ name, ok: expectError ? msg.includes(expectError) : false, info: full });
	}
}

const seller = { name: 'Muster Zimmerei GmbH', street: 'An der Bahn 5', zip: '22844', city: 'Norderstedt', country: 'DE', tax_number: '11/252/12345', email: 'rechnung@example.com', phone: '+49 40 1234567' };
const buyer = { name: 'Beispiel Bau AG', street: 'Hauptstraße 1', zip: '20095', city: 'Hamburg', country: 'DE', email: 'einkauf@example.com' };
const items = { item: [{ description: 'Carport aufstellen', quantity: 1, unit: 'psch', unit_price: 520, tax_rate: 19 }] };
const createBase = {
	operation: 'createEInvoice', invoiceNumber: 'RE-2026-N8N-001', invoiceDate: '2026-10-20T00:00:00.000Z',
	deliveryDate: '2026-10-15T00:00:00.000Z', seller, buyer, itemsInputMode: 'fields', items,
	payment: { iban: 'DE02120300000000202051', due_days: 14 }, additionalFields: { template: 'modern' },
	binaryPropertyName: 'data',
};
const one = [{ json: {} }];
const xml = fs.readFileSync(path.join(FIX, 'Rechnung_RE-2026-TEST-001_xrechnung_cii.xml'));
const muell = fs.readFileSync(path.join(FIX, 'muell.xml'));
const bin = (buf, name, mime) => [{ json: {}, binary: { data: { data: buf.toString('base64'), fileName: name, mimeType: mime } } }];
const created = {};
const BAD_KEY = 'ct_live_invalid000';

(async () => {
	for (const format of ['zugferd', 'xrechnung_cii', 'xrechnung_ubl']) {
		await run(`create ${format}`, { ...createBase, format, ...(format === 'zugferd' ? {} : { additionalFields: { leitweg_id: '04011000-1234512345-06' } }) }, one, {
			check: (j, item) => {
				if (j.content_base64) return 'content_base64 still in json';
				if (!item.binary?.data?.data) return 'no binary output';
				if (j.gross_total !== '618.80' && j.totals?.gross_total !== '618.80') return 'gross_total != 618.80: ' + JSON.stringify(j.totals);
				created[format] = { buf: Buffer.from(item.binary.data.data, 'base64'), name: item.binary.data.fileName, mime: item.binary.data.mimeType };
				fs.writeFileSync(path.join(__dirname, 'out_' + item.binary.data.fileName), created[format].buf);
				return null;
			},
		});
	}
	await run('create items as JSON', { ...createBase, format: 'xrechnung_cii', itemsInputMode: 'json', itemsJson: JSON.stringify(items.item) }, one, {
		check: (j) => (j.validation?.result === 'valid' ? null : 'validation not valid: ' + JSON.stringify(j.validation)),
	});
	await run('create bad JSON items', { ...createBase, itemsInputMode: 'json', itemsJson: '{nope' }, one, { expectError: 'not valid JSON' });
	await run('create no items', { ...createBase, items: { item: [] } }, one, { expectError: 'at least one line item' });
	await run('create missing seller (400)', { ...createBase, format: 'zugferd', seller: {} }, one, { expectError: 'missing or invalid' });
	await run('create invalid key (401)', { ...createBase, format: 'zugferd' }, one, { expectError: 'API key invalid or revoked', apiKey: BAD_KEY });

	const validate = (report) => ({ operation: 'validateEInvoice', binaryPropertyName: 'data', report });
	await run('validate xml fixture', validate(false), bin(xml, 'Rechnung.xml', 'application/xml'), {
		check: (j) => (j.result === 'valid' ? null : 'result=' + j.result + ' ' + JSON.stringify(j).slice(0, 200)),
	});
	await run('validate xml fixture with report', validate(true), bin(xml, 'Rechnung.xml', 'application/xml'), {
		check: (j) => (j.result === 'valid' && Object.keys(j).some((k) => k.startsWith('report')) ? null : 'no report/result: ' + Object.keys(j).join(',')),
	});
	if (created.zugferd) {
		await run('validate created ZUGFeRD PDF', validate(false), bin(created.zugferd.buf, created.zugferd.name, created.zugferd.mime), {
			check: (j) => (j.result === 'valid' ? null : 'result=' + j.result + ' ' + JSON.stringify(j).slice(0, 200)),
		});
	}
	await run('validate broken file (muell.xml)', validate(false), bin(muell, 'muell.xml', 'application/xml'), {
		check: (j) => (j.result && j.result !== 'valid' ? null : 'expected invalid, got ' + JSON.stringify(j).slice(0, 200)),
	});
	await run('validate empty file', validate(false), bin(Buffer.alloc(0), 'leer.xml', 'application/xml'), { expectError: 'is empty' });
	await run('validate 6 MB file', validate(false), bin(Buffer.alloc(6 * 1024 * 1024, 65), 'gross.xml', 'application/xml'), { expectError: 'larger than 5 MB' });
	await run('validate missing binary field', { ...validate(false), binaryPropertyName: 'nix' }, one, { expectError: 'nix' });
	await run('validate invalid key (401)', validate(false), bin(xml, 'Rechnung.xml', 'application/xml'), { expectError: 'API key invalid or revoked', apiKey: BAD_KEY });

	const leitweg = (id) => ({ operation: 'checkLeitwegId', leitwegId: id });
	await run('leitweg valid', leitweg('04011000-1234512345-06'), one, { check: (j) => (j.valid === true ? null : 'valid != true: ' + JSON.stringify(j).slice(0, 160)) });
	await run('leitweg invalid', leitweg('04011000-1234512345-99'), one, { check: (j) => (j.valid === false ? null : 'valid != false: ' + JSON.stringify(j).slice(0, 160)) });
	await run('leitweg empty', leitweg('   '), one, { check: (j) => (j.valid === false ? null : 'empty should be invalid: ' + JSON.stringify(j).slice(0, 160)) });
	await run('leitweg invalid key (401)', leitweg('04011000-1234512345-06'), one, { expectError: 'API key invalid or revoked', apiKey: BAD_KEY });

	await run('usage', { operation: 'getUsage' }, one, { check: (j) => (j.key_id && j.plan ? null : 'missing key_id/plan: ' + JSON.stringify(j).slice(0, 160)) });
	await run('usage invalid key (401)', { operation: 'getUsage' }, one, { expectError: 'API key invalid or revoked', apiKey: BAD_KEY });
	await run('unknown operation', { operation: 'fliegen' }, one, { expectError: 'fliegen' });

	// continueOnFail: the message must land in json.error instead of being thrown
	const ctx = makeContext(leitweg('x'), one, BAD_KEY);
	ctx.continueOnFail = () => true;
	const out = await node.execute.call(ctx);
	results.push({ name: 'continueOnFail puts message in json.error', ok: typeof out[0][0].json.error === 'string', info: JSON.stringify(out[0][0].json).slice(0, 160) });

	// Credential test mode: replay exactly the request the credential's `test` block defines
	// (GET /v1/auth/test with the X-API-Key header) - 200 with a valid key, 401 with an invalid one.
	const { CoretoolApi } = require(path.join(ROOT, 'dist', 'credentials', 'CoretoolApi.credentials.js'));
	const credReq = new CoretoolApi().test.request;
	const credTest = async (name, key, expectStatus) => {
		try {
			const res = await fetch(credReq.baseURL + credReq.url, { method: credReq.method, headers: { 'X-API-Key': key } });
			const body = (await res.text()).slice(0, 120);
			results.push({ name, ok: res.status === expectStatus, info: `HTTP ${res.status} (expected ${expectStatus}) ${body}` });
		} catch (e) {
			results.push({ name, ok: false, info: String(e && e.message) });
		}
	};
	await credTest('credential test endpoint (200 with valid key)', API_KEY, 200);
	await credTest('credential test endpoint (401 with invalid key)', BAD_KEY, 401);

	let fails = 0;
	for (const r of results) {
		if (!r.ok) fails++;
		console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}\n      ${r.info}`);
	}
	console.log(`\n${results.length - fails}/${results.length} passed`);
	process.exit(fails ? 1 : 0);
})();
